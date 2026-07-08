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
}

/**
 * Load quotes from the quote pool. Falls back to importing from text files
 * if the pool is empty (auto-seed on first run).
 */
function loadQuotes(): string[] {
  // Check if pool has available quotes
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
  const available = getAvailableQuotes(100);
  if (available.length === 0) {
    throw new Error(
      "No available quotes in the pool. All quotes may be in cooldown. " +
      "Run `npm run cli quotes expire` to recycle expired ones."
    );
  }

  return available.map((q) => q.text);
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
 *
 * @param count Number of combinations to pick (default: 10)
 */
export function pickCombinations(count: number = 10): QuoteTemplateCombo[] {
  const allQuotes = loadQuotes();
  const allTemplates = loadTemplates();
  const recentlyUsed = getRecentlyUsedQuotes();
  const targetCount = count;

  // Prefer quotes not recently used
  const freshQuotes = allQuotes.filter((q) => !recentlyUsed.has(q));
  const pool = freshQuotes.length > 0 ? freshQuotes : allQuotes;

  const combos: QuoteTemplateCombo[] = [];
  const used = new Set<string>();

  for (let i = 0; i < targetCount; i++) {
    const quote = pool[i % pool.length];
    const template = allTemplates[i % allTemplates.length];
    const key = `${quote}::${template}`;

    // If this combo was already picked, rotate template
    if (used.has(key)) {
      let altIndex = (i + 1) % allTemplates.length;
      let attempts = 0;
      while (
        used.has(`${quote}::${allTemplates[altIndex]}`) &&
        attempts < allTemplates.length
      ) {
        altIndex = (altIndex + 1) % allTemplates.length;
        attempts++;
      }
      combos.push({ quote, template: allTemplates[altIndex] });
      used.add(`${quote}::${allTemplates[altIndex]}`);
    } else {
      combos.push({ quote, template });
      used.add(key);
    }
  }

  return combos;
}
