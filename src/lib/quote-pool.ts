/**
 * Quote Pool — structured quote management with lifecycle.
 *
 * Each account has its own isolated quote pool at accounts/<account>/output/quotes.json.
 * Replaces the flat quotes/*.txt approach with a self-managing pool
 * that tracks state (available → used → cooldown → recycle).
 */

import fs from "fs";
import path from "path";
import { getAccountQuotesPath } from "./account";

const GLOBAL_POOL_PATH = path.resolve(process.cwd(), "output", "quote-pool.json");

// ─── Types ───────────────────────────────────────────────────────────

export type QuoteStatus = "available" | "used" | "cooldown" | "retired";

export interface QuoteEntry {
  id: string;
  text: string;
  author?: string;
  source: "imported" | "ai-generated" | "manual";
  status: QuoteStatus;
  usageCount: number;
  lastUsedAt?: string;
  usedByAccounts: string[];
  cooldownUntil?: string;
  isFavorite?: boolean;
  createdAt: string;
  updatedAt: string;
}

interface QuotePool {
  quotes: QuoteEntry[];
}

// ─── Store ────────────────────────────────────────────────────────────

const poolCaches = new Map<string, QuotePool | null>();

function getPoolPath(accountId?: string): string {
  if (accountId) return getAccountQuotesPath(accountId);
  return GLOBAL_POOL_PATH;
}

function ensurePoolDir(accountId?: string): void {
  const p = getPoolPath(accountId);
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readPool(accountId?: string): QuotePool {
  const cacheKey = accountId || "__global__";
  const cached = poolCaches.get(cacheKey);
  if (cached) return cached;

  const poolPath = getPoolPath(accountId);
  ensurePoolDir(accountId);

  if (!fs.existsSync(poolPath)) {
    poolCaches.set(cacheKey, { quotes: [] });
    return { quotes: [] };
  }
  try {
    const raw = fs.readFileSync(poolPath, "utf-8");
    const pool = JSON.parse(raw) as QuotePool;
    poolCaches.set(cacheKey, pool);
    return pool;
  } catch {
    poolCaches.set(cacheKey, { quotes: [] });
    return { quotes: [] };
  }
}

function writePool(pool: QuotePool, accountId?: string): void {
  const poolPath = getPoolPath(accountId);
  ensurePoolDir(accountId);
  fs.writeFileSync(poolPath, JSON.stringify(pool, null, 2), "utf-8");
  poolCaches.set(accountId || "__global__", pool);
}

export function invalidatePoolCache(accountId?: string): void {
  if (accountId) {
    poolCaches.delete(accountId);
  } else {
    poolCaches.clear();
  }
}

// ─── CRUD ─────────────────────────────────────────────────────────────

export interface AddQuoteOptions {
  author?: string;
  source?: QuoteEntry["source"];
}

function generateQuoteId(accountId?: string): string {
  const pool = readPool(accountId);
  let maxId = 0;
  for (const q of pool.quotes) {
    const num = parseInt(q.id.replace("q-", ""), 10);
    if (num > maxId) maxId = num;
  }
  return `q-${String(maxId + 1).padStart(5, "0")}`;
}

/**
 * Add a single quote to an account's pool. Returns the new entry.
 */
export function addQuote(
  text: string,
  options: AddQuoteOptions = {},
  accountId?: string
): QuoteEntry {
  const pool = readPool(accountId);
  const now = new Date().toISOString();
  const entry: QuoteEntry = {
    id: generateQuoteId(accountId),
    text: text.trim(),
    author: options.author,
    source: options.source || "manual",
    status: "available",
    usageCount: 0,
    usedByAccounts: [],
    createdAt: now,
    updatedAt: now,
  };
  pool.quotes.push(entry);
  writePool(pool, accountId);
  return entry;
}

/**
 * Batch import quotes from a string array into an account's pool.
 */
export function importQuotes(
  texts: string[],
  options: AddQuoteOptions = {},
  accountId?: string
): number {
  const pool = readPool(accountId);
  const now = new Date().toISOString();
  let count = 0;

  for (const raw of texts) {
    const text = raw.trim();
    if (!text) continue;
    if (pool.quotes.some((q) => q.text.toLowerCase() === text.toLowerCase())) {
      continue;
    }
    pool.quotes.push({
      id: generateQuoteId(accountId),
      text,
      author: options.author,
      source: options.source || "manual",
      status: "available",
      usageCount: 0,
      usedByAccounts: [],
      createdAt: now,
      updatedAt: now,
    });
    count++;
  }

  if (count > 0) writePool(pool, accountId);
  return count;
}

/**
 * Import quotes from a text file into an account's pool.
 */
export function importQuotesFromFile(
  filePath: string,
  options: AddQuoteOptions = {},
  accountId?: string
): { imported: number; skipped: number; errors: string[] } {
  const errors: string[] = [];
  if (!fs.existsSync(filePath)) {
    return { imported: 0, skipped: 0, errors: [`File not found: ${filePath}`] };
  }

  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#") && !l.startsWith("//"));

  const imported = importQuotes(lines, options, accountId);
  return { imported, skipped: lines.length - imported, errors };
}

/**
 * Get quotes from an account's pool, optionally filtered.
 */
export function getQuotes(filters?: {
  status?: QuoteStatus | QuoteStatus[];
  limit?: number;
  offset?: number;
}, accountId?: string): QuoteEntry[] {
  const pool = readPool(accountId);
  let results = [...pool.quotes];

  if (filters?.status) {
    const statuses = Array.isArray(filters.status)
      ? filters.status
      : [filters.status];
    results = results.filter((q) => statuses.includes(q.status));
  }

  results.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const offset = filters?.offset || 0;
  const limit = filters?.limit || results.length;
  return results.slice(offset, offset + limit);
}

/**
 * Get N available quotes from an account's pool for batch generation.
 */
export function getAvailableQuotes(
  count: number,
  accountId?: string
): QuoteEntry[] {
  const pool = readPool(accountId);
  const now = new Date();

  let candidates = pool.quotes.filter((q) => {
    if (q.status === "retired") return false;
    if (q.status === "cooldown" && q.cooldownUntil) {
      if (new Date(q.cooldownUntil) > now) return false;
    }
    if (q.status === "used") return false;
    return true;
  });

  candidates.sort((a, b) => {
    if (a.usageCount !== b.usageCount) return a.usageCount - b.usageCount;
    const aTime = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : 0;
    const bTime = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : 0;
    return aTime - bTime;
  });

  return candidates.slice(0, count);
}

/**
 * Mark a quote as used, moving it to cooldown within its account pool.
 */
export function markQuoteUsed(
  quoteId: string,
  accountId: string,
  cooldownDays: number = 30
): boolean {
  const pool = readPool(accountId);
  const quote = pool.quotes.find((q) => q.id === quoteId);
  if (!quote) return false;

  const now = new Date();
  quote.status = "cooldown";
  quote.usageCount += 1;
  quote.lastUsedAt = now.toISOString();
  if (!quote.usedByAccounts.includes(accountId)) {
    quote.usedByAccounts.push(accountId);
  }
  const cooldownEnd = new Date(now);
  cooldownEnd.setDate(cooldownEnd.getDate() + cooldownDays);
  quote.cooldownUntil = cooldownEnd.toISOString();
  quote.updatedAt = now.toISOString();

  if (quote.usageCount >= 5) {
    quote.status = "retired";
  }

  writePool(pool, accountId);
  return true;
}

/**
 * Manually recycle a cooldown/retired quote back to available within its pool.
 */
export function recycleQuote(quoteId: string, accountId?: string): boolean {
  const pool = readPool(accountId);
  const quote = pool.quotes.find((q) => q.id === quoteId);
  if (!quote) return false;

  quote.status = "available";
  quote.cooldownUntil = undefined;
  quote.updatedAt = new Date().toISOString();
  writePool(pool, accountId);
  return true;
}

/**
 * Toggle the favorite status of a quote.
 */
export function toggleQuoteFavorite(quoteId: string, accountId?: string): boolean {
  const pool = readPool(accountId);
  const quote = pool.quotes.find((q) => q.id === quoteId);
  if (!quote) return false;

  quote.isFavorite = !quote.isFavorite;
  quote.updatedAt = new Date().toISOString();
  writePool(pool, accountId);
  return true;
}

/**
 * Delete a quote from an account's pool.
 */
export function deleteQuote(quoteId: string, accountId?: string): boolean {
  const pool = readPool(accountId);
  const idx = pool.quotes.findIndex((q) => q.id === quoteId);
  if (idx === -1) return false;

  pool.quotes.splice(idx, 1);
  writePool(pool, accountId);
  return true;
}

/**
 * Get pool statistics for an account.
 */
export function getPoolStats(accountId?: string): {
  total: number;
  available: number;
  cooldown: number;
  retired: number;
  used: number;
} {
  const pool = readPool(accountId);
  const stats = {
    total: pool.quotes.length,
    available: 0,
    cooldown: 0,
    retired: 0,
    used: 0,
  };

  for (const q of pool.quotes) {
    if (q.status === "available") stats.available++;
    else if (q.status === "cooldown") stats.cooldown++;
    else if (q.status === "retired") stats.retired++;
    else if (q.status === "used") stats.used++;
  }

  return stats;
}

/**
 * Run cooldown expiry — recycle any quotes whose cooldown has passed.
 */
export function expireCooldowns(accountId?: string): number {
  const pool = readPool(accountId);
  const now = new Date();
  let recycled = 0;

  for (const q of pool.quotes) {
    if (
      q.status === "cooldown" &&
      q.cooldownUntil &&
      new Date(q.cooldownUntil) <= now
    ) {
      q.status = "available";
      q.cooldownUntil = undefined;
      q.updatedAt = now.toISOString();
      recycled++;
    }
  }

  if (recycled > 0) writePool(pool, accountId);
  return recycled;
}
