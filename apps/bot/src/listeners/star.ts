import { createWebhookMessage } from "../lib/starboard/webhook.js";
import { type CommandArgs } from "../typedefs.js";
import getLogger from "../lib/core/logging/logger.js";
import { isPublicTextChannel } from "../lib/core/discord/text-channels.js";
import { getError } from "../lib/core/node/error.js";
import { Counter } from "prom-client";
import Sentry from "../lib/core/logging/sentry.js";
import { getReactionMeta } from "src/lib/core/logging/meta.js";

const log = getLogger("star");
const messageSemaphores = new Set();

const reactionSubtractCount = new Counter({
	name: "total_reaction_subtracts",
	help: "All Reaction Removals",
});

const reactionAddCount = new Counter({
	name: "total_reaction_adds",
	help: "All Reaction Adds",
});

export default async ({ bot }: CommandArgs) => {
	bot.on("messageReactionRemove", async (rawReaction, rawUser) => {
		if (
			rawReaction.emoji.name !== "⭐" ||
			rawReaction.message.guildId === null ||
			rawReaction.message.author?.id === rawUser?.id
		) {
			return;
		}

		// Prevent repeat stars
		if (rawReaction.message.webhookId != null) {
			const webhook = await bot.fetchWebhook(rawReaction.message.webhookId);

			if (webhook.applicationId === bot.user?.id) {
				return;
			}
		}

		const reaction = await rawReaction.fetch();
		const user = await rawUser.fetch();
		if (reaction.message.guildId == null) {
			return;
		}

		const guildId = BigInt(reaction.message.guildId);
		const userId = BigInt(user.id);

		log.info(
			`Decrementing star tracker for ${userId.toString()} in ${guildId.toString()}`,
			getReactionMeta(reaction, user)
		);

		reactionSubtractCount.inc();
		await bot.database.starCount.upsert({
			create: {
				guildId,
				userId,
				amount: 0,
			},
			update: {
				amount: {
					decrement: 1,
				},
			},
			where: {
				userId_guildId: {
					userId,
					guildId,
				},
			},
		});
	});

	bot.on("messageReactionAdd", async (raw, rawUser) => {
		if (raw.emoji.name !== "⭐" || raw.message.author === rawUser) {
			return;
		}

		// Prevent repeat stars
		if (raw.message.webhookId != null) {
			const webhook = await bot.fetchWebhook(raw.message.webhookId);

			if (webhook.applicationId === bot.user?.id) {
				return;
			}
		}

		const reaction = raw.partial ? await raw.fetch() : raw;
		const user = rawUser.partial ? await rawUser.fetch() : rawUser;

		if (reaction.message.guildId === null || reaction.message.author == null) {
			log.warn("Unable to find reaction information");
			return;
		}

		reactionAddCount.inc();
		const guildId = BigInt(reaction.message.guildId);
		const channelId = BigInt(reaction.message.channelId);
		const messageId = BigInt(reaction.message.id);
		const userId = BigInt(user.id);
		const authorId = BigInt(reaction.message.author.id);
		const count = reaction.count ?? 0;

		log.info(
			`Processing star reaction by ${user.id} on message ${reaction.message.id}`,
			getReactionMeta(reaction, user)
		);

		await bot.database.starCount.upsert({
			create: {
				guildId,
				userId,
				amount: 1,
			},
			update: {
				amount: {
					increment: 1,
				},
			},
			where: {
				userId_guildId: {
					userId,
					guildId,
				},
			},
		});

		const blocked = await bot.database.blockedMessage.findUnique({
			select: {
				messageId: true,
			},
			where: {
				messageId,
			},
		});

		if (blocked != null) {
			log.info(`Message ${messageId.toString()} is blocked`);
			return;
		}

		const settings = await bot.database.guildSetting.findUnique({
			select: {
				amount: true,
				log: true,
			},
			where: {
				guildId,
			},
		});

		// Guild isn't fully setup yet
		if (settings?.log == null) {
			return;
		}

		// Check to see if we should process the message
		if ((reaction?.count ?? 0) < settings.amount) {
			return;
		}

		// Check to see if message exists
		const message = await bot.database.message.findUnique({
			where: {
				messageId,
			},
		});

		if (message != null) {
			log.info("Message already exists, updating count", {
				messageId: messageId.toString(),
			});
			await bot.database.message.update({
				data: {
					count,
				},
				where: {
					messageId,
				},
			});
			return;
		}

		// Prevent double posts
		if (messageSemaphores.has(reaction.message.id)) {
			return;
		}

		messageSemaphores.add(reaction.message.id);
		const channel = await reaction.message.guild?.channels.fetch(
			settings.log.toString()
		);

		if (channel == null || !channel.isTextBased() || channel.isThread()) {
			return;
		}

		const targetMessage = await reaction.message.fetch();

		const channelSettings = await bot.database.channelSetting.findUnique({
			select: {
				visible: true,
			},
			where: {
				channelId,
			},
		});

		if (
			(channelSettings == null && !isPublicTextChannel(channel)) ||
			channelSettings?.visible === false
		) {
			return;
		}

		let postId = null;

		try {
			postId = await createWebhookMessage(channel, targetMessage);
		} catch (err: unknown) {
			const error = getError(err);
			log.error(error.message, { error });
			Sentry.captureException(error);
		}

		if (postId != null) {
			await bot.database.message.create({
				data: {
					messageId,
					channelId,
					guildId,
					userId: authorId,
					count,
					crosspostId: BigInt(postId),
				},
			});
		}

		messageSemaphores.delete(reaction.message.id);
	});
};
