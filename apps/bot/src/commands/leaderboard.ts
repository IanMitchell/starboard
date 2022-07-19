import { SlashCommandBuilder, userMention } from "@discordjs/builders";
import { CommandInteraction, MessageEmbed } from "discord.js";
import { Counter } from "prom-client";
import { CommandArgs } from "../typedefs";
import getLogger, { getInteractionMeta } from "../lib/core/logging";
import { plural } from "../lib/starboard/plural";

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
	bot.onSlashCommand(command, async (interaction: CommandInteraction) => {
		if (!interaction.inCachedGuild()) {
			await interaction.reply({
				content: "Please add the bot before running this command",
				ephemeral: true,
			});
			return;
		}

		if (interaction.guild?.id == null) {
			log.warn("Unable to find Guild");
			await interaction.reply({
				content: "I wasn't about to find a guild for this command!",
				ephemeral: true,
			});
			return;
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
				(message, user, index) =>
					`${message}**${index + 1}.** ${userMention(
						user.userId.toString()
					)}, ${user._count.messageId.toString()} ${plural(
						user._count.messageId,
						"message",
						"messages"
					)}\n`,
				""
			);
		}

		let receivedList = "There aren't any starboard messages!";
		if (receivedReactions.length > 0) {
			receivedList = receivedReactions?.reduce(
				(message, user, index) =>
					`${message}**${index + 1}.** ${userMention(
						user.userId.toString()
					)}, ${(user._sum.count ?? 0).toString()} ${plural(
						user._sum.count ?? 0,
						"star",
						"stars"
					)}\n`,
				""
			);
		}

		let givenList = "There haven't been any stars given!";
		if (givenReactions.length > 0) {
			givenList = givenReactions?.reduce(
				(message, user, index) =>
					`${message}**${index + 1}.** ${userMention(
						user.userId.toString()
					)} - ${user.amount} ${plural(user.amount, "star", "stars")}\n`,
				""
			);
		}

		void interaction.editReply({
			allowedMentions: {},
			embeds: [
				new MessageEmbed()
					.setTitle("Starboard Leaderboard")
					.setColor(0xfee75c)
					.setURL("https://starboard.social")
					.addField("Most Starboard Messages", messageList, true)
					.addField("Most Stars Received", receivedList, true)
					.addField("Most Stars Given", givenList),
			],
		});
	});
};
