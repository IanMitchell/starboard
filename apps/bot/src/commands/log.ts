import {
	SlashCommandBuilder,
	SlashCommandChannelOption,
} from "@discordjs/builders";
import { Permissions } from "discord.js";
import { Counter } from "prom-client";
import { CommandArgs } from "../typedefs";
import getLogger, { getInteractionMeta } from "../lib/core/logging";

const log = getLogger("log");

const logCounter = new Counter({
	name: "log_command_total",
	help: "Total number of log commands ran",
});

export const command = new SlashCommandBuilder()
	.setName("log")
	.setDescription("Set the channel the bot will post starred messages to")
	.setDefaultMemberPermissions(Permissions.FLAGS.MANAGE_GUILD)
	.setDMPermission(false)
	.addChannelOption(
		new SlashCommandChannelOption()
			.setName("channel")
			.setRequired(true)
			.setDescription("The channel to post starred messages to")
	) as SlashCommandBuilder;

export default async ({ bot }: CommandArgs) => {
	bot.onSlashCommand(command, async (interaction) => {
		if (bot.user == null) {
			return;
		}

		if (!interaction.inCachedGuild()) {
			log.warn("Handled an interaction in a non-cached guild");
			await interaction.reply({
				content: "Please add the bot before running this command",
				ephemeral: true,
			});
			return;
		}

		logCounter.inc();
		log.info("Setting new log channel", getInteractionMeta(interaction));

		const target = await interaction.options
			.getChannel("channel", true)
			.fetch();

		if (interaction.guild?.id == null) {
			log.warn("Unable to find Guild");
			await interaction.reply({
				content: "I wasn't about to find a guild for this command!",
				ephemeral: true,
			});
			return;
		}

		if (!target.isText()) {
			await interaction.reply({
				content: "Please choose a text or announcement channel",
				ephemeral: true,
			});
			return;
		}

		await interaction.deferReply({ ephemeral: true });
		await bot.database.guildSetting.upsert({
			update: {
				log: BigInt(target.id),
			},
			create: {
				guildId: BigInt(interaction.guild.id),
				log: BigInt(target.id),
			},
			where: {
				guildId: BigInt(interaction.guild.id),
			},
		});

		const member = await interaction.guild.members.fetch(bot.user);
		if (
			member != null &&
			!target
				.permissionsFor(member)
				.has(
					Permissions.FLAGS.MANAGE_MESSAGES | Permissions.FLAGS.MANAGE_WEBHOOKS
				)
		) {
			await interaction.editReply({
				content: `The starboard log channel has been updated, but I don't have all the permissions I need. Please give me the **Manage Webhook** and **Manage Messages** permissions in ${target.toString()}!`,
			});
			return;
		}

		await interaction.editReply({
			content: `The Starboard log channel has been set to ${target.toString()}`,
		});
	});
};
