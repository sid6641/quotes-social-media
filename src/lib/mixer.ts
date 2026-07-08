import fs from "fs";
import path from "path";
import { getLatestBatch } from "./manifest";

const QUOTES_DIR = path.resolve(process.cwd(), "quotes");
const TEMPLATES_DIR = path.resolve(process.cwd(), "templates");

/** Supported image extensions for template files. */
const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

export interface QuoteTemplateCombo {
  quote: string;
  template: string;
}

/**
 * Read all non-empty, non-comment lines from all .txt quote files.
 * Lines starting with "#" or "//" are treated as comments.
 */
function loadQuotes(): string[] {
  if (!fs.existsSync(QUOTES_DIR)) {
    throw new Error(`Quotes directory not found: ${QUOTES_DIR}`);
  }

  const files = fs
    .readdirSync(QUOTES_DIR)
    .filter((f) => f.endsWith(".txt"))
    .sort();

  if (files.length === 0) {
    throw new Error(
      "No quote files found in quotes/. Add a .txt file with one quote per line."
    );
  }

  const quotes: string[] = [];
  for (const file of files) {
    const content = fs.readFileSync(path.join(QUOTES_DIR, file), "utf-8");
    const lines = content
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("#") && !l.startsWith("//"));
    quotes.push(...lines);
  }

  if (quotes.length === 0) {
    throw new Error("No quotes found in quote files. Add some quotes.");
  }

  return quotes;
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
