/**
 * CLI commands for account management.
 *
 * Usage:
 *   npm run cli account create dailygrind --name "@Daily Motivation"
 *   npm run cli account list
 *   npm run cli account get dailygrind
 *   npm run cli account update dailygrind --enabled false
 *   npm run cli account delete dailygrind
 */
import {
  createAccount,
  getAccount,
  getAllAccounts,
  updateAccount,
  deleteAccount,
  getAccountQuotesDir,
  getAccountTemplatesDir,
  getAccountPromptsDir,
} from "../lib/account";
import { createLogger } from "../lib/logger";
import fs from "fs";
import path from "path";
import readline from "readline";

const log = createLogger("account");

const GLOBAL_QUOTES = path.resolve(process.cwd(), "quotes");
const GLOBAL_TEMPLATES = path.resolve(process.cwd(), "templates");
const GLOBAL_PROMPTS = path.resolve(process.cwd(), "prompts");

function askQuestion(query: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

function copyFiles(srcDir: string, destDir: string): number {
  if (!fs.existsSync(srcDir)) return 0;
  let count = 0;
  for (const f of fs.readdirSync(srcDir)) {
    const src = path.join(srcDir, f);
    if (fs.statSync(src).isFile()) {
      fs.copyFileSync(src, path.join(destDir, f));
      count++;
    }
  }
  return count;
}

export interface AccountOptions {
  subcommand: string;
  accountId?: string;
  name?: string;
  description?: string;
  scope?: string;
  enabled?: boolean;
  cooldownDays?: number;
  jsonOutput?: boolean;
}

export async function runAccount(options: AccountOptions): Promise<void> {
  const { subcommand } = options;

  switch (subcommand) {
    case "create":
      return createCmd(options);
    case "list":
      return listCmd(options);
    case "get":
      return getCmd(options);
    case "update":
      return updateCmd(options);
    case "delete":
      return deleteCmd(options);
    default:
      log.warn({ subcommand }, `Unknown account subcommand`);
      log.info("Available: create, list, get, update, delete");
  }
}

async function createCmd(options: AccountOptions): Promise<void> {
  if (!options.accountId) {
    log.warn("Missing account ID.");
    return;
  }

  try {
    const account = createAccount({
      id: options.accountId,
      name: options.name || options.accountId,
      description: options.description,
      cooldownDays: options.cooldownDays ?? 30,
      enabled: options.enabled ?? true,
    });
    if (options.jsonOutput) {
      console.log(JSON.stringify({ success: true, account }));
    } else {
      log.info({ id: account.id }, `✅ Account "${account.id}" created`);
    }

    // Interactive import prompts (skip in json mode)
    if (!options.jsonOutput) {
      const imports: string[] = [];

      if (fs.existsSync(GLOBAL_QUOTES)) {
        const answer = await askQuestion("  Import global quotes into this account? (y/n): ");
        if (answer === "y" || answer === "yes") imports.push("quotes");
      }
      if (fs.existsSync(GLOBAL_TEMPLATES)) {
        const answer = await askQuestion("  Import global templates into this account? (y/n): ");
        if (answer === "y" || answer === "yes") imports.push("templates");
      }
      if (fs.existsSync(GLOBAL_PROMPTS)) {
        const answer = await askQuestion("  Import global prompts into this account? (y/n): ");
        if (answer === "y" || answer === "yes") imports.push("prompts");
      }

      for (const resource of imports) {
        let count = 0;
        switch (resource) {
          case "quotes":
            count = copyFiles(GLOBAL_QUOTES, getAccountQuotesDir(account.id));
            log.info({ count }, `  📝 Imported ${count} quote file(s)`);
            break;
          case "templates":
            count = copyFiles(GLOBAL_TEMPLATES, getAccountTemplatesDir(account.id));
            log.info({ count }, `  🖼️  Imported ${count} template file(s)`);
            break;
          case "prompts":
            count = copyFiles(GLOBAL_PROMPTS, getAccountPromptsDir(account.id));
            log.info({ count }, `  📄 Imported ${count} prompt file(s)`);
            break;
        }
      }

      if (imports.length > 0) {
        log.info("Done. You can now generate images for this account.");
      } else {
        log.info("No imports selected. Account is ready with empty directories.");
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (options.jsonOutput) {
      console.log(JSON.stringify({ success: false, error: msg }));
    } else {
      log.error({ err }, `Failed to create account`);
    }
  }
}

async function listCmd(options: AccountOptions): Promise<void> {
  const accounts = getAllAccounts();

  if (options.jsonOutput) {
    console.log(JSON.stringify({ success: true, accounts }));
    return;
  }

  if (accounts.length === 0) {
    log.info("No accounts configured.");
    return;
  }

  log.info({ count: accounts.length }, `📋 ${accounts.length} account(s)`);
  for (const a of accounts) {
    const status = a.enabled ? "✅ enabled" : "⛔ disabled";
    log.info(
      { id: a.id, enabled: a.enabled },
      `  • ${a.id} (${a.name}) — ${status}`
    );
  }
}

async function getCmd(options: AccountOptions): Promise<void> {
  if (!options.accountId) {
    log.warn("Missing account ID.");
    return;
  }

  const account = getAccount(options.accountId);
  if (!account) {
    if (options.jsonOutput) {
      console.log(JSON.stringify({ success: false, error: "Account not found" }));
    } else {
      log.warn({ id: options.accountId }, `Account not found`);
    }
    return;
  }

  if (options.jsonOutput) {
    console.log(JSON.stringify({ success: true, account }));
  } else {
    log.info({ ...account }, `📄 ${account.id}`);
  }
}

async function updateCmd(options: AccountOptions): Promise<void> {
  if (!options.accountId) {
    log.warn("Missing account ID.");
    return;
  }

  const updates: Record<string, unknown> = {};
  if (options.name) updates.name = options.name;
  if (options.description !== undefined) updates.description = options.description;
  if (options.scope) updates.scope = options.scope.split(",").map((t) => t.trim()).filter(Boolean);
  if (options.enabled !== undefined) updates.enabled = options.enabled;
  if (options.cooldownDays) updates.cooldownDays = options.cooldownDays;

  const updated = updateAccount(options.accountId, updates);
  if (!updated) {
    log.warn({ id: options.accountId }, `Account not found`);
    return;
  }

  log.info({ id: updated.id }, `✅ Account "${updated.id}" updated`);
}

async function deleteCmd(options: AccountOptions): Promise<void> {
  if (!options.accountId) {
    log.warn("Missing account ID.");
    return;
  }

  const deleted = deleteAccount(options.accountId);
  if (!deleted) {
    log.warn({ id: options.accountId }, `Account not found`);
    return;
  }

  log.info({ id: options.accountId }, `🗑️ Account "${options.accountId}" deleted`);
}

export function printAccountUsage(): void {
  console.log(`
Account Commands:
  create <id>              Create a new account
  create <id> --name "X"
  list                     List all accounts
  get <id>                 Show account details
  update <id> --enabled false
  delete <id>              Delete an account
`);
}
