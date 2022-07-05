import { SlashCommandBuilder, userMention } from "@discordjs/builders";
import { CommandInteraction, MessageEmbed } from "discord.js";
import { Counter } from "prom-client";
import { CommandArgs } from "../typedefs";
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
			where: {
				guildId,
			},
			orderBy: {
				count: "desc",
			},
			take: 10,
		});

		const reactions = await bot.database.starCount.findMany({
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

		const messageList =
			users?.reduce(
				(message, user, index) =>
					`${message}**${index}.** ${userMention(user.userId)}, ${
						user.count
					} messages\n`,
				""
			) ?? "There are no messages!";

		const reactionList =
			reactions?.reduce(
				(message, user, index) =>
					`${message}**${index}.** ${userMention(user.userId.toString())} - ${
						user.amount
					} stars\n`,
				""
			) ?? "There are no reactions!";

		void interaction.editReply({
			allowedMentions: {},
			embeds: [
				new MessageEmbed()
					.setTitle("Starboard Leaderboard")
					.setColor() // yellow
					.setURL("https://starboard.social")
					.addField("Top Messages", messageList, true)
					.addField("Top Reactions", reactionList, true),
			],
		});
	});
};
