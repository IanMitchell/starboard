import type { RESTPostAPIApplicationCommandsJSONBody } from "discord-api-types/v10";
import path from "node:path";
import fs from "node:fs";
import {
	type AutocompleteInteraction,
	type ButtonComponent,
	type ChatInputCommandInteraction,
	Client,
	type ContextMenuCommandInteraction,
	IntentsBitField,
	type Interaction,
	InteractionType,
	type MessageComponentInteraction,
	type MessageContextMenuCommandInteraction,
	Partials,
	type SelectMenuComponent,
	type UserContextMenuCommandInteraction,
} from "discord.js";
import { getDirname } from "./lib/core/node/files.js";
import {
	type ActionHandler,
	type BotCommand,
	type BotComponent,
	type CommandModule,
	type SlashCommandBuilderDefinition,
} from "./typedefs.js";
import database from "./lib/core/database.js";
import getLogger from "./lib/core/logging/logger.js";
import Sentry from "./lib/core/logging/sentry.js";
import {
	type ContextMenuCommandBuilder,
	type SlashCommandBuilder,
} from "@discordjs/builders";
import {
	getMergedApplicationCommandData,
	getSerializedCommandInteractionKey,
	getSlashCommandKey,
} from "./lib/core/commands.js";
import chalk from "chalk";
import type { PrismaClient } from "@prisma/client";
import { getError } from "./lib/core/node/error.js";
import { Counter } from "prom-client";
import { getInteractionKey } from "./lib/core/discord/interactions.js";
import { getInteractionMeta } from "./lib/core/logging/meta.js";

const log = getLogger("bot");

const interactionCounter = new Counter({
	name: "interaction_total",
	help: "Total Interactions handled",
});

const eventHistogram = new Counter({
	name: "event_total",
	help: "Total Events received",
	labelNames: ["type"],
});

export class Application extends Client {
	public readonly database: PrismaClient;
	public readonly slashCommands: Map<
		string,
		BotCommand<ChatInputCommandInteraction>
	>;

	public readonly contextMenuCommands: Map<
		string,
		BotCommand<
			UserContextMenuCommandInteraction | MessageContextMenuCommandInteraction,
			[ContextMenuCommandBuilder]
		>
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
				IntentsBitField.Flags.Guilds,
				IntentsBitField.Flags.GuildMembers,
				IntentsBitField.Flags.GuildWebhooks,
				IntentsBitField.Flags.GuildMessageReactions,
				IntentsBitField.Flags.GuildMessages,
			],
			allowedMentions: { parse: ["users"] },
			partials: [Partials.GuildMember, Partials.Message, Partials.Reaction],
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

		this.on("raw", (data: any) => {
			if (!data.t) {
				return;
			}

			eventHistogram.labels(data.t as string).inc();
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

	async handleInteraction(interaction: Interaction) {
		const transaction = Sentry.startTransaction({
			op: getInteractionKey(interaction),
			name: "Interaction",
		});

		switch (interaction.type) {
			case InteractionType.ApplicationCommand: {
				if (interaction.isChatInputCommand()) {
					const key = getSerializedCommandInteractionKey(interaction);
					if (this.slashCommands.has(key)) {
						try {
							await this.slashCommands.get(key)?.handler(interaction);
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
				} else if (interaction.isContextMenuCommand()) {
					if (this.contextMenuCommands.has(interaction.commandName)) {
						try {
							await this.contextMenuCommands
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
				}

				break;
			}

			case InteractionType.MessageComponent: {
				if (!this.messageComponents.has(interaction.customId)) {
					log.error(
						`Unknown component interaction: ${interaction.customId}`,
						getInteractionMeta(interaction)
					);
					transaction.finish();
					return;
				}

				try {
					await this.messageComponents
						.get(interaction.customId)
						?.handler(interaction);
				} catch (err: unknown) {
					const error = getError(err);
					log.error(error.message, getInteractionMeta(interaction));
					Sentry.captureException(error);
				}

				break;
			}

			case InteractionType.ApplicationCommandAutocomplete: {
				const key = getSerializedCommandInteractionKey(interaction);

				if (this.autocompleteHandlers.has(key)) {
					try {
						await this.autocompleteHandlers.get(key)?.handler(interaction);
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

				break;
			}

			default: {
				log.error(
					`Unknown Interaction Type ${interaction.type}`,
					getInteractionMeta(interaction)
				);
			}
		}

		transaction.finish();
	}

	onSlashCommand(
		command: SlashCommandBuilderDefinition,
		handler: ActionHandler<ChatInputCommandInteraction>
	) {
		this.slashCommands.set(getSlashCommandKey(command), {
			commands: Array.isArray(command) ? command : [command],
			handler,
		});
	}

	onContextMenuCommand(
		command: ContextMenuCommandBuilder,
		handler: ActionHandler<ContextMenuCommandInteraction>
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
		component: ButtonComponent | SelectMenuComponent,
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
