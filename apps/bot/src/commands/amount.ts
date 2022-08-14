import {
	SlashCommandBuilder,
	SlashCommandIntegerOption,
} from "@discordjs/builders";
import { PermissionFlagsBits } from "discord.js";
import { Counter } from "prom-client";
import { CommandArgs } from "../typedefs";
import getLogger, { getInteractionMeta } from "../lib/core/logging";

const log = getLogger("amount");

const amountCounter = new Counter({
	name: "amount_command_total",
	help: "Total number of amount commands ran",
});

export const command = new SlashCommandBuilder()
	.setName("amount")
	.setDescription(
		"Set the amount of reactions required for a message to to reach the starboard"
	)
	.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
	.setDMPermission(false)
	.addIntegerOption(
		new SlashCommandIntegerOption()
			.setName("amount")
			.setRequired(true)
			.setDescription("The amount of required reactions")
	) as SlashCommandBuilder;

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

		amountCounter.inc();
		const amount = interaction.options.getInteger("amount", true);

		if (amount < 1) {
			await interaction.reply({
				content:
					"You can't have a starboard without at least one star - choose 1 or greater!",
				ephemeral: true,
			});
			return;
		}

		log.info(
			`Setting new amount value to ${amount} in guild ${interaction.guildId}`,
			getInteractionMeta(interaction)
		);

		await interaction.deferReply({ ephemeral: true });
		await bot.database.guildSetting.upsert({
			update: {
				amount,
			},
			create: {
				guildId: BigInt(interaction.guild.id),
				amount,
			},
			where: {
				guildId: BigInt(interaction.guild.id),
			},
		});

		await interaction.editReply({
			content: `The reaction amount has been set to ${amount}`,
		});
	});
};
