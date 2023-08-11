import {
	Channel,
	NonThreadGuildBasedChannel,
	PermissionFlagsBits,
} from "discord.js";
import bot from "../../../bot.js";

export function isPublicTextChannel(channel: Channel) {
	if (!channel.isTextBased()) {
		return false;
	}

	if (channel.isDMBased()) {
		return false;
	}

	return channel
		.permissionsFor(channel.guild.roles.everyone)
		.has(PermissionFlagsBits.ViewChannel & PermissionFlagsBits.SendMessages);
}

export function canSendMessage(channel: NonThreadGuildBasedChannel | null) {
	if (channel == null || bot.user == null || !channel.isTextBased) {
		return false;
	}

	const permissions = channel.permissionsFor(bot.user);

	return permissions?.has(
		PermissionFlagsBits.SendMessages & PermissionFlagsBits.EmbedLinks
	);
}
