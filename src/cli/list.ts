/**
 * List subcommand — display available resources (quotes, templates, prompts).
 */
import path from "path";
import fs from "fs";
import { listTemplates as listPromptTemplates } from "../lib/prompts";
import { createLogger } from "../lib/logger";
const log = createLogger("list");

const QUOTES_DIR = path.resolve(process.cwd(), "quotes");
const TEMPLATES_DIR = path.resolve(process.cwd(), "templates");
const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

/**
 * Print all available quotes to stdout.
 */
export function listQuotes(): void {
  if (!fs.existsSync(QUOTES_DIR)) {
    log.warn("No quotes/ directory found.");
    return;
  }

  const files = fs
    .readdirSync(QUOTES_DIR)
    .filter((f) => f.endsWith(".txt"))
    .sort();

  if (files.length === 0) {
    log.warn("No quote files found in quotes/.");
    return;
  }

  let totalQuotes = 0;
  const quoteList: Array<{ file: string; quotes: string[] }> = [];
  for (const file of files) {
    const content = fs.readFileSync(path.join(QUOTES_DIR, file), "utf-8");
    const lines = content
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("#") && !l.startsWith("//"));
    totalQuotes += lines.length;
    quoteList.push({ file, quotes: lines });
  }

  log.info({ files: quoteList.map(f => ({ name: f.file, count: f.quotes.length })), totalQuotes },
    `📊 ${totalQuotes} quotes across ${files.length} file(s)`);
}

/**
 * Print all available template images to stdout.
 */
export function listTemplates(): void {
  if (!fs.existsSync(TEMPLATES_DIR)) {
    log.warn("No templates/ directory found.");
    return;
  }

  const files = fs.readdirSync(TEMPLATES_DIR).sort();
  const images = files.filter((f) => IMAGE_EXTS.has(path.extname(f).toLowerCase()));

  if (images.length === 0) {
    log.warn("No template images found in templates/.");
    return;
  }

  log.info({ imageCount: images.length }, `🖼️  ${images.length} template images`);
}

/**
 * Print all available prompt templates to stdout.
 */
export function listPrompts(): void {
  const prompts = listPromptTemplates();

  if (prompts.length === 0) {
    log.warn("No prompt templates found in prompts/.");
    return;
  }

  log.info({ promptCount: prompts.length }, `📝 ${prompts.length} prompt templates`);
}
