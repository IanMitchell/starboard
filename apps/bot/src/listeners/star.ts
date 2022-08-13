import { createWebhookMessage } from "../lib/starboard/webhook";
import { CommandArgs } from "../typedefs";
import getLogger, { getReactionMeta } from "../lib/core/logging";
import { isPublicTextChannel } from "../lib/core/discord/text-channels";
import { getError } from "../lib/core/node/error";
import Sentry from "../lib/core/logging/sentry";

const log = getLogger("star");
const messageSemaphores = new Set();

export default async ({ bot }: CommandArgs) => {
	bot.on("messageReactionRemove", async (reaction, user) => {
		if (
			reaction.emoji.name !== "⭐" ||
			reaction.message.guildId === null ||
			reaction.message.author === user
		) {
			return;
		}

		const guildId = BigInt(reaction.message.guildId);
		const userId = BigInt(user.id);

		log.info(
			`Decrementing star tracker for ${userId.toString()} in ${guildId.toString()}`,
			{
				guildId,
				userId,
			}
		);

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

		const reaction = raw.partial ? await raw.fetch() : raw;
		const user = rawUser.partial ? await rawUser.fetch() : rawUser;

		if (reaction.message.guildId === null || reaction.message.author == null) {
			log.warn("Unable to find reaction information");
			return;
		}

		const guildId = BigInt(reaction.message.guildId);
		const channelId = BigInt(reaction.message.channelId);
		const messageId = BigInt(reaction.message.id);
		const userId = BigInt(user.id);
		const authorId = BigInt(reaction.message.author.id);
		const count = reaction.count ?? 0;

		log.info(
			`Processing star reaction by ${user.id} on message ${reaction.message.id}`,
			{
				guildId: guildId.toString(),
				channelId: channelId.toString(),
				messageId: messageId.toString(),
				userId: userId.toString(),
				count,
			}
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
		if (settings == null || settings.log == null) {
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

		if (channel == null || !channel.isText() || channel.isVoice()) {
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
