/**
 * CLI command: autopilot
 *
 * Scheduled generation cron. Runs `generate` for all enabled accounts
 * so the user can review and approve images later in the UI.
 *
 * Usage:
 *   npm run cli autopilot                    # Generate for all enabled accounts
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

function getProjectRoot(): string {
  return process.cwd();
}

function buildCronCommand(): string {
  const root = getProjectRoot();
  return `cd ${root} && ${process.execPath} $(which npm) run --silent cli autopilot -- --json >> ${root}/output/autopilot.log 2>&1`;
}

function getCronStatus(): { installed: boolean; entry: string | null } {
  try {
    const output = execSync("crontab -l 2>/dev/null || true", { encoding: "utf-8" });
    for (const line of output.split("\n")) {
      if (line.includes(CRON_COMMENT)) return { installed: true, entry: line };
    }
  } catch { /* no crontab */ }
  return { installed: false, entry: null };
}

function installCron(): boolean {
  const { installed } = getCronStatus();
  if (installed) { log.info("Autopilot cron already installed"); return true; }
  try {
    const existing = execSync("crontab -l 2>/dev/null || true", { encoding: "utf-8" }).trim();
    const cronLine = `${CRON_SCHEDULE} ${buildCronCommand()} ${CRON_COMMENT}`;
    execSync("crontab -", { input: `${existing ? existing + "\n" : ""}${cronLine}\n`, encoding: "utf-8" });
    log.info({ schedule: CRON_SCHEDULE }, "Autopilot cron installed");
    return true;
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : String(err) }, "Failed to install cron");
    return false;
  }
}

function removeCron(): boolean {
  try {
    const output = execSync("crontab -l 2>/dev/null || true", { encoding: "utf-8" });
    const lines = output.split("\n").filter((l) => !l.includes(CRON_COMMENT));
    execSync("crontab -", { input: lines.join("\n").trim() + "\n", encoding: "utf-8" });
    log.info("Autopilot cron removed");
    return true;
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : String(err) }, "Failed to remove cron");
    return false;
  }
}

export interface AutopilotOptions {
  accountId?: string;
  count?: number;
  dryRun?: boolean;
  jsonOutput?: boolean;
  setupCron?: boolean;
  removeCron?: boolean;
  cronStatus?: boolean;
}

export function printAutopilotUsage(): void {
  console.log(`
Autopilot — Scheduled Generation

  Generates images for all enabled accounts on a schedule.
  Images go to the review UI — you approve/reject and publish manually.

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
`);
}

export async function runAutopilotCmd(options: AutopilotOptions = {}): Promise<void> {
  const { accountId, count, dryRun = false, jsonOutput = false, setupCron = false, removeCron: rmCron = false, cronStatus = false } = options;

  if (setupCron) {
    const ok = installCron();
    if (jsonOutput) console.log(JSON.stringify({ action: "setup-cron", success: ok }));
    process.exit(ok ? 0 : 1);
  }
  if (rmCron) {
    const ok = removeCron();
    if (jsonOutput) console.log(JSON.stringify({ action: "remove-cron", success: ok }));
    process.exit(ok ? 0 : 1);
  }
  if (cronStatus) {
    const { installed, entry } = getCronStatus();
    if (jsonOutput) { console.log(JSON.stringify({ installed, entry })); return; }
    log.info(installed ? `✅ Cron installed: ${entry}` : "❌ Cron not installed. Use --setup-cron.");
    return;
  }

  try {
    const result = await runAutopilot({ accountId, count, dryRun });

    if (jsonOutput) { console.log(JSON.stringify(result, null, 2)); return; }

    log.info("═══════════════════════════════════════");
    log.info(dryRun ? "  🔍 AUTOPILOT — DRY RUN" : "  🤖 AUTOPILOT — Complete");
    log.info("═══════════════════════════════════════");

    for (const entry of result.entries) {
      if (entry.success) {
        log.info(`  ✅ ${entry.account}  │  batch: ${entry.batchId}  │  ${entry.imagesGenerated} images generated`);
      } else {
        log.info(`  ❌ ${entry.account}  │  ${entry.error}`);
      }
    }

    log.info("");
    log.info(`  📊 ${result.succeeded}/${result.totalAccounts} accounts — images ready for review at http://localhost:3000`);

    if (dryRun) log.info("  💡 Run without --dry-run to execute.");
  } catch (err) {
    log.error({ err }, "Autopilot failed");
    process.exit(1);
  }
}
