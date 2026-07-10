/**
 * Account management — multi-account sandboxing.
 *
 * Each account gets an isolated directory under output/<id>/
 * with its own config, queue, manifest, calendar, and archive.
 *
 * The global output/ directory acts as the default account for
 * backward compatibility.
 */

import fs from "fs";
import path from "path";
import { createFileStore } from "./json-store";

const ACCOUNTS_DIR = path.resolve(process.cwd(), "accounts");
const ACCOUNTS_FILE = path.resolve(process.cwd(), "accounts", "accounts.json");
const GLOBAL_OUTPUT = path.resolve(process.cwd(), "output");

// ─── Types ───────────────────────────────────────────────────────────

export interface AccountSchedule {
  time: string;        // "09:00"
  timezone: string;    // "America/New_York"
  postsPerDay: number;
  reelsPerWeek: number;
}

export interface InstagramAuth {
  igUserId?: string;
  pageId?: string;
  accessToken?: string;
  tokenExpiresAt?: string;
}

export interface AccountConfig {
  id: string;
  name: string;
  description?: string;
  scope?: string[];
  schedule?: AccountSchedule;
  instagram?: InstagramAuth;
  cooldownDays: number;
  /** Template images specific to this account (filenames). */
  templates?: string[];
  promptTemplate?: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Store ────────────────────────────────────────────────────────────

const ACCOUNTS_FILE_PATH = path.join(ACCOUNTS_DIR, "accounts.json");
const accountsStore = createFileStore<AccountConfig[]>(ACCOUNTS_FILE_PATH, []);

export function invalidateAccountsCache(): void {
  accountsStore.invalidate();
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ─── CRUD ─────────────────────────────────────────────────────────────

export function createAccount(config: Omit<AccountConfig, "createdAt" | "updatedAt">): AccountConfig {
  const accounts = accountsStore.get();

  // Check uniqueness
  if (accounts.some((a) => a.id === config.id)) {
    throw new Error(`Account "${config.id}" already exists.`);
  }

  const now = new Date().toISOString();
  const account: AccountConfig = {
    ...config,
    cooldownDays: config.cooldownDays ?? 30,
    enabled: config.enabled ?? true,
    createdAt: now,
    updatedAt: now,
  };

  accounts.push(account);
  accountsStore.set(accounts);

  // Create isolated directory with all subdirectories
  const accountDir = path.join(ACCOUNTS_DIR, account.id);
  ensureDir(accountDir);
  ensureDir(path.join(accountDir, "output", "images"));
  ensureDir(path.join(accountDir, "output", "calendar"));
  ensureDir(path.join(accountDir, "output", "archive"));
  ensureDir(path.join(accountDir, "quotes"));
  ensureDir(path.join(accountDir, "templates"));
  ensureDir(path.join(accountDir, "prompts"));
  ensureDir(path.join(accountDir, "favorites"));

  return account;
}

export function getAccount(id: string): AccountConfig | undefined {
  return accountsStore.get().find((a) => a.id === id);
}

export function getAllAccounts(): AccountConfig[] {
  return accountsStore.get();
}

export function updateAccount(id: string, updates: Partial<AccountConfig>): AccountConfig | undefined {
  const accounts = accountsStore.get();
  const idx = accounts.findIndex((a) => a.id === id);
  if (idx === -1) return undefined;

  accounts[idx] = {
    ...accounts[idx],
    ...updates,
    id, // prevent id change
    updatedAt: new Date().toISOString(),
  };

  accountsStore.set(accounts);
  return accounts[idx];
}

export function deleteAccount(id: string): boolean {
  const accounts = accountsStore.get();
  const idx = accounts.findIndex((a) => a.id === id);
  if (idx === -1) return false;

  accounts.splice(idx, 1);
  accountsStore.set(accounts);
  return true;
}

// ─── Directory helpers ────────────────────────────────────────────────

/**
 * Get the output directory for a specific account.
 * All outputs (images, manifest, queue) go inside <account>/output/.
 * If no accountId is given, returns the global output/ dir for backward compat.
 */
export function getAccountDir(accountId?: string): string {
  if (!accountId) return GLOBAL_OUTPUT;
  const dir = path.join(ACCOUNTS_DIR, accountId, "output");
  ensureDir(dir);
  return dir;
}

/**
 * Get the images directory for a specific account.
 */
export function getAccountImagesDir(accountId?: string): string {
  if (!accountId) return GLOBAL_OUTPUT;
  const dir = path.join(ACCOUNTS_DIR, accountId, "output", "images");
  ensureDir(dir);
  return dir;
}

/**
 * Get the calendar (export) directory for a specific account.
 */
export function getAccountCalendarDir(accountId: string): string {
  const dir = path.join(ACCOUNTS_DIR, accountId, "output", "calendar");
  ensureDir(dir);
  return dir;
}

/**
 * Get the archive (published) directory for a specific account.
 */
export function getAccountArchiveDir(accountId: string): string {
  const dir = path.join(ACCOUNTS_DIR, accountId, "output", "archive");
  ensureDir(dir);
  return dir;
}

/**
 * Get the templates directory for a specific account.
 * Each account can have its own template images for visual differentiation.
 */
export function getAccountTemplatesDir(accountId: string): string {
  const dir = path.join(ACCOUNTS_DIR, accountId, "templates");
  ensureDir(dir);
  return dir;
}

/**
 * Get the quotes directory for a specific account (text files for import).
 */
export function getAccountQuotesDir(accountId: string): string {
  const dir = path.join(ACCOUNTS_DIR, accountId, "quotes");
  ensureDir(dir);
  return dir;
}

/**
 * Get the prompts directory for a specific account.
 */
export function getAccountPromptsDir(accountId: string): string {
  const dir = path.join(ACCOUNTS_DIR, accountId, "prompts");
  ensureDir(dir);
  return dir;
}

/**
 * Get the favorites directory for a specific account.
 */
export function getAccountFavoritesDir(accountId: string): string {
  const dir = path.join(ACCOUNTS_DIR, accountId, "favorites");
  ensureDir(dir);
  return dir;
}

/**
 * Get the quote pool JSON path for a specific account.
 * Lives inside the account's output/ dir alongside manifest and queue.
 */
export function getAccountQuotesPath(accountId: string): string {
  return path.join(getAccountDir(accountId), "quotes.json");
}

/**
 * Get the path to an account-specific file (like queue.json, manifest.json).
 * Falls back to global output/ if no accountId.
 */
export function getAccountFilePath(filename: string, accountId?: string): string {
  return path.join(getAccountDir(accountId), filename);
}

/**
 * Get account statistics summary.
 */
export function getAccountsSummary(): Array<{
  id: string;
  name: string;
  enabled: boolean;
  scopeCount: number;
  hasSchedule: boolean;
}> {
  return accountsStore.get().map((a) => ({
    id: a.id,
    name: a.name,
    enabled: a.enabled,
    scopeCount: a.scope?.length ?? 0,
    hasSchedule: !!a.schedule,
  }));
}
