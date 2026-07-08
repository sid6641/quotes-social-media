/**
 * Quote Pool — structured quote management with lifecycle.
 *
 * Replaces the flat quotes/*.txt approach with a self-managing pool
 * that tracks state (available → used → cooldown → recycle),
 * theme categories, usage history, and per-account tracking.
 *
 * Stored at: output/quote-pool.json
 */

import fs from "fs";
import path from "path";

const POOL_PATH = path.resolve(process.cwd(), "output", "quote-pool.json");

// ─── Types ───────────────────────────────────────────────────────────

export type QuoteStatus = "available" | "used" | "cooldown" | "retired";

export interface QuoteEntry {
  id: string;
  text: string;
  author?: string;
  theme?: string;
  source: "imported" | "ai-generated" | "manual";
  status: QuoteStatus;
  usageCount: number;
  lastUsedAt?: string;
  /** Account IDs that have used this quote (for cross-account dedup). */
  usedByAccounts: string[];
  cooldownUntil?: string;
  createdAt: string;
  updatedAt: string;
}

interface QuotePool {
  quotes: QuoteEntry[];
}

// ─── Store ────────────────────────────────────────────────────────────

let poolCache: QuotePool | null = null;

function ensureDir(): void {
  const dir = path.dirname(POOL_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readPool(): QuotePool {
  if (poolCache) return poolCache;
  ensureDir();
  if (!fs.existsSync(POOL_PATH)) {
    poolCache = { quotes: [] };
    return poolCache;
  }
  try {
    const raw = fs.readFileSync(POOL_PATH, "utf-8");
    poolCache = JSON.parse(raw) as QuotePool;
    return poolCache;
  } catch {
    poolCache = { quotes: [] };
    return poolCache;
  }
}

function writePool(pool: QuotePool): void {
  ensureDir();
  fs.writeFileSync(POOL_PATH, JSON.stringify(pool, null, 2), "utf-8");
  poolCache = pool;
}

export function invalidatePoolCache(): void {
  poolCache = null;
}

// ─── IDs ──────────────────────────────────────────────────────────────

let idCounter = 0;

function generateQuoteId(): string {
  const pool = readPool();
  const maxId = pool.quotes.reduce((max, q) => {
    const num = parseInt(q.id.replace("q-", ""), 10);
    return num > max ? num : max;
  }, idCounter);
  idCounter = maxId + 1;
  return `q-${String(idCounter).padStart(5, "0")}`;
}

// ─── CRUD ─────────────────────────────────────────────────────────────

export interface AddQuoteOptions {
  author?: string;
  theme?: string;
  source?: QuoteEntry["source"];
}

/**
 * Add a single quote to the pool. Returns the new entry.
 */
export function addQuote(
  text: string,
  options: AddQuoteOptions = {}
): QuoteEntry {
  const pool = readPool();
  const now = new Date().toISOString();
  const entry: QuoteEntry = {
    id: generateQuoteId(),
    text: text.trim(),
    author: options.author,
    theme: options.theme,
    source: options.source || "manual",
    status: "available",
    usageCount: 0,
    usedByAccounts: [],
    createdAt: now,
    updatedAt: now,
  };
  pool.quotes.push(entry);
  writePool(pool);
  return entry;
}

/**
 * Batch import quotes from a string array. Returns the count added.
 */
export function importQuotes(
  texts: string[],
  options: AddQuoteOptions = {}
): number {
  const pool = readPool();
  const now = new Date().toISOString();
  const source = options.source || "imported";
  let count = 0;

  for (const raw of texts) {
    const text = raw.trim();
    if (!text) continue;
    // Skip duplicates
    if (pool.quotes.some((q) => q.text.toLowerCase() === text.toLowerCase())) {
      continue;
    }
    pool.quotes.push({
      id: generateQuoteId(),
      text,
      author: options.author,
      theme: options.theme,
      source,
      status: "available",
      usageCount: 0,
      usedByAccounts: [],
      createdAt: now,
      updatedAt: now,
    });
    count++;
  }

  if (count > 0) writePool(pool);
  return count;
}

/**
 * Import quotes from a text file (one quote per line, # for comments).
 */
export function importQuotesFromFile(
  filePath: string,
  options: AddQuoteOptions = {}
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

  const imported = importQuotes(lines, options);
  return { imported, skipped: lines.length - imported, errors };
}

/**
 * Get quotes from the pool, optionally filtered.
 */
export function getQuotes(filters?: {
  status?: QuoteStatus | QuoteStatus[];
  theme?: string;
  limit?: number;
  offset?: number;
}): QuoteEntry[] {
  const pool = readPool();
  let results = [...pool.quotes];

  if (filters?.status) {
    const statuses = Array.isArray(filters.status)
      ? filters.status
      : [filters.status];
    results = results.filter((q) => statuses.includes(q.status));
  }

  if (filters?.theme) {
    results = results.filter((q) => q.theme === filters.theme);
  }

  // Sort: newest first
  results.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const offset = filters?.offset || 0;
  const limit = filters?.limit || results.length;
  return results.slice(offset, offset + limit);
}

/**
 * Get N available quotes for batch generation, optionally filtered by theme.
 * Skips quotes in cooldown or retired state.
 * Prefers quotes used the fewest times / longest ago.
 */
export function getAvailableQuotes(
  count: number,
  theme?: string
): QuoteEntry[] {
  const pool = readPool();
  const now = new Date();

  // Support both single theme and comma-separated themes
  const themes = theme
    ? theme.split(",").map((t) => t.trim()).filter(Boolean)
    : undefined;

  let candidates = pool.quotes.filter((q) => {
    if (q.status === "retired") return false;
    if (q.status === "cooldown" && q.cooldownUntil) {
      if (new Date(q.cooldownUntil) > now) return false;
    }
    if (q.status === "used") return false;
    if (themes && themes.length > 0) {
      if (!q.theme || !themes.includes(q.theme)) return false;
    }
    return true;
  });

  // Sort: least used first, then longest since last used
  candidates.sort((a, b) => {
    if (a.usageCount !== b.usageCount) return a.usageCount - b.usageCount;
    const aTime = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : 0;
    const bTime = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : 0;
    return aTime - bTime;
  });

  return candidates.slice(0, count);
}

/**
 * Mark a quote as used by an account, moving it to cooldown.
 */
export function markQuoteUsed(
  quoteId: string,
  accountId: string,
  cooldownDays: number = 30
): boolean {
  const pool = readPool();
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

  // Auto-retire after 5 uses
  if (quote.usageCount >= 5) {
    quote.status = "retired";
  }

  writePool(pool);
  return true;
}

/**
 * Manually recycle a cooldown/retired quote back to available.
 */
export function recycleQuote(quoteId: string): boolean {
  const pool = readPool();
  const quote = pool.quotes.find((q) => q.id === quoteId);
  if (!quote) return false;

  quote.status = "available";
  quote.cooldownUntil = undefined;
  quote.updatedAt = new Date().toISOString();
  writePool(pool);
  return true;
}

/**
 * Delete a quote from the pool.
 */
export function deleteQuote(quoteId: string): boolean {
  const pool = readPool();
  const idx = pool.quotes.findIndex((q) => q.id === quoteId);
  if (idx === -1) return false;

  pool.quotes.splice(idx, 1);
  writePool(pool);
  return true;
}

/**
 * Get pool statistics.
 */
export function getPoolStats(): {
  total: number;
  available: number;
  cooldown: number;
  retired: number;
  used: number;
  byTheme: Record<string, number>;
} {
  const pool = readPool();
  const stats = {
    total: pool.quotes.length,
    available: 0,
    cooldown: 0,
    retired: 0,
    used: 0,
    byTheme: {} as Record<string, number>,
  };

  for (const q of pool.quotes) {
    if (q.status === "available") stats.available++;
    else if (q.status === "cooldown") stats.cooldown++;
    else if (q.status === "retired") stats.retired++;
    else if (q.status === "used") stats.used++;

    if (q.theme) {
      stats.byTheme[q.theme] = (stats.byTheme[q.theme] || 0) + 1;
    }
  }

  return stats;
}

/**
 * Run cooldown expiry — recycle any quotes whose cooldown has passed.
 * Returns the number of quotes recycled.
 */
export function expireCooldowns(): number {
  const pool = readPool();
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

  if (recycled > 0) writePool(pool);
  return recycled;
}
