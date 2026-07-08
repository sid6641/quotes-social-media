/**
 * CLI command: autopilot
 *
 * Runs the full content pipeline on a schedule:
 *   1. Generate images for each enabled account
 *   2. Auto-approve all generated images
 *   3. Export a content calendar for manual posting
 *
 * Designed to be run daily from a cron job.
 *
 * Usage:
 *   npm run cli autopilot                    # Run for all enabled accounts
 *   npm run cli autopilot -- --account dailygrind   # Single account
 *   npm run cli autopilot -- --dry-run       # Show what would happen
 *   npm run cli autopilot -- --setup-cron    # Install daily cron at 08:00
 *   npm run cli autopilot -- --remove-cron   # Remove cron job
 *   npm run cli autopilot -- --cron-status   # Check if cron is installed
 */

import { execSync } from "child_process";
import { runAutopilot } from "../lib/scheduler";
import { createLogger } from "../lib/logger";

const log = createLogger("cli-autopilot");
const CRON_COMMENT = "# quotes-social-media autopilot";
const CRON_SCHEDULE = "0 8 * * *"; // Daily at 08:00

/**
 * Get the project root's absolute path.
 */
function getProjectRoot(): string {
  return process.cwd();
}

/**
 * Build the cron command that runs the autopilot.
 * Uses `cd` to the project root and runs via npm.
 */
function buildCronCommand(): string {
  const root = getProjectRoot();
  return `cd ${root} && ${process.execPath} $(which npm) run --silent cli autopilot -- --json >> ${root}/output/autopilot.log 2>&1`;
}

/**
 * Check if the autopilot cron job is installed.
 */
function getCronStatus(): { installed: boolean; entry: string | null } {
  try {
    const output = execSync("crontab -l 2>/dev/null || true", { encoding: "utf-8" });
    const lines = output.split("\n");
    for (const line of lines) {
      if (line.includes(CRON_COMMENT)) {
        return { installed: true, entry: line };
      }
    }
  } catch {
    // No crontab exists
  }
  return { installed: false, entry: null };
}

/**
 * Install the cron job.
 */
function installCron(): boolean {
  const { installed, entry } = getCronStatus();
  if (installed) {
    log.info({ entry }, "Autopilot cron job already installed");
    return true;
  }

  try {
    const existing = execSync("crontab -l 2>/dev/null || true", { encoding: "utf-8" }).trim();
    const cronLine = `${CRON_SCHEDULE} ${buildCronCommand()} ${CRON_COMMENT}`;
    const newCron = existing ? `${existing}\n${cronLine}\n` : `${cronLine}\n`;

    execSync(`crontab -`, { input: newCron, encoding: "utf-8" });
    log.info({ schedule: CRON_SCHEDULE, command: buildCronCommand() }, "Autopilot cron job installed");
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg }, "Failed to install cron job. Try running with sudo or manually.");
    return false;
  }
}

/**
 * Remove the cron job.
 */
function removeCron(): boolean {
  try {
    const output = execSync("crontab -l 2>/dev/null || true", { encoding: "utf-8" });
    const lines = output.split("\n").filter((line) => !line.includes(CRON_COMMENT));
    const newCron = lines.join("\n").trim() + "\n";

    execSync(`crontab -`, { input: newCron, encoding: "utf-8" });
    log.info("Autopilot cron job removed");
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg }, "Failed to remove cron job");
    return false;
  }
}

export interface AutopilotOptions {
  /** Specific account ID */
  accountId?: string;
  /** Number of images per account */
  count?: number;
  /** Dry-run mode */
  dryRun?: boolean;
  /** JSON output */
  jsonOutput?: boolean;
  /** Install cron job */
  setupCron?: boolean;
  /** Remove cron job */
  removeCron?: boolean;
  /** Check cron status */
  cronStatus?: boolean;
}

export function printAutopilotUsage(): void {
  console.log(`
Autopilot — Automated Content Pipeline

  Runs the full pipeline (generate → approve → export) for all
  enabled accounts. Designed for daily cron scheduling.

Usage:
  npm run cli autopilot [options]

Options:
  --account <id>    Run for a specific account only
  --count <n>       Images per account (default: 10)
  --dry-run         Show what would happen without doing it
  --setup-cron      Install daily cron job at 08:00
  --remove-cron     Remove the cron job
  --cron-status     Check if cron is installed
  --json            JSON output (for piping)
  --help            Show this message

Examples:
  npm run cli autopilot
  npm run cli autopilot -- --account dailygrind
  npm run cli autopilot -- --dry-run
  npm run cli autopilot -- --setup-cron
  npm run cli autopilot -- --cron-status
`);
}

export async function runAutopilotCmd(options: AutopilotOptions = {}): Promise<void> {
  const {
    accountId,
    count,
    dryRun = false,
    jsonOutput = false,
    setupCron = false,
    removeCron: removeCronFlag = false,
    cronStatus = false,
  } = options;

  // Handle cron management commands
  if (setupCron) {
    const ok = installCron();
    if (jsonOutput) {
      console.log(JSON.stringify({ action: "setup-cron", success: ok }));
    }
    process.exit(ok ? 0 : 1);
  }

  if (removeCronFlag) {
    const ok = removeCron();
    if (jsonOutput) {
      console.log(JSON.stringify({ action: "remove-cron", success: ok }));
    }
    process.exit(ok ? 0 : 1);
  }

  if (cronStatus) {
    const { installed, entry } = getCronStatus();
    if (jsonOutput) {
      console.log(JSON.stringify({ installed, entry }));
    } else {
      if (installed) {
        log.info({ entry }, "✅ Autopilot cron is installed");
      } else {
        log.info("❌ Autopilot cron is NOT installed. Run with --setup-cron to install.");
      }
    }
    return;
  }

  // Run the autopilot
  try {
    const result = await runAutopilot({ accountId, count, dryRun });

    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    // Pretty print summary
    log.info("═══════════════════════════════════════");
    if (dryRun) log.info("  🔍 AUTOPILOT — DRY RUN");
    else log.info("  🤖 AUTOPILOT — Complete");
    log.info("═══════════════════════════════════════");

    for (const entry of result.entries) {
      if (entry.success) {
        log.info("");
        log.info(`  ✅ ${entry.account}`);
        log.info(`     Batch:     ${entry.batchId}`);
        log.info(`     Generated: ${entry.imagesGenerated} images`);
        log.info(`     Approved:  ${entry.imagesApproved} images`);
        if (entry.calendarDays) log.info(`     Calendar:  ${entry.calendarDays} days`);
        if (entry.exportPath) log.info(`     Export:    ${entry.exportPath}`);
      } else {
        log.info("");
        log.info(`  ❌ ${entry.account} — ${entry.error}`);
      }
    }

    log.info("");
    log.info(`  📊 ${result.succeeded}/${result.totalAccounts} accounts succeeded`);

    if (!dryRun && result.succeeded > 0) {
      log.info("");
      log.info("  📋 Post your content from the export folders above.");
    }

    if (dryRun) {
      log.info("");
      log.info("  💡 Run without --dry-run to execute.");
      log.info("  💡 Use --setup-cron to schedule daily at 08:00.");
    }

  } catch (err) {
    log.error({ err }, "Autopilot failed");
    process.exit(1);
  }
}
