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
 * Checks account dir first, then merges with global prompts.
 */
export function listTemplates(accountId?: string): string[] {
  const files = new Set<string>();

  // Add account-specific prompts
  if (accountId) {
    const accountDir = getAccountPromptsDir(accountId);
    if (fs.existsSync(accountDir)) {
      for (const f of fs.readdirSync(accountDir)) {
        if (f.endsWith(".md")) files.add(f);
      }
    }
  }

  // Add global prompts (overrides if same name — account takes precedence)
  if (fs.existsSync(GLOBAL_PROMPTS_DIR)) {
    for (const f of fs.readdirSync(GLOBAL_PROMPTS_DIR)) {
      if (f.endsWith(".md")) files.add(f);
    }
  }

  return Array.from(files).sort();
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
