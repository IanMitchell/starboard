import type {
	FastifyInstance,
	RawReplyDefaultExpression,
	RawRequestDefaultExpression,
} from "fastify";
import type { Server } from "http";
import {
	createShield,
	getTotalMessageCount,
	getTotalStarCount,
} from "../lib/core/metrics/shields.js";
import getLogger from "../lib/core/logging/logger.js";
import {
	getTotalGuildCount,
	getTotalMemberCount,
} from "../lib/core/metrics/discord.js";

const log = getLogger("routes:shields");

export default function shieldRoutes(
	server: FastifyInstance<
		Server,
		RawRequestDefaultExpression,
		RawReplyDefaultExpression
	>,
	options: unknown,
	done: (err?: Error) => void
) {
	server.get("/shields/guilds", async (request, response) => {
		log.info("Guild requested");
		const value = await getTotalGuildCount();
		return response.send(createShield("Guilds", value.toLocaleString()));
	});

	server.get("/shields/users", async (request, response) => {
		log.info("Users requested");
		const value = await getTotalMemberCount();
		return response.send(createShield("Users", value.toLocaleString()));
	});

	server.get("/shields/messages", async (request, response) => {
		log.info("Messages requested");
		const value = await getTotalMessageCount();
		return response.send(
			createShield("Starboard Messages", value.toLocaleString())
		);
	});

	server.get("/shields/stars", async (request, response) => {
		log.info("Stars requested");
		const value = await getTotalStarCount();
		return response.send(createShield("Reactions", value.toLocaleString()));
	});

	done();
}
