/**
 * CLI adapter for the generation pipeline.
 *
 * Thin wrapper around lib/generate.ts — handles CLI-specific
 * pretty-printing and JSON output formatting.
 *
 * Backward compat: `npm run generate` still works via the direct-run
 * block at the bottom.
 */
import "dotenv/config";
import { runGenerate } from "../lib/generate";
import type { GenerateOptions, GenerateResult, ProgressEvent } from "../lib/generate";
import { createLogger } from "../lib/logger";

// Re-export for callers that still import from here (cli/index.ts, backward compat)
export { runGenerate };
export type { GenerateOptions, GenerateResult, ProgressEvent };

const logger = createLogger("generate");

export interface CliGenerateOptions {
  count?: number;
  templateName?: string;
  jsonOutput?: boolean;
  accountId?: string;
}

/**
 * Run generation with CLI-specific output formatting.
 * Thin adapter — delegates all logic to lib/generate.ts.
 */
export async function runGenerateCli(
  options: CliGenerateOptions = {}
): Promise<GenerateResult> {
  const { templateName, jsonOutput, accountId } = options;
  const targetCount = options.count ?? 10;

  if (!jsonOutput) {
    const scope = accountId ? ` for account "${accountId}"` : "";
    logger.info(`📸 Quotes Social Media — Batch Generator${scope}`);
  }

  const result = await runGenerate({
    count: targetCount,
    templateName,
    accountId,
    onProgress: jsonOutput
      ? undefined
      : (event: ProgressEvent) => {
          switch (event.phase) {
            case "image":
              if (event.current && event.completed < event.total) {
                process.stdout.write(
                  `  ⏳ [${event.completed + 1}/${event.total}] Generating "${event.current.substring(0, 40)}..." `
                );
              }
              if (event.completed === event.total) {
                logger.info("✅ Done");
              }
              break;
            case "caption":
              if (event.completed === 0) {
                process.stdout.write(
                  `\n  💬 Generating captions (${event.total} images, 5 options each)...\n`
                );
              }
              if (event.current && event.completed < event.total) {
                process.stdout.write(
                  `     [${event.completed + 1}/${event.total}] "${event.current.substring(0, 35)}..." `
                );
              }
              break;
            case "complete":
              logger.info(
                { successCount: event.successCount, failCount: event.failCount },
                `📊 Summary: ${event.successCount} generated, ${event.failCount} failed`
              );
              if (event.successCount && event.successCount > 0) {
                logger.info("✏️  Review at http://localhost:3000");
              }
              break;
          }
        },
  });

  if (jsonOutput) {
    console.log(JSON.stringify(result, null, 2));
  }

  return result;
}

// Backward-compatible direct execution: `npm run generate`
const isDirectRun =
  process.argv[1]?.endsWith("generate.ts") ||
  process.argv[1]?.endsWith("generate.js");

if (isDirectRun) {
  runGenerateCli().catch((err) => {
    logger.error({ err }, "Generation failed");
    process.exit(1);
  });
}
