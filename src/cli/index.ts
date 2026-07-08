/**
 * CLI entry point for quotes-social-media.
 *
 * Usage:
 *   npm run cli generate                  # default: 10 images, first prompt template
 *   npm run cli generate -- --count 5     # override batch size
 *   npm run cli generate -- --template modern --count 3
 *   npm run cli generate -- --json        # JSON output (no fancy printing)
 *   npm run cli list quotes               # list available quote texts
 *   npm run cli list templates            # list available template images
 *   npm run cli list prompts              # list available prompt templates
 *
 * Note: `npm run generate` still works as before (no flags, default behavior).
 */

import "dotenv/config";
import { runGenerate } from "./generate";
import { runPublish } from "./publish";
import { listQuotes, listTemplates, listPrompts } from "./list";

function printUsage(): void {
  console.log(`
📸 Quotes Social Media — CLI

Usage:
  npm run cli generate [options]    Generate a batch of quote images
  npm run cli publish  [options]    Process the publish queue
  npm run cli list <resource>       List available resources
  npm run generate                  Shorthand: generate with defaults

Options (generate):
  --count <n>       Number of images to generate (default: 10)
  --template <name>  Prompt template to use (default: first in prompts/)
  --json             Output results as JSON (no fancy formatting)

Options (publish):
  --status           Show queue status (no publishing)
  --force            Queue all approved images, then publish due
  --dry-run          Show what would be published without doing it

Resources (list):
  quotes            List all available quotes
  templates         List all template images
  prompts           List all prompt templates

Examples:
  npm run cli generate
  npm run cli generate -- --count 5
  npm run cli generate -- --template modern --json
  npm run cli publish
  npm run cli publish -- --status
  npm run cli publish -- --dry-run
  npm run cli list quotes
  npm run cli list templates
`);
}

function parseArgs(): {
  command: string;
  subcommand?: string;
  flags: Record<string, string | boolean | number>;
} {
  // Skip first two args (node binary + script path)
  const args = process.argv.slice(2);
  const result: ReturnType<typeof parseArgs> = {
    command: "generate",
    subcommand: undefined,
    flags: {},
  };

  if (args.length === 0) {
    return result; // default: generate
  }

  const command = args[0];

  if (command === "generate") {
    result.command = "generate";
    let i = 1;
    while (i < args.length) {
      const arg = args[i];
      if (arg === "--count" && i + 1 < args.length) {
        result.flags.count = parseInt(args[i + 1], 10);
        i += 2;
      } else if (arg === "--template" && i + 1 < args.length) {
        result.flags.template = args[i + 1];
        i += 2;
      } else if (arg === "--json") {
        result.flags.json = true;
        i += 1;
      } else if (arg === "--help" || arg === "-h") {
        result.command = "help";
        i += 1;
      } else {
        i += 1;
      }
    }
    return result;
  }

  if (command === "publish") {
    result.command = "publish";
    let i = 1;
    while (i < args.length) {
      const arg = args[i];
      if (arg === "--status") {
        result.flags.status = true;
        i += 1;
      } else if (arg === "--force") {
        result.flags.force = true;
        i += 1;
      } else if (arg === "--dry-run") {
        result.flags["dry-run"] = true;
        i += 1;
      } else if (arg === "--help" || arg === "-h") {
        result.command = "help";
        i += 1;
      } else {
        i += 1;
      }
    }
    return result;
  }

  if (command === "list") {
    result.command = "list";
    result.subcommand = args[1];
    return result;
  }

  if (command === "--help" || command === "-h" || command === "help") {
    result.command = "help";
    return result;
  }

  // Unknown command — treat as generate with leftover args
  result.command = "generate";
  return result;
}

async function main(): Promise<void> {
  const { command, subcommand, flags } = parseArgs();

  switch (command) {
    case "help":
      printUsage();
      return;

    case "generate": {
      const count =
        typeof flags.count === "number" && flags.count > 0
          ? flags.count
          : undefined;
      const templateName =
        typeof flags.template === "string" ? flags.template : undefined;
      const jsonOutput = flags.json === true;

      await runGenerate({ count, templateName, jsonOutput });
      return;
    }

    case "publish": {
      const status = flags.status === true;
      const force = flags.force === true;
      const dryRun = flags["dry-run"] === true;

      await runPublish({ status, force, dryRun });
      return;
    }

    case "list": {
      switch (subcommand) {
        case "quotes":
          listQuotes();
          return;
        case "templates":
          listTemplates();
          return;
        case "prompts":
          listPrompts();
          return;
        default:
          console.log(
            `Unknown resource: "${subcommand}". Available: quotes, templates, prompts`
          );
          process.exit(1);
      }
    }

    default:
      printUsage();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error("\n❌ CLI Error:");
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
