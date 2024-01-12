import NodeCache from "node-cache";
import database from "../database.js";
import { getCacheValue } from "./cache.js";

const cache = new NodeCache({
	stdTTL: 60 * 60 * 3,
});

export function createShield(message: string, label: string, color = "green") {
	return {
		schemaVersion: 1,
		message,
		label,
		color,
		style: "for-the-badge",
	};
}

export async function getTotalMessageCount() {
	const value = await getCacheValue<number>("messageCount", async () => {
		return database.message.count();
	});

	return value;
}

export async function getTotalStarCount() {
	if (cache.has("totalStarCount")) {
		return cache.get<number>("totalStarCount") ?? 0;
	}

	const value = await database.starCount.aggregate({
		_sum: {
			amount: true,
		},
	});

	if (value._sum.amount != null && value._sum.amount > 0) {
		cache.set("totalStarCount", value._sum.amount);
	}

	return value._sum.amount ?? 0;
}
