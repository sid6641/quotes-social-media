/**
 * Autopilot scheduler.
 *
 * Runs a scheduled generation batch for one or all accounts.
 * Designed to be run from a cron job daily — generates images
 * so the user can review and approve them later in the UI.
 */

import { createLogger } from "./logger";
import { runGenerate } from "../cli/generate";
import { getAccount, getAllAccounts } from "./account";
import type { AccountConfig } from "./account";

const log = createLogger("scheduler");

export interface AutopilotEntry {
  account: string;
  success: boolean;
  batchId?: string;
  imagesGenerated?: number;
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
  /** If true, skip generation — just show what would happen */
  dryRun?: boolean;
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

  log.info({ account: accountId }, `Generating for "${account.name || accountId}"`);

  try {
    if (dryRun) {
      log.info({ account: accountId, count: targetCount }, "[DRY RUN] Would generate images");
      return { account: accountId, success: true };
    }

    const result = await runGenerate({
      count: targetCount,
      accountId,
      jsonOutput: true,
    });

    log.info(
      { account: accountId, batchId: result.batchId, successCount: result.successCount },
      "Generation complete — ready for review"
    );

    return {
      account: accountId,
      success: true,
      batchId: result.batchId,
      imagesGenerated: result.successCount,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ account: accountId, err: msg }, "Generation failed");
    return { account: accountId, success: false, error: msg };
  }
}

/**
 * Run the autopilot — generates images for all enabled accounts.
 * Does NOT approve or export — the user handles that manually in the review UI.
 */
export async function runAutopilot(
  options: AutopilotOptions = {}
): Promise<AutopilotResult> {
  const { accountId, dryRun } = options;
  const timestamp = new Date().toISOString();

  const accounts: AccountConfig[] = accountId
    ? (() => {
        const a = getAccount(accountId);
        return a ? [a] : [];
      })()
    : getAllAccounts().filter((a) => a.enabled);

  if (accounts.length === 0) {
    log.warn("No enabled accounts found for autopilot");
    return { timestamp, totalAccounts: 0, succeeded: 0, failed: 0, entries: [] };
  }

  log.info(
    { accountCount: accounts.length, dryRun: !!dryRun },
    dryRun ? "[DRY RUN] Autopilot starting" : "Autopilot starting — generating images for review"
  );

  const entries: AutopilotEntry[] = [];
  for (const account of accounts) {
    entries.push(await runForAccount(account, options));
  }

  const succeeded = entries.filter((e) => e.success).length;
  const failed = entries.filter((e) => !e.success).length;

  log.info(
    { totalAccounts: accounts.length, succeeded, failed },
    dryRun ? "[DRY RUN] Autopilot complete" : "Autopilot complete — images ready for review in the UI"
  );

  return { timestamp, totalAccounts: accounts.length, succeeded, failed, entries };
}
