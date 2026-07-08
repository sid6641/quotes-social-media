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

const ACCOUNTS_DIR = path.resolve(process.cwd(), "output");
const ACCOUNTS_FILE = path.resolve(process.cwd(), "output", "accounts.json");
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
  theme?: string[];         // which quote themes to pull from
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

let accountsCache: AccountConfig[] | null = null;

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function accountsFilePath(): string {
  return path.join(ACCOUNTS_DIR, "accounts.json");
}

function readAccounts(): AccountConfig[] {
  if (accountsCache) return accountsCache;
  ensureDir(ACCOUNTS_DIR);
  const filePath = accountsFilePath();
  if (!fs.existsSync(filePath)) {
    accountsCache = [];
    return accountsCache;
  }
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    accountsCache = JSON.parse(raw) as AccountConfig[];
    return accountsCache;
  } catch {
    accountsCache = [];
    return accountsCache;
  }
}

function writeAccounts(accounts: AccountConfig[]): void {
  ensureDir(ACCOUNTS_DIR);
  fs.writeFileSync(accountsFilePath(), JSON.stringify(accounts, null, 2), "utf-8");
  accountsCache = accounts;
}

export function invalidateAccountsCache(): void {
  accountsCache = null;
}

// ─── CRUD ─────────────────────────────────────────────────────────────

export function createAccount(config: Omit<AccountConfig, "createdAt" | "updatedAt">): AccountConfig {
  const accounts = readAccounts();

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
  writeAccounts(accounts);

  // Create isolated directory with subdirectories
  const accountDir = path.join(ACCOUNTS_DIR, account.id);
  ensureDir(accountDir);
  ensureDir(path.join(accountDir, "images"));
  ensureDir(path.join(accountDir, "calendar"));
  ensureDir(path.join(accountDir, "archive"));

  return account;
}

export function getAccount(id: string): AccountConfig | undefined {
  return readAccounts().find((a) => a.id === id);
}

export function getAllAccounts(): AccountConfig[] {
  return readAccounts();
}

export function updateAccount(id: string, updates: Partial<AccountConfig>): AccountConfig | undefined {
  const accounts = readAccounts();
  const idx = accounts.findIndex((a) => a.id === id);
  if (idx === -1) return undefined;

  accounts[idx] = {
    ...accounts[idx],
    ...updates,
    id, // prevent id change
    updatedAt: new Date().toISOString(),
  };

  writeAccounts(accounts);
  return accounts[idx];
}

export function deleteAccount(id: string): boolean {
  const accounts = readAccounts();
  const idx = accounts.findIndex((a) => a.id === id);
  if (idx === -1) return false;

  accounts.splice(idx, 1);
  writeAccounts(accounts);
  return true;
}

// ─── Directory helpers ────────────────────────────────────────────────

/**
 * Get the output directory for a specific account.
 * If no accountId is given, returns the global output/ dir.
 */
export function getAccountDir(accountId?: string): string {
  if (!accountId) return GLOBAL_OUTPUT;
  const dir = path.join(ACCOUNTS_DIR, accountId);
  ensureDir(dir);
  return dir;
}

/**
 * Get the images directory for a specific account.
 */
export function getAccountImagesDir(accountId?: string): string {
  if (!accountId) return GLOBAL_OUTPUT;
  const dir = path.join(ACCOUNTS_DIR, accountId, "images");
  ensureDir(dir);
  return dir;
}

/**
 * Get the calendar (export) directory for a specific account.
 */
export function getAccountCalendarDir(accountId: string): string {
  const dir = path.join(ACCOUNTS_DIR, accountId, "calendar");
  ensureDir(dir);
  return dir;
}

/**
 * Get the archive (published) directory for a specific account.
 */
export function getAccountArchiveDir(accountId: string): string {
  const dir = path.join(ACCOUNTS_DIR, accountId, "archive");
  ensureDir(dir);
  return dir;
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
  themeCount: number;
  hasSchedule: boolean;
}> {
  return readAccounts().map((a) => ({
    id: a.id,
    name: a.name,
    enabled: a.enabled,
    themeCount: a.theme?.length ?? 0,
    hasSchedule: !!a.schedule,
  }));
}
