import {
	Channel,
	DMChannel,
	NonThreadGuildBasedChannel,
	Permissions,
} from "discord.js";
import bot from "../../../bot";

export function isPublicTextChannel(channel: Channel) {
	if (!channel.isText()) {
		return false;
	}

	if (channel instanceof DMChannel) {
		return false;
	}

	return channel
		.permissionsFor(channel.guild.roles.everyone)
		.has(Permissions.FLAGS.VIEW_CHANNEL & Permissions.FLAGS.SEND_MESSAGES);
}

export function canSendMessage(channel: NonThreadGuildBasedChannel | null) {
	if (channel == null || bot.user == null || !channel.isText()) {
		return false;
	}

	const permissions = channel.permissionsFor(bot.user);

	return permissions?.has(
		Permissions.FLAGS.SEND_MESSAGES & Permissions.FLAGS.EMBED_LINKS
	);
}
