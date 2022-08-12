import type {
	FastifyInstance,
	FastifyPluginOptions,
	RawReplyDefaultExpression,
	RawRequestDefaultExpression,
} from "fastify";
import type { Server } from "http";
import {
	createShield,
	getTotalMessageCount,
	getTotalStarCount,
} from "../lib/core/metrics/shields";
import getLogger from "../lib/core/logging";
import {
	getTotalGuildCount,
	getTotalMemberCount,
} from "../lib/core/metrics/discord";

const log = getLogger("routes:shields");

export default function shieldRoutes(
	server: FastifyInstance<
		Server,
		RawRequestDefaultExpression,
		RawReplyDefaultExpression
	>,
	options: FastifyPluginOptions,
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
		return response.send(
			createShield("Starboard Reactions", value.toLocaleString())
		);
	});

	done();
}
