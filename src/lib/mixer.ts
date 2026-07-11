import fs from "fs";
import path from "path";
import { getLatestBatch } from "./manifest";
import { getAvailableQuotes, getPoolStats, importQuotesFromFile } from "./quote-pool";
import { getAccountTemplatesDir, getAccountQuotesDir } from "./account";

const GLOBAL_TEMPLATES_DIR = path.resolve(process.cwd(), "templates");

/** Supported image extensions for template files. */
const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

export interface QuoteTemplateCombo {
  quote: string;
  template: string;
  /** ID in the quote pool, for tracking usage. Undefined for legacy imports. */
  quoteId?: string;
}

interface QuoteEntry {
  text: string;
  id?: string;
}

/**
 * Load quotes from the quote pool, scoped to an account if provided.
 * Seeds from account-specific quotes/ dir if pool is empty.
 * Will NOT fall back to the global quotes/ dir — each account manages its own quotes.
 */
function loadQuotes(accountId?: string): QuoteEntry[] {
  const stats = getPoolStats(accountId);

  // Seed from text files if pool is empty
  if (stats.total === 0) {
    const quoteSources: string[] = [];

    // Only try account-specific quotes dir
    if (accountId) {
      const accountQuotesDir = getAccountQuotesDir(accountId);
      if (fs.existsSync(accountQuotesDir)) {
        const files = fs.readdirSync(accountQuotesDir)
          .filter((f) => f.endsWith(".txt"))
          .sort();
        quoteSources.push(...files.map((f) => path.join(accountQuotesDir, f)));
      }
    }

    if (quoteSources.length === 0) {
      const scope = accountId
        ? `Account "${accountId}" has no quotes in its pool and no .txt files in accounts/${accountId}/quotes/.`
        : "No quotes in the global pool and no global quotes/ directory.";
      throw new Error(
        `${scope} Add quotes via the quotes CLI: npm run cli quotes add "your quote here" --account <id>`
      );
    }

    let totalSeeded = 0;
    for (const filePath of quoteSources) {
      const result = importQuotesFromFile(filePath, {
        source: "imported",
      }, accountId);
      totalSeeded += result.imported;
    }

    if (totalSeeded === 0) {
      throw new Error(
        `No quotes could be imported from ${accountId ? `accounts/${accountId}/quotes/` : "quotes/"}. Add quotes via the quotes CLI: npm run cli quotes add "your quote here" --account <id>`
      );
    }
  }

  // Get available quotes from the pool
  let available = getAvailableQuotes(100, accountId);
  if (available.length === 0) {
    throw new Error(
      "No available quotes in the pool. Run `npm run cli quotes expire` to recycle expired ones."
    );
  }

  return available.map((q) => ({ text: q.text, id: q.id }));
}

/**
 * Discover available template images.
 * Checks account-specific templates/ first, falls back to global templates/.
 */
function loadTemplates(accountId?: string): string[] {
  // Try account-specific templates first
  if (accountId) {
    const accountTemplatesDir = getAccountTemplatesDir(accountId);
    if (fs.existsSync(accountTemplatesDir)) {
      const files = fs.readdirSync(accountTemplatesDir).sort();
      const images = files.filter((f) => IMAGE_EXTS.has(path.extname(f).toLowerCase()));
      if (images.length > 0) return images;
    }
  }

  // Fall back to global templates/
  if (!fs.existsSync(GLOBAL_TEMPLATES_DIR)) {
    throw new Error(`Templates directory not found: ${GLOBAL_TEMPLATES_DIR}`);
  }

  const files = fs.readdirSync(GLOBAL_TEMPLATES_DIR).sort();
  const images = files.filter((f) => IMAGE_EXTS.has(path.extname(f).toLowerCase()));

  if (images.length === 0) {
    throw new Error(
      "No template images found in templates/. Add .jpg, .png, or .webp files."
    );
  }

  return images;
}

/**
 * Get a set of recently used quote texts from the latest batch manifest
 * to avoid immediate repeats.
 */
function getRecentlyUsedQuotes(accountId?: string): Set<string> {
  try {
    const batch = getLatestBatch(accountId);
    if (!batch) return new Set();
    return new Set(batch.images.map((img) => img.quote));
  } catch {
    return new Set();
  }
}

/**
 * Pick quote+template combinations for a specific account.
 *
 * - Quotes sourced from the account's pool (or global if no account)
 * - Templates sourced from account's templates/ dir, fallback to global
 * - Avoids reusing the same quote+template combo in one batch
 * - Soft-deduplicates quotes from the most recent batch
 *
 * @param count Number of combinations to pick (default: 10)
 * @param accountId Optional account ID for scoped templates and quotes
 */
export function pickCombinations(
  count: number = 10,
  accountId?: string,
  all?: boolean
): QuoteTemplateCombo[] {
  const allQuotes = loadQuotes(accountId);
  const allTemplates = loadTemplates(accountId);

  // "All" mode: full Cartesian product (n quotes × m templates)
  if (all) {
    const combos: QuoteTemplateCombo[] = [];
    for (const quote of allQuotes) {
      for (const template of allTemplates) {
        combos.push({ quote: quote.text, template, quoteId: quote.id });
      }
    }
    return combos;
  }

  const recentlyUsed = getRecentlyUsedQuotes(accountId);
  const targetCount = count;

  // Prefer quotes not recently used
  const poolTexts = allQuotes.map((q) => q.text);
  const freshQuotes = allQuotes.filter((q) => !recentlyUsed.has(q.text));
  const pool = freshQuotes.length > 0 ? freshQuotes : allQuotes;

  const combos: QuoteTemplateCombo[] = [];
  const used = new Set<string>();

  for (let i = 0; i < targetCount; i++) {
    const entry = pool[i % pool.length];
    const template = allTemplates[i % allTemplates.length];
    const key = `${entry.text}::${template}`;

    if (used.has(key)) {
      let altIndex = (i + 1) % allTemplates.length;
      let attempts = 0;
      while (
        used.has(`${entry.text}::${allTemplates[altIndex]}`) &&
        attempts < allTemplates.length
      ) {
        altIndex = (altIndex + 1) % allTemplates.length;
        attempts++;
      }
      combos.push({ quote: entry.text, template: allTemplates[altIndex], quoteId: entry.id });
      used.add(`${entry.text}::${allTemplates[altIndex]}`);
    } else {
      combos.push({ quote: entry.text, template, quoteId: entry.id });
      used.add(key);
    }
  }

  return combos;
}
