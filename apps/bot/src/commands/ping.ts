import { SlashCommandBuilder } from "@discordjs/builders";
import { Counter } from "prom-client";
import getLogger, { getInteractionMeta } from "../lib/core/logging/index.js";
import { CommandArgs } from "../typedefs.js";

const log = getLogger("ping");

const pingCounter = new Counter({
	name: "ping_command_total",
	help: "Total number of ping commands ran",
});

export const command = new SlashCommandBuilder()
	.setName("ping")
	.setDescription("If the bot is online, you'll get a pong");

export default async ({ bot }: CommandArgs) => {
	bot.onSlashCommand(command, (interaction) => {
		pingCounter.inc();
		log.info("Generating response", getInteractionMeta(interaction));

		void interaction.reply({
			content: `🏓 pong! ${bot.ws.ping}ms`,
			ephemeral: true,
		});
	});
};
