import { SlashCommandBuilder, userMention } from "@discordjs/builders";
import { EmbedBuilder } from "discord.js";
import { Counter } from "prom-client";
import { type CommandArgs } from "../typedefs";
import getLogger, { getInteractionMeta } from "../lib/core/logging";

const log = getLogger("leaderboard");

const leaderboardCounter = new Counter({
	name: "leaderboard_command_total",
	help: "Total number of leaderboard commands ran",
});

export const command = new SlashCommandBuilder()
	.setName("leaderboard")
	.setDescription(
		"See the top users who reach the starboard and help others reach it too"
	)
	.setDMPermission(false);

export default async ({ bot }: CommandArgs) => {
	bot.onSlashCommand(command, async (interaction) => {
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

		leaderboardCounter.inc();
		log.info(
			`Showing leaderboard for ${interaction.guildId}`,
			getInteractionMeta(interaction)
		);

		await interaction.deferReply();

		const guildId = BigInt(interaction.guildId);

		const users = await bot.database.message.groupBy({
			by: ["userId"],
			_count: {
				messageId: true,
			},
			where: {
				guildId,
			},
			orderBy: {
				_count: {
					messageId: "desc",
				},
			},
			take: 10,
		});

		const givenReactions = await bot.database.starCount.findMany({
			select: {
				userId: true,
				amount: true,
			},
			where: {
				guildId,
			},
			orderBy: {
				amount: "desc",
			},
			take: 10,
		});

		const receivedReactions = await bot.database.message.groupBy({
			by: ["userId"],
			_sum: {
				count: true,
			},
			where: {
				guildId,
			},
			orderBy: {
				_sum: {
					count: "desc",
				},
			},
			take: 10,
		});

		let messageList = "There are no messages!";
		if (users.length > 0) {
			messageList = users?.reduce(
				(message, user) =>
					`${message}**${user._count.messageId}** - ${userMention(
						user.userId.toString()
					)}\n`,
				""
			);
		}

		let receivedList = "There aren't any starboard messages!";
		if (receivedReactions.length > 0) {
			receivedList = receivedReactions?.reduce(
				(message, user) =>
					`${message}**${user._sum.count ?? 0}** - ${userMention(
						user.userId.toString()
					)}\n`,
				""
			);
		}

		let givenList = "There haven't been any stars given!";
		if (givenReactions.length > 0) {
			givenList = givenReactions?.reduce(
				(message, user) =>
					`${message}**${user.amount}** - ${userMention(
						user.userId.toString()
					)}\n`,
				""
			);
		}

		void interaction.editReply({
			allowedMentions: { parse: [] },
			embeds: [
				new EmbedBuilder()
					.setTitle("Starboard Leaderboard")
					.setColor(0xfee75c)
					.setURL("https://starboard.social")
					.addFields([
						{
							name: "Most Starboard Messages",
							value: messageList,
							inline: true,
						},
						{ name: "Most ⭐️ Received", value: receivedList, inline: true },
						{ name: "Most ⭐️ Given", value: givenList },
					]),
			],
		});
	});
};
