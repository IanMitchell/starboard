import { collectDefaultMetrics, Gauge } from "prom-client";
import { getTotalGuildCount, getTotalMemberCount } from "./discord";
import { getTotalMessageCount, getTotalStarCount } from "./shields";

collectDefaultMetrics({
	prefix: "starboard",
});

export const totalGuilds = new Gauge({
	name: "guild_total",
	help: "The total number of Guilds the bot is in",
	async collect() {
		const value = await getTotalGuildCount();
		this.set(value);
	},
});

export const totalMembers = new Gauge({
	name: "member_total",
	help: "the total number of members in joined guilds",
	async collect() {
		const value = await getTotalMemberCount();
		this.set(value);
	},
});

export const totalReactions = new Gauge({
	name: "reaction_total",
	help: "the total number of processed reactions",
	async collect() {
		const value = await getTotalStarCount();
		this.set(value);
	},
});

export const totalMessages = new Gauge({
	name: "message_total",
	help: "the total number of starboard messages",
	async collect() {
		const value = await getTotalMessageCount();
		this.set(value);
	},
});

export { register } from "prom-client";
