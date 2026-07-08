/**
 * CLI commands for account management.
 *
 * Usage:
 *   npm run cli account create dailygrind --name "@Daily Motivation" --theme motivation,life
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
} from "../lib/account";
import { createLogger } from "../lib/logger";

const log = createLogger("account");

export interface AccountOptions {
  subcommand: string;
  accountId?: string;
  name?: string;
  description?: string;
  theme?: string;
  enabled?: boolean;
  cooldownDays?: number;
}

export async function runAccount(options: AccountOptions): Promise<void> {
  const { subcommand } = options;

  switch (subcommand) {
    case "create":
      return createCmd(options);
    case "list":
      return listCmd();
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
    log.warn("Missing account ID. Usage: npm run cli account create <id> --name ...");
    return;
  }

  try {
    const account = createAccount({
      id: options.accountId,
      name: options.name || options.accountId,
      description: options.description,
      theme: options.theme?.split(",").map((t) => t.trim()).filter(Boolean),
      cooldownDays: options.cooldownDays ?? 30,
      enabled: options.enabled ?? true,
    });
    log.info({ id: account.id, themes: account.theme }, `✅ Account "${account.id}" created`);
  } catch (err) {
    log.error({ err }, `Failed to create account`);
  }
}

async function listCmd(): Promise<void> {
  const accounts = getAllAccounts();

  if (accounts.length === 0) {
    log.info("No accounts configured. Create one with `npm run cli account create <id>`.");
    return;
  }

  log.info({ count: accounts.length }, `📋 ${accounts.length} account(s)`);
  for (const a of accounts) {
    const status = a.enabled ? "✅ enabled" : "⛔ disabled";
    const themes = a.theme?.join(", ") || "none";
    log.info(
      { id: a.id, enabled: a.enabled, themes: a.theme },
      `  • ${a.id} (${a.name}) — ${status} — themes: ${themes}`
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
    log.warn({ id: options.accountId }, `Account not found`);
    return;
  }

  log.info({ ...account }, `📄 ${account.id}`);
}

async function updateCmd(options: AccountOptions): Promise<void> {
  if (!options.accountId) {
    log.warn("Missing account ID.");
    return;
  }

  const updates: Record<string, unknown> = {};
  if (options.name) updates.name = options.name;
  if (options.description !== undefined) updates.description = options.description;
  if (options.theme) updates.theme = options.theme.split(",").map((t) => t.trim()).filter(Boolean);
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
  create <id> --name "X" --theme motivation,life
  list                     List all accounts
  get <id>                 Show account details
  update <id> --enabled false
  delete <id>              Delete an account
`);
}
