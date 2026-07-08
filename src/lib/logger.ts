/**
 * Structured logger for quotes-social-media.
 *
 * Uses pino for JSON-structured logging that agents can query with ease:
 *
 *   # All errors in the last session
 *   grep '"level":50' output/logs/*.jsonl
 *
 *   # All caption-generation events
 *   jq 'select(.module=="caption")' output/logs/*.jsonl
 *
 *   # Tail the dev server with pretty-print
 *   npm run dev 2>&1 | pino-pretty
 *
 * Environment variables:
 *   LOG_LEVEL    — One of: trace, debug, info, warn, error, fatal (default: info)
 *   LOG_PRETTY   — Set to "true" for human-readable output (uses pino-pretty)
 *   LOG_FILE     — Path to write JSON logs to (optional, e.g. output/logs/app.jsonl)
 */

import pino from "pino";
import path from "path";

const LOG_LEVEL = process.env.LOG_LEVEL || "info";
const LOG_PRETTY = process.env.LOG_PRETTY === "true";
const LOG_FILE = process.env.LOG_FILE;

const baseDir = path.resolve(process.cwd(), "output", "logs");

/** Build the pino destination — multiple transports possible. */
function buildDestination(): pino.DestinationStream {
  const targets: Array<{ target: string; options: Record<string, unknown>; level?: string }> = [];

  // Always write to stdout
  if (LOG_PRETTY) {
    targets.push({
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "SYS:HH:MM:ss",
        ignore: "pid,hostname,module",
      },
    });
  } else {
    targets.push({
      target: "pino/file",
      options: {},
      level: LOG_LEVEL,
    });
  }

  // Optional file destination
  if (LOG_FILE) {
    const logPath = path.resolve(LOG_FILE);
    targets.push({
      target: "pino/file",
      options: { destination: logPath, mkdir: true },
    });
  }

  return pino.transport({ targets });
}

/**
 * Create a child logger scoped to a module.
 *
 * Usage:
 *   const log = createLogger("generate");
 *   log.info("Batch started");
 *   log.error({ err, quote }, "Generation failed");
 */
export function createLogger(module: string): pino.Logger {
  return pino(
    {
      level: LOG_LEVEL,
      base: { module },
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    buildDestination()
  );
}

/**
 * Default application logger.
 */
export const logger = createLogger("app");
