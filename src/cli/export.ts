/**
 * CLI command: export
 *
 * Exports a content calendar from approved images — schedules them over
 * the next N days and copies images + caption files to an export directory.
 *
 * Usage:
 *   npm run cli export                    # Export next 7 days of approved images
 *   npm run cli export -- --days 14       # Export next 14 days
 *   npm run cli export -- --account dailygrind   # Export for a specific account
 *   npm run cli export -- --json          # JSON output (pipeable)
 */

import { exportContentCalendar } from "../lib/exporter";
import { createLogger } from "../lib/logger";

const log = createLogger("cli-export");

export interface ExportOptions {
  /** Account ID to scope the export */
  accountId?: string;
  /** Number of days to schedule (default: 7) */
  days?: number;
  /** Output as JSON */
  jsonOutput?: boolean;
}

export function printExportUsage(): void {
  console.log(`
Export — Content Calendar Generator

  Generates a day-by-day content calendar from approved images.
  Copies images + caption files to output/exports/ for easy manual posting.

Usage:
  npm run cli export [options]

Options:
  --days <n>        Number of days to schedule (default: 7)
  --account <id>    Scope to a specific account
  --json            Output results as JSON (for piping)
  --help            Show this help message

Examples:
  npm run cli export
  npm run cli export -- --days 14
  npm run cli export -- --account dailygrind
  npm run cli export -- --account dailygrind --days 3
  npm run --silent cli export -- --json | jq '{startDate, endDate, totalImages}'
`);
}

export async function runExport(options: ExportOptions = {}): Promise<void> {
  const { accountId, days = 7, jsonOutput = false } = options;

  try {
    const result = await exportContentCalendar({ accountId, days });

    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    if (result.totalImages === 0) {
      log.info("No approved images to export. Generate and approve some images first.");
      return;
    }

    log.info("═══════════════════════════════════════");
    log.info("  Content Calendar Exported");
    log.info("═══════════════════════════════════════");
    log.info({ account: result.account });
    log.info({ days: result.totalDays });
    log.info({ images: result.totalImages });
    log.info({ from: result.startDate });
    log.info({ to: result.endDate });
    log.info("");
    log.info({ calendar: result.calendarFilePath });
    log.info({ content: result.contentDir });
    log.info("");
    log.info("📋 Your posting plan:");
    log.info("───────────────────────────────────────");

    for (const entry of result.entries) {
      log.info("");
      log.info(`  Day ${entry.day} — ${entry.date}`);
      log.info(`  📝 "${entry.quote.slice(0, 60)}${entry.quote.length > 60 ? "..." : ""}"`);
      log.info(`  🖼️  ${entry.exportedImagePath}`);
      log.info(`  📄 ${entry.exportedCaptionPath}`);
    }

    log.info("");
    log.info("✅ Done! Open the content folder and post manually.");

  } catch (err) {
    log.error({ err }, "Export failed");
    process.exit(1);
  }
}
