import {
	SlashCommandBuilder,
	SlashCommandChannelOption,
} from "@discordjs/builders";
import { PermissionFlagsBits, ChannelType } from "discord.js";
import { Counter } from "prom-client";
import { type CommandArgs } from "../typedefs";
import getLogger, { getInteractionMeta } from "../lib/core/logging";

const log = getLogger("starboard");

const starboardCounter = new Counter({
	name: "starboard_command_total",
	help: "Total number of starboard commands ran",
});

export const command = new SlashCommandBuilder()
	.setName("starboard")
	.setDescription("Set the channel the bot will post starred messages to")
	.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
	.setDMPermission(false)
	.addChannelOption(
		new SlashCommandChannelOption()
			.setName("channel")
			.setRequired(true)
			.setDescription("The channel to post starred messages to")
			.addChannelTypes(ChannelType.GuildNews, ChannelType.GuildText)
	) as SlashCommandBuilder;

export default async ({ bot }: CommandArgs) => {
	bot.onSlashCommand(command, async (interaction) => {
		if (bot.user == null) {
			return;
		}

		if (!interaction.inCachedGuild()) {
			log.warn(
				`Handled an interaction in a non-cached guild ${
					interaction.guildId ?? "[unknown]"
				}`,
				getInteractionMeta(interaction)
			);
			return interaction.reply({
				content: "Please add the bot before running this command",
				ephemeral: true,
			});
		}

		starboardCounter.inc();
		let target;

		try {
			target = await interaction.options.getChannel("channel", true).fetch();
		} catch (err: unknown) {
			log.error(
				`Failed to fetch channel ${
					interaction.options.getChannel("channel", true)?.id
				} in ${interaction.guildId}`,
				getInteractionMeta(interaction)
			);
			await interaction.reply({
				content:
					"Sorry, I wasn't able to find that channel. I may not have access to it!",
				ephemeral: true,
			});
			return;
		}

		log.info(
			`Setting starboard channel to ${target.id} in ${interaction.guildId}`,
			getInteractionMeta(interaction)
		);

		if (!target.isTextBased() || target.isThread()) {
			await interaction.reply({
				content: "Please choose a text or announcement channel",
				ephemeral: true,
			});
			return;
		}

		await interaction.deferReply({ ephemeral: true });
		const guildId = BigInt(interaction.guild.id);
		let oldWebhook;

		// Cleanup old Webhook
		const previous = await bot.database.guildSetting.findUnique({
			select: {
				log: true,
			},
			where: {
				guildId,
			},
		});

		if (previous?.log != null && previous.log > 0n) {
			const oldChannel = await bot.channels.fetch(previous.log.toString());

			if (
				// eslint-disable-next-line @typescript-eslint/prefer-optional-chain
				oldChannel != null &&
				oldChannel.isTextBased() &&
				!oldChannel.isThread() &&
				!oldChannel.isDMBased()
			) {
				const oldWebhooks = await oldChannel.fetchWebhooks();
				oldWebhook = oldWebhooks.find(
					(webhook) => webhook.applicationId === bot.application?.id
				);
			}
		}

		try {
			log.info("Creating Webhook");
			const webhook = await target.createWebhook({ name: "Starboard Bot" });
		} catch {
			await interaction.editReply({
				content: `Sorry, I was unable to create a webhook in ${target.toString()}! Make sure the channel has room for a new webhook and that I have permission to create one.`,
			});
			return;
		}

		await oldWebhook?.delete();

		// Update Settings
		await bot.database.guildSetting.upsert({
			update: {
				log: BigInt(target.id),
			},
			create: {
				guildId,
				log: BigInt(target.id),
			},
			where: {
				guildId,
			},
		});

		const member = await interaction.guild.members.fetch(bot.user);
		if (
			member != null &&
			!target
				.permissionsFor(member)
				.has(
					PermissionFlagsBits.ManageMessages |
						PermissionFlagsBits.ManageWebhooks
				)
		) {
			await interaction.editReply({
				content: `The starboard channel has been updated, but I don't have all the permissions I need. Please give me the **Manage Webhook** and **Manage Messages** permissions in ${target.toString()}!`,
			});
			return;
		}

		await interaction.editReply({
			content: `The Starboard channel has been set to ${target.toString()}`,
		});
	});
};
