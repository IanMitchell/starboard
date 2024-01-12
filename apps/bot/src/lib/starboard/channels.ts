import { type Channel } from "discord.js";
import bot from "../../bot.js";
import { isPublicTextChannel } from "../core/discord/text-channels.js";

export async function isValidChannel(channel: Channel) {
	const record = await bot.database.channelSetting.findUnique({
		select: {
			visible: true,
		},
		where: {
			channelId: BigInt(channel.id),
		},
	});

	if (record != null) {
		return record.visible;
	}

	return isPublicTextChannel(channel);
}
