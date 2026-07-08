/**
 * CLI commands for quote pool management.
 *
 * Usage:
 *   npm run cli quotes list
 *   npm run cli quotes list --status available --theme motivation
 *   npm run cli quotes add "The unexamined life is not worth living." --author Socrates --theme philosophy
 *   npm run cli quotes import --file quotes/sample.txt --theme motivation
 *   npm run cli quotes stats
 *   npm run cli quotes expire
 */
import {
  getQuotes,
  addQuote,
  importQuotesFromFile,
  getPoolStats,
  expireCooldowns,
} from "../lib/quote-pool";
import { createLogger } from "../lib/logger";

const log = createLogger("quotes");

export interface QuotesOptions {
  subcommand: string;
  status?: string;
  theme?: string;
  text?: string;
  author?: string;
  file?: string;
  jsonOutput?: boolean;
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
    default:
      log.warn({ subcommand }, `Unknown quotes subcommand: "${subcommand}"`);
      log.info("Available: list, add, import, stats, expire");
  }
}

async function listQuotes(options: QuotesOptions): Promise<void> {
  const quotes = getQuotes({
    status: options.status as any,
    theme: options.theme,
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
    { count: quotes.length, status: options.status || "all", theme: options.theme || "all" },
    `📋 ${quotes.length} quote(s)`
  );

  if (quotes.length <= 50) {
    for (const q of quotes) {
      const tags = [q.status, q.theme, `used ${q.usageCount}x`]
        .filter(Boolean)
        .join(" · ");
      log.info({ id: q.id, status: q.status, theme: q.theme, usageCount: q.usageCount },
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
    theme: options.theme,
    source: "manual",
  });

  if (options.jsonOutput) {
    console.log(JSON.stringify({ success: true, quote: entry }));
  } else {
    log.info({ id: entry.id, theme: entry.theme }, `✅ Quote added: "${entry.text.substring(0, 60)}..."`);
  }
}

async function importCmd(options: QuotesOptions): Promise<void> {
  if (!options.file) {
    log.warn("Missing --file path.");
    return;
  }

  const result = importQuotesFromFile(options.file, {
    author: options.author,
    theme: options.theme,
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
  list --theme motivation  Filter by theme
  add "text"               Add a single quote
  add "text" --author X --theme motivation
  import --file path       Import from text file (one quote per line)
  import --file path --theme motivation
  stats                    Show pool statistics
  expire                   Recycle expired cooldowns
`);
}
