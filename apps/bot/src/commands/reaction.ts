import {
	SlashCommandBuilder,
	SlashCommandIntegerOption,
	SlashCommandSubcommandBuilder,
} from "@discordjs/builders";
import { PermissionFlagsBits } from "discord.js";
import { Counter } from "prom-client";
import { CommandArgs } from "../typedefs.js";
import getLogger, { getInteractionMeta } from "../lib/core/logging/index.js";

const log = getLogger("amount");

const reactionSetCounter = new Counter({
	name: "reaction_command_total",
	help: "Total number of amount commands ran",
});

export const command = new SlashCommandBuilder()
	.setName("reaction")
	.setDescription(
		"Set the emojis required for a message to to reach the starboard"
	)
	.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
	.setDMPermission(false);

const addCommand = new SlashCommandSubcommandBuilder()
	.setName("add")
	.setDescription("Add an emoji to the starboard")
	.addStringOption((option) =>
		option.setName("emoji").setDescription("The emoji to add").setRequired(true)
	);

const removeCommand = new SlashCommandSubcommandBuilder()
	.setName("remove")
	.setDescription("Remove an emoji from the starboard")
	.addStringOption((option) =>
		option
			.setName("emoji")
			.setDescription("The emoji to remove")
			.setRequired(true)
	);

const listCommand = new SlashCommandSubcommandBuilder()
	.setName("list")
	.setDescription("List the emojis on the starboard");

export default async ({ bot }: CommandArgs) => {
	bot.onSlashCommand([command, addCommand], async (interaction) => {
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

		reactionSetCounter.inc();

		const emoji = interaction.options.getString("emoji", true);

		if (!emoji) {
			await interaction.reply({
				content: "Invalid emoji",
				ephemeral: true,
			});
			return;
		}

		log.info(
			`Adding emoji ${emoji} to guild ${interaction.guildId}`,
			getInteractionMeta(interaction)
		);

		await interaction.deferReply({ ephemeral: true });

		// resolve the emoji to be either a guild emoji or a unicode emoji

		const guildEmojiRegex = /^(?:<a?:\w+:)?(?<id>\d{17,19})>?$/;

		if (guildEmojiRegex.test(emoji)) {
			const match = guildEmojiRegex.exec(emoji);

			if (!match?.groups?.id || isNaN(Number(match.groups.id))) {
				await interaction.editReply({
					content: "Invalid emoji",
				});
				return;
			}

			const emojiId = match.groups.id;

			const guildEmoji = interaction.guild.emojis.resolve(emojiId);

			if (!guildEmoji) {
				await interaction.editReply({
					content: "Emoji must be from this server",
				});
				return;
			}

			const isAlreadyAdded = await bot.database.guildSetting.findUnique({
				where: {
					guildId: BigInt(interaction.guild.id),
				},
				select: {
					customEmoji: true,
				},
			});

			if (!isAlreadyAdded) {
				// guild isn't in the database yet
				// TODO
				return;
			}

			if (isAlreadyAdded.customEmoji.includes(BigInt(guildEmoji.id))) {
				await interaction.editReply({
					content: "Successfully added emoji",
				});
				return;
			}

			if (isAlreadyAdded.customEmoji.length >= 20) {
				await interaction.editReply({
					content: "You can only have 20 emojis on the starboard",
				});
				return;
			}

			await bot.database.guildSetting.upsert({
				update: {
					customEmoji: {
						push: BigInt(guildEmoji.id),
					},
				},
				create: {
					guildId: BigInt(interaction.guild.id),
					customEmoji: [BigInt(guildEmoji.id)],
				},
				where: {
					guildId: BigInt(interaction.guild.id),
				},
			});

			await interaction.editReply({
				content: "Successfully added emoji",
			});
		} else {
			// this is a unicode emoji
			// validate that it's a valid emoji

			const unicodeEmojiRegex =
				/^(?:\p{RI}\p{RI}|\p{Emoji}(\p{Lm}+|\u{FE0F}\u{20E3}?|[\u{E0020}-\u{E007E}]+\u{E007F})?(\u{200D}\p{Emoji}(\p{EMod}+|\u{FE0F}\u{20E3}?|[\u{E0020}-\u{E007E}]+\u{E007F})?)+|\p{EPres}(\p{EMod}+|\u{FE0F}\u{20E3}?|[\u{E0020}-\u{E007E}]+\u{E007F})?|\p{Emoji}(\p{EMod}+|\u{FE0F}\u{20E3}?|[\u{E0020}-\u{E007E}]+\u{E007F}))$/gu;

			if (!unicodeEmojiRegex.test(emoji)) {
				await interaction.editReply({
					content: "Invalid emoji",
				});
				return;
			}

			const isAlreadyAdded = await bot.database.guildSetting.findUnique({
				where: {
					guildId: BigInt(interaction.guild.id),
				},
			});

			if (!isAlreadyAdded) {
				// guild isn't in the database yet
				// TODO
				return;
			}

			if (isAlreadyAdded.unicodeEmoji.includes(emoji)) {
				await interaction.editReply({
					content: "Successfully added emoji",
				});
				return;
			}

			if (isAlreadyAdded.unicodeEmoji.length >= 20) {
				await interaction.editReply({
					content: "You can only have 10 unicode emojis on the starboard",
				});
				return;
			}

			await bot.database.guildSetting.update({
				data: {
					unicodeEmoji: {
						push: emoji,
					},
				},
				where: {
					guildId: BigInt(interaction.guild.id),
				},
			});

			await interaction.editReply({
				content: "Successfully added emoji",
			});
		}
	});

	bot.onSlashCommand([command, removeCommand], async (interaction) => {
		await interaction.reply("TODO");
	});

	bot.onSlashCommand([command, listCommand], async (interaction) => {
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

		reactionSetCounter.inc();

		await interaction.deferReply({ ephemeral: true });

		const guildId = BigInt(interaction.guild.id);

		const guildSettings = await bot.database.guildSetting.findUnique({
			where: {
				guildId,
			},
			select: {
				customEmoji: true,
				unicodeEmoji: true,
				amount: true,
			},
		});

		if (!guildSettings) {
			await interaction.editReply({
				content: "No emojis added yet",
			});
			return;
		}

		await interaction.editReply({
			content: `
# Starboard for this server

You can react to messages with any of the following emojis to add them to the starboard.

Any emoji must have over ${
				guildSettings.amount
			} reactions to be added to the starboard.
				
${
	guildSettings.customEmoji.length
		? `## Custom emoji\n- ${guildSettings.customEmoji
				.map((emoji) => `<:_:${emoji}>`)
				.join("\n- ")}`
		: ""
}

${
	guildSettings.unicodeEmoji.length
		? `## Unicode emoji\n- ${guildSettings.unicodeEmoji.join("\n- ")}`
		: ""
}
`.replace(/\n\s+/g, "\n"),
		});
	});
};
