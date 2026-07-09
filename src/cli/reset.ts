/**
 * CLI reset command — wipes all generated data for a fresh start.
 *
 * Usage:
 *   npm run cli reset                      # Prompt before wiping
 *   npm run cli reset -- --force           # Skip confirmation
 *   npm run cli reset -- --json            # JSON result (for scripting)
 *
 * What it deletes:
 *   - accounts/ directory (all accounts, data, images, calendars)
 *   - output/ directory (global generated files)
 *   - Leaves: quotes/, templates/, prompts/, src/, docs/
 */

import fs from "fs";
import path from "path";

const ACCOUNTS_DIR = path.resolve(process.cwd(), "accounts");
const OUTPUT_DIR = path.resolve(process.cwd(), "output");

export interface ResetOptions {
  force?: boolean;
  jsonOutput?: boolean;
}

export interface ResetResult {
  success: boolean;
  deleted: {
    accounts: boolean;
    globalOutput: boolean;
  };
  message: string;
}

function rmdirRecursive(dir: string): boolean {
  if (!fs.existsSync(dir)) return false;
  fs.rmSync(dir, { recursive: true, force: true });
  return true;
}

export function printResetUsage(): void {
  console.log(`
Reset options:
  --force            Skip confirmation prompt
  --json             JSON output (for scripting)

Examples:
  npm run cli reset                     Wipe all data (with prompt)
  npm run cli reset -- --force          Wipe without prompt
  npm run cli reset -- --json           JSON result
`);
}

export function runReset(options: ResetOptions = {}): ResetResult {
  const { jsonOutput } = options;

  const print = jsonOutput
    ? { info: () => {}, warn: () => {} }
    : {
        info: (msg: string) => console.log(msg),
        warn: (msg: string) => console.warn(msg),
      };

  if (!jsonOutput) {
    print.info("");
    print.info("🧹 Quotes Social Media — Reset");
    print.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    print.info("");
  }

  const deletedAccounts = rmdirRecursive(ACCOUNTS_DIR);
  const deletedOutput = rmdirRecursive(OUTPUT_DIR);

  if (!jsonOutput) {
    if (deletedAccounts) print.info("  ✅ Deleted accounts/");
    else print.info("  ℹ️  accounts/ was already empty");
    if (deletedOutput) print.info("  ✅ Deleted output/");
    else print.info("  ℹ️  output/ was already empty");

    print.info("");
    print.info("  📁 Preserved: quotes/ templates/ prompts/ src/ docs/");
    print.info("");
    print.info("  Ready for a fresh start. Run:");
    print.info("    npm run cli account create <id>  — create an account");
    print.info("    npm run cli generate -- --account <id>  — generate images");
    print.info("");
  }

  return {
    success: true,
    deleted: {
      accounts: deletedAccounts,
      globalOutput: deletedOutput,
    },
    message: deletedAccounts
      ? "All accounts and generated data wiped. Ready for fresh start."
      : "Nothing to wipe — already clean.",
  };
}
