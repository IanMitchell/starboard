import {
	type Channel,
	type Message,
	type PartialDMChannel,
	type MessageReaction,
	type User,
	type BaseInteraction,
} from "discord.js";

export function getChannelMeta(
	channel: PartialDMChannel | Channel | null
): Record<string, unknown> {
	if (channel == null) {
		return {};
	}

	const meta: Record<string, unknown> = {
		id: channel.id,
		type: channel.type,
	};

	if (channel.partial) {
		meta.partial = true;
		return meta;
	}

	if (channel.isTextBased() && !channel.isDMBased()) {
		meta.name = channel.name;
	}

	return meta;
}

export function getMessageMeta(message: Message): Record<string, unknown> {
	return {
		guild: {
			id: message?.guild?.id,
			name: message?.guild?.name,
		},
		channel: getChannelMeta(message.channel),
		author: {
			id: message?.author?.id,
			name: message?.author?.username,
			tag: message?.author?.tag,
		},
		content: message?.cleanContent,
	};
}

export function getInteractionMeta(
	interaction: BaseInteraction
): Record<string, unknown> {
	const meta: Record<string, unknown> = {
		guild: {
			id: interaction?.guildId,
			name: interaction?.guild?.name,
		},
		channel: getChannelMeta(interaction.channel),
		author: {
			id: interaction?.user?.id,
			name: interaction?.user?.username,
			tag: interaction?.user?.tag,
		},
	};

	// TODO: clean this up
	if (interaction.isCommand()) {
		meta.type = "command";
		meta.options = interaction.options?.data?.map((option) => ({
			name: option.name,
			value: option.value,
		}));
	}

	if (interaction.isContextMenuCommand()) {
		meta.type = "contextMenu";
	}

	if (interaction.isButton()) {
		meta.type = "button";
		meta.customId = interaction.customId;
	}

	return meta;
}

export function getReactionMeta(
	reaction: MessageReaction,
	user: User
): Record<string, unknown> {
	return {
		guild: {
			id: reaction?.message?.guildId,
			name: reaction?.message?.guild?.name,
		},
		channel: getChannelMeta(reaction.message.channel),
		user: {
			id: user.id,
			name: user.username,
			tag: user.tag,
		},
		content: reaction?.message?.cleanContent,
		emoji: {
			name: reaction?.emoji?.name,
			id: reaction?.emoji?.id,
			animated: reaction?.emoji?.animated,
		},
		count: reaction.count,
	};
}
