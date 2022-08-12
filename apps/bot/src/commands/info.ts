import { formatDistance } from "date-fns";
import { Counter } from "prom-client";
import { CommandArgs } from "../typedefs";
import getLogger, { getInteractionMeta } from "../lib/core/logging";
import { SlashCommandBuilder } from "@discordjs/builders";
import { MessageEmbed } from "discord.js";
import dedent from "dedent";
import {
	getTotalGuildCount,
	getTotalMemberCount,
} from "../lib/core/metrics/discord";
import {
	getTotalMessageCount,
	getTotalStarCount,
} from "../lib/core/metrics/shields";
import { plural } from "../lib/starboard/plural";

const log = getLogger("info");

const infoCounter = new Counter({
	name: "info_command_total",
	help: "Total number of info commands ran",
});

export const command = new SlashCommandBuilder()
	.setName("info")
	.setDescription("View basic information and metrics for the Starboard bot")
	.setDMPermission(false);

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

		infoCounter.inc();
		log.info("responding to info request", getInteractionMeta(interaction));

		await interaction.deferReply();

		const guilds = await getTotalGuildCount();
		const users = await getTotalMemberCount();
		const stars = await getTotalStarCount();
		const messages = await getTotalMessageCount();

		const uptime = formatDistance(new Date(), Date.now() - (bot.uptime ?? 0));

		const embed = new MessageEmbed()
			.setTitle("Starboard Info")
			.setColor(0xfee75c)
			.setURL("https://starboard.social")
			.setDescription(
				`I listen for ⭐️ reactions and repost the best messages to a starboard channel! Source available on [GitHub](https://github.com/ianmitchell/starboard).`
			)
			.setThumbnail(bot.user.displayAvatarURL({ format: "png" }))
			.addField(
				"Stats",
				dedent`
      	  ${guilds} ${plural(guilds, "Guild", "Guilds")}
					${users} ${plural(users, "User", "Users")}
					${messages} ${plural(messages, "Message", "Messages")}
					${stars} ${plural(stars, "Reaction", "Reactions")}
	      `,
				true
			)
			.addField("Uptime", uptime, true)
			.setImage(
				"https://cdn.discordapp.com/attachments/852975798255484928/998801033625079818/standard1.gif"
			)
			.setFooter({
				text: "Developed by Desch#3091 | Server Donations: $IanMitchel1",
			});

		await interaction.editReply({
			embeds: [embed],
		});
	});
};
