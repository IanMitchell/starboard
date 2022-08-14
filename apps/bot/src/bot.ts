import type { RESTPostAPIApplicationCommandsJSONBody } from "discord-api-types/v10";
import path from "node:path";
import fs from "node:fs";
import {
	AutocompleteInteraction,
	Client,
	CommandInteraction,
	ContextMenuInteraction,
	Intents,
	Interaction,
	MessageButton,
	MessageComponentInteraction,
	MessageSelectMenu,
} from "discord.js";
import { getDirname } from "./lib/core/node/files";
import {
	ActionHandler,
	BotCommand,
	BotComponent,
	CommandModule,
	SlashCommandBuilderDefinition,
} from "./typedefs";
import database from "./lib/core/database";
import getLogger, { getInteractionMeta } from "./lib/core/logging";
import Sentry from "./lib/core/logging/sentry";
import {
	ContextMenuCommandBuilder,
	SlashCommandBuilder,
} from "@discordjs/builders";
import {
	getMergedApplicationCommandData,
	getSerializedCommandInteractionKey,
	getSlashCommandKey,
} from "./lib/core/commands";
import chalk from "chalk";
import type { PrismaClient } from "@prisma/client";
import { getError } from "./lib/core/node/error";
import { Counter } from "prom-client";
import { getInteractionKey } from "./lib/core/discord/interactions";

const log = getLogger("bot");

const interactionCounter = new Counter({
	name: "interaction_total",
	help: "Total Interactions handled",
});

export class Application extends Client {
	public readonly database: PrismaClient;
	public readonly slashCommands: Map<string, BotCommand<CommandInteraction>>;
	public readonly contextMenuCommands: Map<
		string,
		BotCommand<ContextMenuInteraction, [ContextMenuCommandBuilder]>
	>;

	public readonly autocompleteHandlers: Map<
		string,
		BotCommand<AutocompleteInteraction>
	>;

	public readonly messageComponents: Map<string, BotComponent>;

	constructor() {
		log.info("Booting up...");
		super({
			intents: [
				Intents.FLAGS.GUILDS,
				Intents.FLAGS.GUILD_MEMBERS,
				Intents.FLAGS.GUILD_WEBHOOKS,
				Intents.FLAGS.GUILD_MESSAGE_REACTIONS,
				Intents.FLAGS.GUILD_MESSAGES,
			],
			allowedMentions: { parse: ["users"] },
			partials: ["GUILD_MEMBER", "MESSAGE", "REACTION"],
		});

		this.database = database;
		this.slashCommands = new Map();
		this.contextMenuCommands = new Map();
		this.autocompleteHandlers = new Map();
		this.messageComponents = new Map();

		log.info("Loading Application Commands");
		void this.loadDirectory("commands");

		log.info("Loading Message Components");
		void this.loadDirectory("components");

		log.info("Loading Application Listeners");
		void this.loadDirectory("listeners");

		this.on("ready", this.initialize);
		this.on("interactionCreate", this.handleInteraction);
		this.on("interactionCreate", () => {
			interactionCounter.inc();
		});
		this.on("error", (error) => {
			log.fatal(error.message);
			Sentry.captureException(error);
		});
	}

	async initialize() {
		log.info("Initializing...");
		void this.registerApplicationCommands();
	}

	async loadDirectory(relativePath: string) {
		const transaction = Sentry.startTransaction({
			op: relativePath,
			name: "Loading",
		});

		log.info(`Loading ${relativePath}`);
		const directory = path.join(getDirname(import.meta.url), relativePath);

		fs.readdir(directory, async (err, files) => {
			if (err) {
				throw err;
			}

			const promises = [];

			for (const file of files) {
				promises.push(this.loadFile(directory, file));
			}

			return Promise.all(promises).then(() => {
				transaction.finish();
			});
		});
	}

	async loadFile(directory: string, file: string) {
		if (!file.endsWith(".js")) {
			return;
		}

		log.info(`Loading ${chalk.blue(file)}`);

		try {
			const data = (await import(path.join(directory, file))) as CommandModule;

			return data.default({
				bot: this,
			});
		} catch (err: unknown) {
			const error = getError(err);
			log.fatal(error.message, { file });
			Sentry.captureException(error);
			process.exit(1);
		}
	}

	getSerializedApplicationData(): RESTPostAPIApplicationCommandsJSONBody[] {
		const commands = new Map<
			string,
			SlashCommandBuilder | ContextMenuCommandBuilder
		>();

		[
			...this.slashCommands.values(),
			...this.contextMenuCommands.values(),
		].forEach((entry) => {
			const [{ name }] = entry.commands;
			if (commands.has(name)) {
				const command = commands.get(name);
				commands.set(
					name,
					getMergedApplicationCommandData(entry.commands, command)
				);
			} else {
				commands.set(name, getMergedApplicationCommandData(entry.commands));
			}
		});

		return Array.from(commands.values()).map((builder) => builder.toJSON());
	}

	async registerApplicationCommands() {
		const serializedCommands = this.getSerializedApplicationData();

		try {
			if (process.env.NODE_ENV === "production") {
				log.info("Registering Global Application Commands");
				await this.application?.commands.set(serializedCommands);
			} else {
				log.info("Registering Development Guild Application Commands");
				const target = await this.guilds.fetch(
					process.env.DEVELOPMENT_GUILD_ID!
				);
				await target.commands.set(serializedCommands);
			}
		} catch (err: unknown) {
			const error = getError(err);
			log.error(error.message, { error });
			Sentry.captureException(error);
		}
	}

	handleInteraction(interaction: Interaction) {
		const transaction = Sentry.startTransaction({
			op: getInteractionKey(interaction),
			name: "Interaction",
		});

		if (interaction.isCommand()) {
			const key = getSerializedCommandInteractionKey(interaction);

			if (this.slashCommands.has(key)) {
				try {
					this.slashCommands.get(key)?.handler(interaction);
				} catch (err: unknown) {
					const error = getError(err);
					log.error(error.message, getInteractionMeta(interaction));
					Sentry.captureException(error);
				}
			} else {
				log.error(
					`Unknown command interaction: ${key}`,
					getInteractionMeta(interaction)
				);
			}
		} else if (interaction.isMessageComponent()) {
			if (!this.messageComponents.has(interaction.customId)) {
				log.error(
					`Unknown component interaction: ${interaction.customId}`,
					getInteractionMeta(interaction)
				);
				transaction.finish();
				return;
			}

			try {
				this.messageComponents.get(interaction.customId)?.handler(interaction);
			} catch (err: unknown) {
				const error = getError(err);
				log.error(error.message, getInteractionMeta(interaction));
				Sentry.captureException(error);
			}
		} else if (interaction.isContextMenu()) {
			if (this.contextMenuCommands.has(interaction.commandName)) {
				try {
					this.contextMenuCommands
						.get(interaction.commandName)
						?.handler(interaction);
				} catch (err: unknown) {
					const error = getError(err);
					log.error(error.message, getInteractionMeta(interaction));
					Sentry.captureException(error);
				}
			} else {
				log.error(
					`Unknown context menu interaction: ${interaction.commandName}`,
					getInteractionMeta(interaction)
				);
			}
		} else if (interaction.isAutocomplete()) {
			const key = getSerializedCommandInteractionKey(interaction);

			if (this.autocompleteHandlers.has(key)) {
				try {
					this.autocompleteHandlers.get(key)?.handler(interaction);
				} catch (err: unknown) {
					const error = getError(err);
					log.error(error.message, getInteractionMeta(interaction));
					Sentry.captureException(error);
				}
			} else {
				log.error(
					`Unknown autocomplete interaction: ${key}`,
					getInteractionMeta(interaction)
				);
			}
		}

		transaction.finish();
	}

	onSlashCommand(
		command: SlashCommandBuilderDefinition,
		handler: ActionHandler<CommandInteraction>
	) {
		this.slashCommands.set(getSlashCommandKey(command), {
			commands: Array.isArray(command) ? command : [command],
			handler,
		});
	}

	onContextMenuCommand(
		command: ContextMenuCommandBuilder,
		handler: ActionHandler<ContextMenuInteraction>
	) {
		this.contextMenuCommands.set(command.name, {
			commands: [command],
			handler,
		});
	}

	onAutocomplete(
		command: SlashCommandBuilderDefinition,
		handler: ActionHandler<AutocompleteInteraction>
	) {
		this.autocompleteHandlers.set(getSlashCommandKey(command), {
			commands: Array.isArray(command) ? command : [command],
			handler,
		});
	}

	onMessageComponent(
		component: MessageButton | MessageSelectMenu,
		handler: ActionHandler<MessageComponentInteraction>
	) {
		if (component.customId != null) {
			this.messageComponents.set(component.customId, {
				component,
				handler,
			});
		}
	}
}

const bot = (() => {
	try {
		const client = new Application();
		client.login(process.env.TOKEN).catch((err: unknown) => {
			const error = getError(err);
			log.fatal(error.message);
			process.exit(1);
		});

		return client;
	} catch (err: unknown) {
		const error = getError(err);
		log.fatal(error.message);
		process.exit(1);
	}
})();
export default bot;
