import { createWebhookMessage } from "../lib/starboard/webhook";
import { CommandArgs } from "../typedefs";
import getLogger from "../lib/core/logging";
import { isPublicTextChannel } from "../lib/core/discord/text-channels";

const log = getLogger("star");
const messageSemaphores = new Set();

export default async ({ bot }: CommandArgs) => {
	log.debug("I am running");

	bot.on("messageReactionRemove", async (reaction, user) => {
		log.debug("Removing reaction");
		if (
			reaction.emoji.name !== "⭐" ||
			reaction.message.guildId === null ||
			reaction.message.author === user
		) {
			return;
		}

		const guildId = BigInt(reaction.message.guildId);
		const userId = BigInt(user.id);

		log.info(`Decrementing star tracker`, {
			guildId,
			userId,
		});

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

	bot.on("messageReactionAdd", async (raw, user) => {
		if (raw.emoji.name !== "⭐" || raw.message.author === user) {
			return;
		}

		// TODO: Add getReactionMeta
		log.debug("Handling new reaction");

		const reaction = raw.partial ? await raw.fetch() : raw;
		if (reaction.message.guildId === null || reaction.message.author == null) {
			return;
		}

		const guildId = BigInt(reaction.message.guildId);
		const channelId = BigInt(reaction.message.channelId);
		const messageId = BigInt(reaction.message.id);
		const userId = BigInt(user.id);
		const authorId = BigInt(reaction.message.author.id);
		const count = reaction.count ?? 0;

		log.info(`Processing star reaction for message ${reaction.message.id}`, {
			guildId,
			channelId,
			messageId,
			userId,
			count,
		});

		if (count === 0) {
			log.warn("Reaction count 0");
		}

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
			log.info(`Message ${messageId} is blocked`);
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
		if (settings == null) {
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
			log.info("Message already exists, updating count", { messageId });
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

		if (channel == null || !channel.isText()) {
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

		const posted = await createWebhookMessage(channel, targetMessage);

		if (posted != null) {
			await bot.database.message.create({
				data: {
					messageId,
					channelId,
					guildId,
					userId: authorId,
					count,
					crosspostId: BigInt(posted.id),
				},
			});
		}

		messageSemaphores.delete(reaction.message.id);
	});
};
