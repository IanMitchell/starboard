import { ButtonBuilder } from "@discordjs/builders";
import { ButtonStyle } from "discord-api-types/v10";
import {
	Message,
	MessageActionRow,
	NewsChannel,
	TextChannel,
} from "discord.js";

export async function createWebhookMessage(
	channel: TextChannel | NewsChannel,
	message: Message
) {
	const webhook = await channel.createWebhook(message.author.username, {
		avatar: message.author.avatarURL({
			format: "png",
		}),
	});

	const link = new ButtonBuilder()
		.setStyle(ButtonStyle.Link)
		.setURL(message.url)
		.setEmoji({ name: "🔗" })
		.setLabel("View Original")
		.toJSON();

	const attachments = Array.from(message.attachments.values()).map(
		(attachment) => {
			return attachment.url;
		}
	);

	// TODO: Add support for image metadata
	const post = await webhook.send({
		content: message.content,
		files: attachments,
		components: [new MessageActionRow().addComponents(link)],
	});

	await webhook.delete();

	return post;
}
