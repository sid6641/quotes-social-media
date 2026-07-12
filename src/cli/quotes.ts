/**
 * CLI commands for quote pool management.
 *
 * Usage:
 *   npm run cli quotes list
 *   npm run cli quotes list --status available
 *   npm run cli quotes add "The unexamined life is not worth living." --author Socrates
 *   npm run cli quotes import --file quotes/sample.txt
 *   npm run cli quotes stats
 *   npm run cli quotes expire
 *   npm run cli quotes generate --count 10 --theme motivation [--account testplay]
 *   npm run cli quotes generate-image "Quote text" --theme minimal [--out output.png]
 */
import {
  getQuotes,
  addQuote,
  importQuotesFromFile,
  getPoolStats,
  expireCooldowns,
  importQuotes,
} from "../lib/quote-pool";
import { generateQuotes, generateQuoteImageDirect } from "../lib/quotes-generator";
import { createLogger } from "../lib/logger";
import fs from "fs";
import path from "path";

const log = createLogger("quotes");

export interface QuotesOptions {
  subcommand: string;
  status?: string;
  text?: string;
  author?: string;
  file?: string;
  theme?: string;
  count?: number;
  out?: string;
  account?: string;
  jsonOutput?: boolean;
}

// ── Generate (Plan A) ─────────────────────────────────────────────

async function generateCmd(options: QuotesOptions): Promise<void> {
  const count = options.count || 10;
  const theme = options.theme;
  const accountId = options.account;

  log.info({ count, theme, account: accountId }, "Generating quotes via Gemini...");

  const quotes = await generateQuotes(count, theme);

  if (options.jsonOutput) {
    console.log(JSON.stringify({ success: true, quotes }, null, 2));
    return;
  }

  log.info({ generated: quotes.length }, `✨ Generated ${quotes.length} quotes`);

  // Import into pool
  const texts = quotes.map((q) => q.text);
  const imported = importQuotes(texts, { source: "ai-generated" }, accountId);

  log.info({ imported }, `📥 Imported ${imported} new quotes into pool`);

  if (imported < quotes.length) {
    log.info({ skipped: quotes.length - imported }, `${quotes.length - imported} were duplicates (already in pool)`);
  }
}

// ── Generate Image (Plan B) ────────────────────────────────────────

async function generateImageCmd(options: QuotesOptions): Promise<void> {
  if (!options.text) {
    log.error("Missing quote text. Usage: quotes generate-image \"quote text\"");
    return;
  }

  const outPath = options.out || `quote-${Date.now()}.png`;
  log.info({ theme: options.theme }, "Generating Instagram-ready image...");

  const imageBuffer = await generateQuoteImageDirect(options.text, options.theme);

  const fullPath = path.resolve(outPath);
  fs.writeFileSync(fullPath, imageBuffer);

  if (options.jsonOutput) {
    console.log(JSON.stringify({ success: true, file: fullPath }));
    return;
  }

  log.info({ file: fullPath }, `✅ Image saved to ${fullPath}`);
}

export async function runQuotes(options: QuotesOptions): Promise<void> {
  const { subcommand } = options;

  switch (subcommand) {
    case "list":
      return listQuotes(options);
    case "add":
      return addQuoteCmd(options);
    case "import":
      return importCmd(options);
    case "stats":
      return showStats(options);
    case "expire":
      return expireCmd(options);
    case "generate":
      return generateCmd(options);
    case "generate-image":
      return generateImageCmd(options);
    default:
      log.warn({ subcommand }, `Unknown quotes subcommand: "${subcommand}"`);
      log.info("Available: list, add, import, stats, expire, generate, generate-image");
  }
}

async function listQuotes(options: QuotesOptions): Promise<void> {
  const quotes = getQuotes({
    status: options.status as any,
  });

  if (options.jsonOutput) {
    console.log(JSON.stringify({ success: true, quotes }));
    return;
  }

  if (quotes.length === 0) {
    log.info("No quotes found matching the filters.");
    return;
  }

  log.info(
    { count: quotes.length, status: options.status || "all" },
    `📋 ${quotes.length} quote(s)`
  );

  if (quotes.length <= 50) {
    for (const q of quotes) {
      const tags = [q.status, `used ${q.usageCount}x`]
        .filter(Boolean)
        .join(" · ");
      log.info({ id: q.id, status: q.status, usageCount: q.usageCount },
        `  [${tags}] "${q.text.substring(0, 80)}${q.text.length > 80 ? "..." : ""}"`);
    }
  }
}

async function addQuoteCmd(options: QuotesOptions): Promise<void> {
  if (!options.text) {
    log.warn("Missing quote text.");
    return;
  }

  const entry = addQuote(options.text, {
    author: options.author,
    source: "manual",
  });

  if (options.jsonOutput) {
    console.log(JSON.stringify({ success: true, quote: entry }));
  } else {
    log.info({ id: entry.id }, `✅ Quote added: "${entry.text.substring(0, 60)}..."`);
  }
}

async function importCmd(options: QuotesOptions): Promise<void> {
  if (!options.file) {
    log.warn("Missing --file path.");
    return;
  }

  const result = importQuotesFromFile(options.file, {
    author: options.author,
    source: "imported",
  });

  if (options.jsonOutput) {
    console.log(JSON.stringify({ success: true, ...result }));
    return;
  }

  if (result.errors.length > 0) {
    for (const err of result.errors) {
      log.warn({ err }, `⚠️ ${err}`);
    }
  }

  log.info(
    { imported: result.imported, skipped: result.skipped },
    `📥 Imported ${result.imported} quotes (${result.skipped} skipped)`
  );
}

async function showStats(options: QuotesOptions): Promise<void> {
  const stats = getPoolStats();
  if (options.jsonOutput) {
    console.log(JSON.stringify({ success: true, stats }));
  } else {
    log.info(stats, "📊 Quote Pool Statistics");
  }
}

async function expireCmd(options: QuotesOptions): Promise<void> {
  const recycled = expireCooldowns();
  if (options.jsonOutput) {
    console.log(JSON.stringify({ success: true, recycled }));
  } else {
    log.info({ recycled }, `♻️ Recycled ${recycled} quotes from cooldown`);
  }
}

export function printQuotesUsage(): void {
  console.log(`
Quotes Commands:
  list                     List all quotes
  list --status available  Filter by status (available/cooldown/retired)
  add "text"               Add a single quote
  add "text" --author X
  import --file path       Import from text file (one quote per line)
  stats                    Show pool statistics
  expire                   Recycle expired cooldowns
  generate --count 10      Generate quotes via Gemini (Plan A)
  generate --theme motif   With optional theme filter
  generate --account sid   Scope to account
  generate-image "text"    Generate Instagram-ready image directly (Plan B)
  generate-image "text" --theme minimal --out out.png
`);}
