import { Interaction } from "discord.js";
import { getSerializedCommandInteractionKey } from "../commands";

export function getInteractionKey(interaction: Interaction) {
	if (interaction.isCommand() || interaction.isAutocomplete()) {
		return getSerializedCommandInteractionKey(interaction);
	}

	if (interaction.isMessageComponent()) {
		return interaction.customId;
	}

	if (interaction.isContextMenu()) {
		return interaction.commandName;
	}

	return "unknown";
}
