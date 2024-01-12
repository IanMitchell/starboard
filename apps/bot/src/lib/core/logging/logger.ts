import chalk from "chalk";
import debug from "debug";

type LogFn = (message: string, meta?: Record<string, unknown>) => void;
type Logger = {
	debug: LogFn;
	trace: LogFn;
	info: LogFn;
	warn: LogFn;
	error: LogFn;
	fatal: LogFn;
};

export default function getLogger(name: string): Logger {
	const log = debug(name);
	log(`created logger ${name}`);

	return {
		trace(message, _meta) {
			log(message);
		},
		debug(message, _meta) {
			log(message);
		},
		info(message, _meta) {
			log(message);
		},
		warn(message, _meta) {
			log(chalk.yellow(message));
		},
		error(message, _meta) {
			log(chalk.red(message));
		},
		fatal(message, _meta) {
			log(chalk.red.bold(message));
		},
	};
}
