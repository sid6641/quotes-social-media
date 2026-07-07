import fs from "fs";
import path from "path";

const PROMPTS_DIR = path.resolve(process.cwd(), "prompts");

/**
 * Load a prompt template by filename from the prompts/ directory.
 */
export function loadTemplate(name: string): string {
  const filePath = path.resolve(PROMPTS_DIR, name);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Prompt template not found: ${name} (looked at ${filePath})`);
  }

  return fs.readFileSync(filePath, "utf-8");
}

/**
 * List all available prompt template files.
 */
export function listTemplates(): string[] {
  if (!fs.existsSync(PROMPTS_DIR)) {
    return [];
  }
  return fs
    .readdirSync(PROMPTS_DIR)
    .filter((f) => f.endsWith(".md"))
    .sort();
}

/**
 * Replace {{variable}} placeholders in the template with actual values.
 * Unknown variables are left as-is.
 */
export function applyTemplate(
  template: string,
  variables: Record<string, string>
): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g"), value);
  }
  return result;
}
