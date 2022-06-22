import { ButtonBuilder } from "@discordjs/builders";
import { ButtonStyle } from "discord-api-types/v10";
import { Counter } from "prom-client";
import { CommandArgs } from "../typedefs";
import getLogger, { getInteractionMeta } from "../lib/core/logging";
import { Permissions } from "discord.js";
import { getError } from "../lib/core/node/error";

const log = getLogger("delete-message");

const deleteCounter = new Counter({
	name: "delete_button_total",
	help: "Total number of delete buttons pressed",
});

export const DELETE_BUTTON_PREFIX = "delete-starboard-message";

export function getComponent(customId: string) {
	return new ButtonBuilder()
		.setStyle(ButtonStyle.Danger)
		.setEmoji({ name: "🚮" })
		.setLabel("Delete Starboard Message")
		.setCustomId(customId);
}

export default async ({ bot }: CommandArgs) => {
	bot.on("interactionCreate", async (interaction) => {
		if (
			interaction.isMessageComponent() &&
			interaction.customId.startsWith(DELETE_BUTTON_PREFIX)
		) {
			deleteCounter.inc();
			const { guild } = interaction;

			if (guild == null) {
				log.warn("Handled an interaction in an unknown guild");
				await interaction.reply({
					content: "I wasn't about to find a guild for this command!",
					ephemeral: true,
				});
				return;
			}

			if (guild.me == null) {
				log.warn("Was not able to find bot user in guild");
				await interaction.reply({
					content: "I wasn't able to find myself in this guild!",
					ephemeral: true,
				});
				return;
			}

			const targetId = BigInt(
				interaction.customId.substring(DELETE_BUTTON_PREFIX.length + 1)
			);
			log.info(`Deleting message ${targetId}`, getInteractionMeta(interaction));

			await interaction.deferReply({ ephemeral: true });
			const message = await bot.database.message.findUnique({
				select: {
					crosspostId: true,
					channelId: true,
				},
				where: {
					messageId: targetId,
				},
			});

			if (message == null) {
				await interaction.editReply({
					content: "It looks like that message has already been deleted!",
				});
				return;
			}

			const settings = await bot.database.guildSetting.findUnique({
				select: {
					log: true,
				},
				where: {
					guildId: BigInt(guild.id),
				},
			});

			if (settings == null) {
				await interaction.editReply({
					content: "I wasn't able to find your starboard log channel",
				});
				return;
			}

			const channel = await guild?.channels.fetch(settings.log.toString());

			if (!channel?.isText()) {
				await interaction.editReply({
					content: "I wasn't able to find the channel the message came from.",
				});
				return;
			}

			if (
				!channel.permissionsFor(guild.me).has(Permissions.FLAGS.MANAGE_MESSAGES)
			) {
				await interaction.editReply({
					content:
						"I don't have permission to delete messages in this channel.",
				});
				return;
			}

			const target = await channel.messages.fetch(
				message.crosspostId.toString()
			);
			const deleted = await target.delete();

			if (!deleted) {
				log.warn("Unable to delete message");
				await interaction.editReply({
					content: "Sorry, I wasn't able to delete that message.",
				});
				return;
			}

			try {
				await bot.database.message.delete({
					where: {
						messageId: targetId,
					},
				});
			} catch (err: unknown) {
				const error = getError(err);
				log.error(error.message, { error });
			}

			await interaction.editReply({
				content: "The message has been deleted!",
			});
		}
	});
};
