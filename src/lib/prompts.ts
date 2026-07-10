import fs from "fs";
import path from "path";
import { getAccountPromptsDir } from "./account";

const GLOBAL_PROMPTS_DIR = path.resolve(process.cwd(), "prompts");

/**
 * Load a prompt template by filename, checking account dir first then global.
 */
export function loadTemplate(name: string, accountId?: string): string {
  // Try account-specific prompts dir first
  if (accountId) {
    const accountPath = path.resolve(getAccountPromptsDir(accountId), name);
    if (fs.existsSync(accountPath)) {
      return fs.readFileSync(accountPath, "utf-8");
    }
  }

  // Fall back to global prompts/
  const globalPath = path.resolve(GLOBAL_PROMPTS_DIR, name);
  if (!fs.existsSync(globalPath)) {
    throw new Error(`Prompt template not found: ${name} (checked account and global)`);
  }

  return fs.readFileSync(globalPath, "utf-8");
}

/**
 * List all available prompt template files, optionally scoped to an account.
 * If the account has any prompts, only those are returned (no global merge).
 * If the account has none, global prompts are used as fallback.
 */
export function listTemplates(accountId?: string): string[] {
  // If account has prompts, use ONLY those
  if (accountId) {
    const accountDir = getAccountPromptsDir(accountId);
    if (fs.existsSync(accountDir)) {
      const files = fs.readdirSync(accountDir)
        .filter((f) => f.endsWith(".md"))
        .sort();
      if (files.length > 0) return files;
    }
  }

  // Fall back to global prompts
  if (!fs.existsSync(GLOBAL_PROMPTS_DIR)) return [];
  return fs.readdirSync(GLOBAL_PROMPTS_DIR)
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
