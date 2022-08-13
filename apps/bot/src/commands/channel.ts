import {
	SlashCommandBuilder,
	SlashCommandChannelOption,
	SlashCommandSubcommandBuilder,
} from "@discordjs/builders";
import { CommandInteraction, MessageEmbed, Permissions } from "discord.js";
import { Counter } from "prom-client";
import { CommandArgs } from "../typedefs";
import getLogger, { getInteractionMeta } from "../lib/core/logging";

const log = getLogger("channel");

const channelListCounter = new Counter({
	name: "channel_list_command_total",
	help: "Total number of channel list commands ran",
});

const channelAddCounter = new Counter({
	name: "channel_add_command_total",
	help: "Total number of channel add commands ran",
});

const channelRemoveCounter = new Counter({
	name: "channel_remove_command_total",
	help: "Total number of channel remove commands ran",
});

const channelResetCounter = new Counter({
	name: "channel_reset_command_total",
	help: "Total number of channel reset commands ran",
});

export const command = new SlashCommandBuilder()
	.setName("channel")
	.setDescription("Add or remove channels from the starboard bot")
	.setDefaultMemberPermissions(Permissions.FLAGS.MANAGE_GUILD)
	.setDMPermission(false);

const addCommand = new SlashCommandSubcommandBuilder()
	.setName("add")
	.setDescription("Messages in this channel will be posted to starboard")
	.addChannelOption(
		new SlashCommandChannelOption()
			.setName("channel")
			.setDescription("The channel to add")
			.setRequired(true)
	);

const removeCommand = new SlashCommandSubcommandBuilder()
	.setName("remove")
	.setDescription("Messages in this channel will not be posted to starboard")
	.addChannelOption(
		new SlashCommandChannelOption()
			.setName("channel")
			.setDescription("The channel to remove")
			.setRequired(true)
	);

const resetCommand = new SlashCommandSubcommandBuilder()
	.setName("reset")
	.setDescription(
		"Removes custom settings for a channel (by default, locked channels are ignored)"
	)
	.addChannelOption(
		new SlashCommandChannelOption()
			.setName("channel")
			.setDescription("The channel to reset")
			.setRequired(true)
	);

const viewCommand = new SlashCommandSubcommandBuilder()
	.setName("list")
	.setDescription("View the current channels being watched and ignored");

export default async ({ bot }: CommandArgs) => {
	bot.onSlashCommand(
		[command, viewCommand],
		async (interaction: CommandInteraction) => {
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

			channelListCounter.inc();
			log.info(
				`Viewing Channel List for ${interaction.guildId}`,
				getInteractionMeta(interaction)
			);
			await interaction.deferReply({ ephemeral: true });

			const channelSettings = await bot.database.channelSetting.findMany({
				select: {
					channelId: true,
					visible: true,
				},
				where: {
					guildSettingGuildId: {
						equals: BigInt(interaction.guildId),
					},
				},
			});

			const embed = new MessageEmbed();
			embed.setTitle("Starboard Channels");
			embed.setDescription(
				"These are the channels I am ignoring and listening to. Any channel that isn't visible to the @everyone role is ignored by default."
			);
			embed.setColor(0xfee75c);

			const watchedChannels = channelSettings
				.filter((channel) => channel.visible)
				.map((channel) => channel.toString)
				.join("\n");

			embed.addField(
				"Watched Channels",
				// eslint-disable-next-line no-negated-condition
				watchedChannels !== "" ? watchedChannels : "_None_"
			);

			const ignoredChannels = channelSettings
				.filter((channel) => !channel.visible)
				.map((channel) => channel.toString)
				.join("\n");

			embed.addField(
				"Ignored Channels",
				// eslint-disable-next-line no-negated-condition
				ignoredChannels !== "" ? ignoredChannels : "_None_"
			);

			await interaction.editReply({
				embeds: [embed],
			});
		}
	);

	bot.onSlashCommand(
		[command, addCommand],
		async (interaction: CommandInteraction) => {
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

			channelAddCounter.inc();
			const target = interaction.options.getChannel("channel", true);
			const channelId = BigInt(target.id);
			const guildId = BigInt(interaction.guildId);
			log.info(
				`Adding channel ${channelId.toString()}`,
				getInteractionMeta(interaction)
			);

			await interaction.deferReply({ ephemeral: true });
			await bot.database.channelSetting.upsert({
				create: {
					channelId,
					visible: true,
					guild: {
						connectOrCreate: {
							create: {
								guildId,
							},
							where: {
								guildId,
							},
						},
					},
				},
				update: {
					visible: true,
				},
				where: {
					channelId: BigInt(target.id),
				},
			});

			await interaction.editReply({
				content: `I've added ${target.toString()} to the starboard!`,
			});
		}
	);

	bot.onSlashCommand(
		[command, removeCommand],
		async (interaction: CommandInteraction) => {
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

			channelRemoveCounter.inc();
			const target = interaction.options.getChannel("channel", true);
			const channelId = BigInt(target.id);
			const guildId = BigInt(interaction.guildId);
			log.info(
				`Removing channel ${channelId.toString()}`,
				getInteractionMeta(interaction)
			);

			await interaction.deferReply({ ephemeral: true });
			await bot.database.channelSetting.upsert({
				create: {
					channelId,
					visible: false,
					guild: {
						connectOrCreate: {
							create: {
								guildId,
							},
							where: {
								guildId,
							},
						},
					},
				},
				update: {
					visible: false,
				},
				where: {
					channelId: BigInt(target.id),
				},
			});

			await interaction.editReply({
				content: `I've hidden ${target.toString()} from the starboard!`,
			});
		}
	);

	bot.onSlashCommand(
		[command, resetCommand],
		async (interaction: CommandInteraction) => {
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

			channelResetCounter.inc();
			const target = interaction.options.getChannel("channel", true);
			log.info(
				`Resetting channel ${target.id} settings`,
				getInteractionMeta(interaction)
			);

			await interaction.deferReply({ ephemeral: true });
			await bot.database.channelSetting.delete({
				where: {
					channelId: BigInt(target.id),
				},
			});

			await interaction.editReply({
				content: `I've removed custom settings for ${target.toString()}`,
			});
		}
	);
};
