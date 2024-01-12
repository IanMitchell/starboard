import fastify from "fastify";
import { register } from "./lib/core/metrics/grafana.js";
import cors from "@fastify/cors";
import getLogger from "./lib/core/logging/logger.js";
import { getError } from "./lib/core/node/error.js";
import shieldRoutes from "./routes/shield-routes.js";
import database from "./lib/core/database.js";
import Sentry from "./lib/core/logging/sentry.js";

const server = fastify();
void server.register(cors);

const log = getLogger("server");

void server.register(shieldRoutes);

server.get("/metrics", async (request, response) => {
	try {
		const metrics = await register.metrics();
		const databaseMetrics = await database.$metrics.prometheus();

		await response
			.header("Content-Type", register.contentType)
			.send(metrics + databaseMetrics);
	} catch (err: unknown) {
		const error = getError(err);
		log.fatal("Error exporting Metrics", { error });
		Sentry.captureException(error);

		return response.status(500).send(error);
	}
});

export default (async () => {
	try {
		const port = process.env.SERVER_PORT ?? 3000;
		log.info(`Listening on localhost:${port}`);
		await server.listen(port, "0.0.0.0");
	} catch (err: unknown) {
		const error = getError(err);
		log.fatal(error.message);
		Sentry.captureException(error);

		process.exit(1);
	}
})();
