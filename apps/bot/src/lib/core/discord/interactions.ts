import { type Interaction, InteractionType } from "discord.js";
import { getSerializedCommandInteractionKey } from "../commands.js";

export function getInteractionKey(interaction: Interaction) {
	switch (interaction.type) {
		case InteractionType.ApplicationCommand:
		case InteractionType.ApplicationCommandAutocomplete:
			if (interaction.isContextMenuCommand()) {
				return interaction.commandName;
			}

			return getSerializedCommandInteractionKey(interaction);
		case InteractionType.MessageComponent:
		case InteractionType.ModalSubmit:
			return interaction.customId;
		default:
			return "unknown";
	}
}
