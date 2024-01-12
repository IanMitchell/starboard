import { ContextMenuCommandBuilder } from "@discordjs/builders";
import { ApplicationCommandType } from "discord-api-types/v10";
import * as messages from "../lib/starboard/messages.js";
import {
	ActionRowBuilder,
	type ButtonBuilder,
	PermissionFlagsBits,
} from "discord.js";
import { Counter } from "prom-client";
import { type CommandArgs } from "../typedefs.js";
import getLogger from "../lib/core/logging/logger.js";
import {
	DELETE_BUTTON_PREFIX,
	getComponent as getDeleteButton,
} from "../components/delete-message.js";
import { getInteractionMeta } from "../lib/core/logging/meta.js";

const log = getLogger("ignore");

const ignoreCounter = new Counter({
	name: "ignore_command_total",
	help: "Total number of ignore commands ran",
});

export const command = new ContextMenuCommandBuilder()
	.setType(ApplicationCommandType.Message)
	.setName("Ignore")
	.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
	.setDMPermission(false);

export default async ({ bot }: CommandArgs) => {
	bot.onContextMenuCommand(command, async (interaction) => {
		if (!interaction.isMessageContextMenuCommand()) {
			log.warn(
				"Handled a non-message context menu interaction",
				getInteractionMeta(interaction)
			);
			await interaction.reply({
				content: "Sorry, an unknown error occurred.",
				ephemeral: true,
			});
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

		ignoreCounter.inc();
		log.info(
			`Ignoring new message ${interaction.targetId}`,
			getInteractionMeta(interaction)
		);
		const message = await messages.fetchInteractionMessage(interaction);

		if (message == null) {
			log.warn(
				`Unable to find message ${interaction.targetId}`,
				getInteractionMeta(interaction)
			);
			await interaction.reply({
				content: "I wasn't about to find the target message!",
				ephemeral: true,
			});
			return;
		}

		await interaction.deferReply({ ephemeral: true });
		const blocked = await messages.ignore(message);

		if (blocked) {
			await interaction.editReply({
				content: "This message is already ignored",
			});
			return;
		}

		const messageId = BigInt(interaction.targetMessage.id);

		const exists = await bot.database.message.findUnique({
			select: {
				crosspostId: true,
			},
			where: {
				messageId,
			},
		});

		if (exists) {
			let canDelete = false;

			const logChannel = await bot.database.guildSetting.findUnique({
				select: {
					log: true,
				},
				where: {
					guildId: BigInt(interaction.guild.id),
				},
			});

			if (logChannel != null) {
				const channel = await interaction.guild.channels.fetch(
					logChannel.log.toString()
				);

				canDelete = channel
					? message.guild?.members?.me
							?.permissionsIn(channel)
							.has(PermissionFlagsBits.ManageMessages) ?? false
					: false;
			}

			if (canDelete) {
				const button = getDeleteButton(
					`${DELETE_BUTTON_PREFIX}-${messageId.toString()}`
				);

				await interaction.editReply({
					content:
						"The message has been ignored, but it already exists on the starboard. Should it be deleted?",
					components: [
						new ActionRowBuilder<ButtonBuilder>().addComponents(button),
					],
				});
			} else {
				await interaction.editReply({
					content:
						"The message has been ignored, but it already exists on the starboard.",
				});
			}

			const emoji = bot.emojis.cache.get(process.env.IGNORE_EMOJI_ID!);

			if (emoji != null) {
				await message.react(emoji);
			}

			return;
		}

		await interaction.editReply({
			content:
				"The message has been ignored, and will not be posted on the starboard.",
		});

		const emoji = bot.emojis.cache.get(process.env.IGNORE_EMOJI_ID!);

		if (emoji != null) {
			await message.react(emoji);
		}
	});
};
