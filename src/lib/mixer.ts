import fs from "fs";
import path from "path";
import { getLatestBatch } from "./manifest";
import { getAvailableQuotes, getPoolStats, importQuotesFromFile } from "./quote-pool";

const QUOTES_DIR = path.resolve(process.cwd(), "quotes");
const TEMPLATES_DIR = path.resolve(process.cwd(), "templates");

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
 * Load quotes from the quote pool. Falls back to importing from text files
 * if the pool is empty (auto-seed on first run).
 * Returns quote texts with optional pool IDs for usage tracking.
 */
function loadQuotes(themeFilter?: string[]): QuoteEntry[] {
  const stats = getPoolStats();

  // Seed from text files if pool is empty
  if (stats.total === 0) {
    if (!fs.existsSync(QUOTES_DIR)) {
      throw new Error(`Quotes directory not found: ${QUOTES_DIR}`);
    }

    const files = fs
      .readdirSync(QUOTES_DIR)
      .filter((f) => f.endsWith(".txt"))
      .sort();

    let totalSeeded = 0;
    for (const file of files) {
      const result = importQuotesFromFile(path.join(QUOTES_DIR, file), {
        source: "imported",
      });
      totalSeeded += result.imported;
    }

    if (totalSeeded === 0) {
      throw new Error(
        "No quotes found. Add quotes via text files or the quotes CLI."
      );
    }
  }

  // Get available quotes from the pool
  // If themeFilter is set, try matching themes first, then fall back to any
  let available = getAvailableQuotes(100, themeFilter?.join(","));
  if (available.length === 0 && themeFilter) {
    // Fall back to any available quote
    available = getAvailableQuotes(100);
  }
  if (available.length === 0) {
    throw new Error(
      "No available quotes in the pool. Run `npm run cli quotes expire` to recycle expired ones."
    );
  }

  return available.map((q) => ({ text: q.text, id: q.id }));
}

/**
 * Discover available template images from the templates/ directory.
 */
function loadTemplates(): string[] {
  if (!fs.existsSync(TEMPLATES_DIR)) {
    throw new Error(`Templates directory not found: ${TEMPLATES_DIR}`);
  }

  const files = fs.readdirSync(TEMPLATES_DIR).sort();
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
function getRecentlyUsedQuotes(): Set<string> {
  try {
    const batch = getLatestBatch();
    if (!batch) return new Set();
    return new Set(batch.images.map((img) => img.quote));
  } catch {
    return new Set();
  }
}

/**
 * Pick quote+template combinations.
 *
 * - Cycles through quotes if fewer than `count` unique quotes exist
 * - Cycles through templates if fewer than `count` unique templates exist
 * - Avoids reusing the same quote+template combo in one batch
 * - Soft-deduplicates quotes from the most recent batch
 * - If themeFilter is provided, only picks quotes matching those themes
 *
 * @param count Number of combinations to pick (default: 10)
 * @param themeFilter Optional array of theme names to filter quotes
 */
export function pickCombinations(
  count: number = 10,
  themeFilter?: string[]
): QuoteTemplateCombo[] {
  const allQuotes = loadQuotes(themeFilter);
  const allTemplates = loadTemplates();
  const recentlyUsed = getRecentlyUsedQuotes();
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
