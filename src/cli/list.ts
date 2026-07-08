/**
 * List subcommand — display available resources (quotes, templates, prompts).
 */
import path from "path";
import fs from "fs";
import { listTemplates as listPromptTemplates } from "../lib/prompts";

const QUOTES_DIR = path.resolve(process.cwd(), "quotes");
const TEMPLATES_DIR = path.resolve(process.cwd(), "templates");
const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

/**
 * Print all available quotes to stdout.
 */
export function listQuotes(): void {
  if (!fs.existsSync(QUOTES_DIR)) {
    console.log("No quotes/ directory found.");
    return;
  }

  const files = fs
    .readdirSync(QUOTES_DIR)
    .filter((f) => f.endsWith(".txt"))
    .sort();

  if (files.length === 0) {
    console.log("No quote files found in quotes/.");
    return;
  }

  let totalQuotes = 0;
  for (const file of files) {
    const content = fs.readFileSync(path.join(QUOTES_DIR, file), "utf-8");
    const lines = content
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("#") && !l.startsWith("//"));
    totalQuotes += lines.length;

    console.log(`\n📄 ${file} (${lines.length} quotes):`);
    for (const line of lines) {
      console.log(`   • "${line}"`);
    }
  }

  console.log(`\n📊 Total: ${totalQuotes} quotes across ${files.length} file(s)`);
}

/**
 * Print all available template images to stdout.
 */
export function listTemplates(): void {
  if (!fs.existsSync(TEMPLATES_DIR)) {
    console.log("No templates/ directory found.");
    return;
  }

  const files = fs.readdirSync(TEMPLATES_DIR).sort();
  const images = files.filter((f) => IMAGE_EXTS.has(path.extname(f).toLowerCase()));

  if (images.length === 0) {
    console.log("No template images found in templates/.");
    console.log("Add .jpg, .png, or .webp files to get started.");
    return;
  }

  console.log(`🖼️  Template Images (${images.length}):`);
  for (const img of images) {
    const stats = fs.statSync(path.join(TEMPLATES_DIR, img));
    const sizeKB = (stats.size / 1024).toFixed(1);
    console.log(`   • ${img} (${sizeKB} KB)`);
  }
}

/**
 * Print all available prompt templates to stdout.
 */
export function listPrompts(): void {
  const prompts = listPromptTemplates();

  if (prompts.length === 0) {
    console.log("No prompt templates found in prompts/.");
    console.log("Create a .md file in the prompts/ directory.");
    return;
  }

  console.log(`📝 Prompt Templates (${prompts.length}):`);
  for (const p of prompts) {
    const content = fs.readFileSync(
      path.resolve(process.cwd(), "prompts", p),
      "utf-8"
    );
    const firstLine = content.split("\n")[0]?.replace(/^#\s*/, "").trim() || "";
    console.log(`   • ${p}${firstLine ? ` — ${firstLine}` : ""}`);
  }
}
