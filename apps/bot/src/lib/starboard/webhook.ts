import { ButtonBuilder } from "@discordjs/builders";
import { ButtonStyle } from "discord-api-types/v10";
import {
	ActionRowBuilder,
	Message,
	NewsChannel,
	TextChannel,
	VoiceChannel,
	WebhookMessageOptions,
} from "discord.js";

export async function createWebhookMessage(
	channel: TextChannel | NewsChannel | VoiceChannel,
	message: Message
) {
	const webhook = await channel.createWebhook({
		name: message.author.username,
		avatar: message.author.avatarURL({
			extension: "png",
		}),
	});

	const link = new ButtonBuilder()
		.setStyle(ButtonStyle.Link)
		.setURL(message.url)
		.setEmoji({ name: "🔗" })
		.setLabel("View Original");

	const attachments = [...message.attachments.values()];

	const embeds = Array.from(message.embeds.values()).map((embed) =>
		embed.toJSON()
	);

	const webhookMessage: Omit<WebhookMessageOptions, "flags"> = {};

	if (message.content != null && message.content.length > 0) {
		webhookMessage.content = message.content;
	}

	if (attachments.length > 0) {
		webhookMessage.files = attachments;
	}

	if (embeds.length > 0) {
		webhookMessage.embeds = embeds;
	}

	const post = await webhook.send({
		...webhookMessage,
		components: [new ActionRowBuilder<ButtonBuilder>().addComponents(link)],
		allowedMentions: { parse: [] },
	});

	await webhook.delete();

	return post.id;
}
