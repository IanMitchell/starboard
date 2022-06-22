import {
	SlashCommandBuilder,
	SlashCommandIntegerOption,
	SlashCommandSubcommandBuilder,
} from "@discordjs/builders";
import { Permissions } from "discord.js";
import { Counter } from "prom-client";
import { CommandArgs } from "../typedefs";
import getLogger, { getInteractionMeta } from "../lib/core/logging";

const log = getLogger("amount");

const setCounter = new Counter({
	name: "amount_set_command_total",
	help: "Total number of amount set commands ran",
});

const viewCounter = new Counter({
	name: "amount_view_command_total",
	help: "Total number of amount view commands ran",
});

export const command = new SlashCommandBuilder()
	.setName("amount")
	.setDescription("Amount of reactions needed to reach the starboard")
	.setDefaultMemberPermissions(Permissions.FLAGS.MANAGE_GUILD)
	.setDMPermission(false);

const setSubcommand = new SlashCommandSubcommandBuilder()
	.setName("set")
	.setDescription(
		"Set the amount of reactions required for a message to be starred"
	)
	.addIntegerOption(
		new SlashCommandIntegerOption()
			.setName("amount")
			.setRequired(true)
			.setDescription("The amount of required reactions")
	);

const viewSubcommand = new SlashCommandSubcommandBuilder()
	.setName("view")
	.setDescription(
		"View the amount of reactions required for a message to be starred"
	);

export default async ({ bot }: CommandArgs) => {
	bot.onSlashCommand([command, setSubcommand], async (interaction) => {
		if (!interaction.inCachedGuild()) {
			log.warn("Handled an interaction in a non-cached guild");
			await interaction.reply({
				content: "Please add the bot before running this command",
				ephemeral: true,
			});
			return;
		}

		setCounter.inc();
		const amount = interaction.options.getInteger("amount", true);

		log.info(
			`Setting new amount value to ${amount}`,
			getInteractionMeta(interaction)
		);

		if (amount < 1) {
			await interaction.reply({
				content:
					"You can't have a starboard without at least one star - choose 1 or greater!",
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

	bot.onSlashCommand([command, viewSubcommand], async (interaction) => {
		if (!interaction.inCachedGuild()) {
			log.warn("Handled an interaction in a non-cached guild");
			await interaction.reply({
				content: "Please add the bot before running this command",
				ephemeral: true,
			});
			return;
		}

		viewCounter.inc();

		if (interaction.guild?.id == null) {
			log.warn("Unable to find Guild");
			await interaction.reply({
				content: "I wasn't about to find a guild for this command!",
				ephemeral: true,
			});
			return;
		}

		await interaction.deferReply({ ephemeral: true });
		const setting = await bot.database.guildSetting.findUnique({
			select: {
				amount: true,
			},
			where: {
				guildId: BigInt(interaction.guild.id),
			},
		});

		if (setting == null) {
			await interaction.editReply({
				content:
					"I wasn't able to find your guild settings. Run `/amount set` to configure it!",
			});
			return;
		}

		await interaction.editReply({
			content: `A message needs **${setting.amount}** star reactions to reach the starboard`,
		});
	});
};
