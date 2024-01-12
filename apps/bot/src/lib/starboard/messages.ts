import { type Message, type MessageContextMenuCommandInteraction } from "discord.js";
import bot from "../../bot";
import database from "../core/database";

export async function fetchInteractionMessage(
	interaction: MessageContextMenuCommandInteraction
) {
	const { guildId, channelId } = interaction;
	const messageId = interaction.targetMessage.id;

	if (guildId == null || channelId == null) {
		return null;
	}

	const guild = await bot.guilds.fetch(guildId);
	const channel = await guild.channels.fetch(channelId);

	if (!channel?.isTextBased()) {
		return null;
	}

	const message = await channel.messages.fetch(messageId);
	return message;
}

export async function ignore(message: Message) {
	const messageId = BigInt(message.id);

	const blocked = await database.blockedMessage.findUnique({
		select: {
			messageId: true,
		},
		where: {
			messageId,
		},
	});

	if (blocked) {
		return true;
	}

	await database.blockedMessage.create({
		data: {
			messageId,
		},
	});

	return false;
}
