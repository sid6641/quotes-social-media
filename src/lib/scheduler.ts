/**
 * Autopilot scheduler.
 *
 * Runs the full content pipeline for one or all accounts:
 *   1. Generate images (calls runGenerate)
 *   2. Auto-approve all generated images
 *   3. Export content calendar
 *
 * Designed to be run from a cron job daily.
 */

import fs from "fs";
import path from "path";
import { createLogger } from "./logger";
import { runGenerate } from "../cli/generate";
import { exportContentCalendar } from "./exporter";
import { getAccount, getAllAccounts, getAccountDir } from "./account";
import type { AccountConfig } from "./account";
import type { GenerateResult } from "../cli/generate";
import type { ExportResult } from "./exporter";
import type { ImageEntry, Manifest } from "./manifest";

const log = createLogger("scheduler");

export interface AutopilotEntry {
  account: string;
  success: boolean;
  batchId?: string;
  imagesGenerated?: number;
  imagesApproved?: number;
  calendarDays?: number;
  exportPath?: string;
  error?: string;
}

export interface AutopilotResult {
  timestamp: string;
  totalAccounts: number;
  succeeded: number;
  failed: number;
  entries: AutopilotEntry[];
}

export interface AutopilotOptions {
  /** Specific account ID. Runs all enabled accounts if omitted. */
  accountId?: string;
  /** Number of images to generate per account (default: 10) */
  count?: number;
  /** If true, skip the actual generation — just show what would happen */
  dryRun?: boolean;
}

/**
 * Read the manifest file for a given directory and auto-approve all pending images.
 * Returns the number of images approved.
 */
function autoApproveImages(outputDir: string): number {
  const manifestPath = path.join(outputDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) return 0;

  let manifests: Manifest[];
  try {
    const data = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    manifests = Array.isArray(data) ? data : [data];
  } catch {
    return 0;
  }

  let approvedCount = 0;
  for (const manifest of manifests) {
    for (const image of manifest.images) {
      if (image.status === "pending") {
        image.status = "approved";
        approvedCount++;
      }
    }
  }

  fs.writeFileSync(manifestPath, JSON.stringify(manifests, null, 2), "utf-8");
  return approvedCount;
}

/**
 * Run the autopilot for a single account.
 */
async function runForAccount(
  account: AccountConfig,
  options: AutopilotOptions
): Promise<AutopilotEntry> {
  const accountId = account.id;
  const targetCount = options.count ?? 10;
  const dryRun = options.dryRun ?? false;

  log.info({ account: accountId }, `Running autopilot for "${account.name || accountId}"`);

  try {
    // Step 1: Generate images
    let generateResult: GenerateResult | null = null;

    if (dryRun) {
      log.info({ account: accountId, count: targetCount }, "[DRY RUN] Would generate images");
    } else {
      log.info({ account: accountId, count: targetCount }, "Generating images...");
      generateResult = await runGenerate({
        count: targetCount,
        accountId,
        jsonOutput: true,
      });
      log.info(
        { account: accountId, batchId: generateResult.batchId, successCount: generateResult.successCount },
        "Generation complete"
      );
    }

    // Step 2: Auto-approve all pending images
    const outputDir = getAccountDir(accountId);
    let approvedCount = 0;

    if (dryRun) {
      log.info({ account: accountId }, "[DRY RUN] Would auto-approve all images");
    } else {
      approvedCount = autoApproveImages(outputDir);
      log.info({ account: accountId, approvedCount }, "Auto-approval complete");
    }

    // Step 3: Export content calendar
    let exportResult: ExportResult | null = null;

    if (dryRun) {
      log.info({ account: accountId }, "[DRY RUN] Would export content calendar");
    } else {
      exportResult = await exportContentCalendar({
        accountId,
        days: targetCount, // One image per day
      });
      log.info(
        { account: accountId, days: exportResult.totalDays, path: exportResult.calendarFilePath },
        "Calendar export complete"
      );
    }

    return {
      account: accountId,
      success: true,
      batchId: generateResult?.batchId,
      imagesGenerated: generateResult?.successCount,
      imagesApproved: approvedCount || generateResult?.successCount,
      calendarDays: exportResult?.totalDays,
      exportPath: exportResult?.calendarFilePath,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ account: accountId, err: msg }, "Autopilot failed for account");
    return {
      account: accountId,
      success: false,
      error: msg,
    };
  }
}

/**
 * Run the autopilot — generates, approves, and exports for all enabled accounts.
 */
export async function runAutopilot(
  options: AutopilotOptions = {}
): Promise<AutopilotResult> {
  const { accountId, dryRun } = options;
  const timestamp = new Date().toISOString();

  // Determine which accounts to run for
  let accounts: AccountConfig[];

  if (accountId) {
    const account = getAccount(accountId);
    if (!account) {
      throw new Error(`Account "${accountId}" not found`);
    }
    accounts = [account];
  } else {
    accounts = getAllAccounts().filter((a) => a.enabled);
  }

  if (accounts.length === 0) {
    log.warn("No enabled accounts found for autopilot");
    return {
      timestamp,
      totalAccounts: 0,
      succeeded: 0,
      failed: 0,
      entries: [],
    };
  }

  log.info(
    { accountCount: accounts.length, dryRun: !!dryRun },
    dryRun ? "[DRY RUN] Autopilot starting" : "Autopilot starting"
  );

  // Run serially to avoid overloading Gemini API
  const entries: AutopilotEntry[] = [];
  for (const account of accounts) {
    const entry = await runForAccount(account, options);
    entries.push(entry);
  }

  const succeeded = entries.filter((e) => e.success).length;
  const failed = entries.filter((e) => !e.success).length;

  log.info(
    { totalAccounts: accounts.length, succeeded, failed },
    dryRun ? "[DRY RUN] Autopilot complete" : "Autopilot complete"
  );

  return {
    timestamp,
    totalAccounts: accounts.length,
    succeeded,
    failed,
    entries,
  };
}
