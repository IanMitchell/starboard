import dotenv from "dotenv";
import getLogger from "./src/lib/core/logging/logger.js";
import Sentry from "./src/lib/core/logging/sentry.js";
import { getError } from "./src/lib/core/node/error.js";

// dotenv.config({ path: "../../../.env" });
const log = getLogger("host");

async function initialize() {
	try {
		log.info("Loading Bot");
		await import("./src/bot.js");

		log.info("Starting Server");
		await import("./src/server.js");
	} catch (err: unknown) {
		const error = getError(err);
		log.fatal(error.message, { error });
		Sentry.captureException(error);
		process.exit(1);
	}
}

void initialize();
