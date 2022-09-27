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
import bot from "../../bot";
import getLogger from "../core/logging";

const log = getLogger("webhook");

export async function createWebhookMessage(
	channel: TextChannel | NewsChannel | VoiceChannel,
	message: Message
) {
	const webhooks = await channel.fetchWebhooks();
	let webhook = webhooks.find(
		(webhook) => webhook.applicationId === bot.application?.id
	);

	if (webhook == null) {
		log.warn("No webhook found, creating one");
		webhook = await channel.createWebhook({ name: "Starboard Reaction" });
	}

	const link = new ButtonBuilder()
		.setStyle(ButtonStyle.Link)
		.setURL(message.url)
		.setEmoji({ name: "🔗" })
		.setLabel(
			`Posted in #${channel.name.length > 68 ? channel.name.slice(0, 67) + "…" : channel.name}`
		);


	const attachments = [...message.attachments.values()];

	const embeds = Array.from(message.embeds.values()).map((embed) =>
		embed.toJSON()
	);

	const webhookMessage: Omit<WebhookMessageOptions, "flags"> = {
		username: message.author.username,
		avatarURL:
			message.author.avatarURL({
				extension: "png",
			}) ?? undefined,
	};

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

	return post.id;
}
