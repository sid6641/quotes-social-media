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
import { runExport, printExportUsage } from "./export";
import { runAutopilotCmd, printAutopilotUsage } from "./autopilot";
import { runQuotes, printQuotesUsage } from "./quotes";
import { runAccount, printAccountUsage } from "./account";
import { listQuotes, listTemplates, listPrompts } from "./list";
import { createLogger } from "../lib/logger";
const log = createLogger("cli");

function printUsage(): void {
  console.log(`
📸 Quotes Social Media — CLI

Usage:
  npm run cli generate  [options]    Generate a batch of quote images
  npm run cli publish   [options]    Process the publish queue
  npm run cli export    [options]    Export a content calendar for manual posting
  npm run cli autopilot [options]    Run the full pipeline (generate → approve → export)
  npm run cli account   <command>    Manage accounts
  npm run cli quotes    <command>    Manage the quote pool
  npm run cli list      <resource>   List available resources
  npm run generate                   Shorthand: generate with defaults

Options (generate):
  --count <n>       Number of images to generate (default: 10)
  --template <name>  Prompt template to use (default: first in prompts/)
  --account <id>    Scope generation to an account (uses its themes + directory)
  --json             Output results as JSON (no fancy formatting)

Options (publish):
  --status           Show queue status (no publishing)
  --force            Queue all approved images, then publish due
  --dry-run          Show what would be published without doing it
  --account <id>     Scope publish to an account's queue

Options (export):
  --days <n>         Number of days to schedule (default: 7)
  --account <id>     Scope to a specific account
  --json             Output results as JSON (for piping)

Options (autopilot):
  --account <id>     Run for a specific account only
  --count <n>        Images per account (default: 10)
  --dry-run          Show what would happen without doing it
  --setup-cron       Install daily cron job at 08:00
  --remove-cron      Remove the cron job
  --cron-status      Check if cron is installed
  --json             JSON output (for piping)

Account commands:
  create <id>                   Create a new account
  create <id> --name "X" --theme motivation,life
  list                          List all accounts
  list --json                   JSON output for piping
  get <id>                      Show account details
  get <id> --json               JSON output
  update <id> --enabled false   Update account settings
  delete <id>                   Delete an account

  Note: use -- before flags with npm run, e.g.:
    npm run cli --silent account list -- --json | jq '.accounts[].id'

Quotes commands:
  list                          List all quotes in the pool
  list --json                   JSON output for piping
  list --status available       Filter by status
  list --theme motivation       Filter by theme
  add "text"                    Add a single quote to the pool
  add "text" --author X --theme motivation
  import --file path            Import quotes from a text file
  import --file path --theme motivation
  stats                         Show pool statistics
  expire                        Recycle expired cooldowns

  Note: use --silent to suppress npm headers when piping:
    npm run --silent cli quotes stats -- --json | jq '{available,cooldown}'

Resources (list):
  templates         List all template images
  prompts           List all prompt templates
  accounts          List all accounts
  hashtags          Info on managing hashtag sets

Examples:
  npm run cli generate
  npm run cli generate -- --count 5
  npm run cli generate -- --account dailygrind
  npm run cli publish -- --status
  npm run cli publish -- --account dailygrind
  npm run cli export                           Export 7-day content calendar
  npm run cli export -- --days 14              Export 14-day calendar
  npm run cli export -- --account deepthoughts Export for a specific account
  npm run cli autopilot                        Run full pipeline for all accounts
  npm run cli autopilot -- --account dailygrind  Single account
  npm run cli autopilot -- --dry-run           Preview without executing
  npm run cli autopilot -- --setup-cron        Install daily cron job (08:00)
  npm run cli autopilot -- --cron-status       Check if cron is installed
  npm run --silent cli account list -- --json | jq '.accounts[].id'
  npm run --silent cli quotes stats -- --json | jq '{available, cooldown}'
  npm run cli quotes add "Be yourself." --author Wilde --theme life
  npm run cli quotes import --file quotes/sample.txt --theme motivation
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
      } else if (arg === "--account" && i + 1 < args.length) {
        result.flags.account = args[i + 1];
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

  if (command === "export") {
    result.command = "export";
    let i = 1;
    while (i < args.length) {
      const arg = args[i];
      if (arg === "--days" && i + 1 < args.length) {
        result.flags.days = parseInt(args[i + 1], 10);
        i += 2;
      } else if (arg === "--account" && i + 1 < args.length) {
        result.flags.account = args[i + 1];
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

  if (command === "autopilot") {
    result.command = "autopilot";
    let i = 1;
    while (i < args.length) {
      const arg = args[i];
      if (arg === "--account" && i + 1 < args.length) {
        result.flags.account = args[i + 1];
        i += 2;
      } else if (arg === "--count" && i + 1 < args.length) {
        result.flags.count = parseInt(args[i + 1], 10);
        i += 2;
      } else if (arg === "--dry-run") {
        result.flags["dry-run"] = true;
        i += 1;
      } else if (arg === "--setup-cron") {
        result.flags["setup-cron"] = true;
        i += 1;
      } else if (arg === "--remove-cron") {
        result.flags["remove-cron"] = true;
        i += 1;
      } else if (arg === "--cron-status") {
        result.flags["cron-status"] = true;
        i += 1;
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
      } else if (arg === "--account" && i + 1 < args.length) {
        result.flags.account = args[i + 1];
        i += 2;
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

  if (command === "account") {
    result.command = "account";
    result.subcommand = args[1] || "list";
    let i = 2;
    while (i < args.length) {
      const arg = args[i];
      if (arg === "--name" && i + 1 < args.length) {
        result.flags.name = args[i + 1];
        i += 2;
      } else if (arg === "--theme" && i + 1 < args.length) {
        result.flags.theme = args[i + 1];
        i += 2;
      } else if (arg === "--description" && i + 1 < args.length) {
        result.flags.description = args[i + 1];
        i += 2;
      } else if (arg === "--enabled" && i + 1 < args.length) {
        result.flags.enabled = args[i + 1] === "true";
        i += 2;
      } else if (arg === "--cooldown" && i + 1 < args.length) {
        result.flags.cooldownDays = parseInt(args[i + 1], 10);
        i += 2;
      } else if (arg === "--json") {
        result.flags.json = true;
        i += 1;
      } else if (arg === "--help" || arg === "-h") {
        result.command = "help";
        i += 1;
      } else if (!arg.startsWith("--")) {
        result.flags.accountId = arg;
        i += 1;
      } else {
        i += 1;
      }
    }
    return result;
  }

  if (command === "quotes") {
    result.command = "quotes";
    result.subcommand = args[1] || "list";
    let i = 2;
    while (i < args.length) {
      const arg = args[i];
      if (arg === "--status" && i + 1 < args.length) {
        result.flags.status = args[i + 1];
        i += 2;
      } else if (arg === "--theme" && i + 1 < args.length) {
        result.flags.theme = args[i + 1];
        i += 2;
      } else if (arg === "--author" && i + 1 < args.length) {
        result.flags.author = args[i + 1];
        i += 2;
      } else if (arg === "--file" && i + 1 < args.length) {
        result.flags.file = args[i + 1];
        i += 2;
      } else if (arg === "--json") {
        result.flags.json = true;
        i += 1;
      } else if (arg === "--help" || arg === "-h") {
        result.command = "help";
        i += 1;
      } else if (!arg.startsWith("--")) {
        // positional text for "add"
        result.flags.text = arg;
        i += 1;
      } else {
        i += 1;
      }
    }
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
      const accountId =
        typeof flags.account === "string" ? flags.account : undefined;

      await runGenerate({ count, templateName, jsonOutput, accountId });
      return;
    }

    case "publish": {
      const status = flags.status === true;
      const force = flags.force === true;
      const dryRun = flags["dry-run"] === true;
      const accountId =
        typeof flags.account === "string" ? flags.account : undefined;

      await runPublish({ status, force, dryRun, accountId });
      return;
    }
    case "export": {
      const exportDays =
        typeof flags.days === "number" && flags.days > 0
          ? flags.days
          : 7;
      const jsonOutput = flags.json === true;
      const accountId =
        typeof flags.account === "string" ? flags.account : undefined;

      await runExport({ accountId, days: exportDays, jsonOutput });
      return;
    }
    case "autopilot": {
      const accountId =
        typeof flags.account === "string" ? flags.account : undefined;
      const count =
        typeof flags.count === "number" && flags.count > 0
          ? flags.count
          : undefined;
      const dryRun = flags["dry-run"] === true;
      const jsonOutput = flags.json === true;
      const setupCron = flags["setup-cron"] === true;
      const removeCron = flags["remove-cron"] === true;
      const cronStatus = flags["cron-status"] === true;

      await runAutopilotCmd({
        accountId,
        count,
        dryRun,
        jsonOutput,
        setupCron,
        removeCron,
        cronStatus,
      });
      return;
    }
    case "account": {
      await runAccount({
        subcommand: subcommand || "list",
        accountId: typeof flags.accountId === "string" ? flags.accountId : undefined,
        name: typeof flags.name === "string" ? flags.name : undefined,
        description: typeof flags.description === "string" ? flags.description : undefined,
        theme: typeof flags.theme === "string" ? flags.theme : undefined,
        enabled: typeof flags.enabled === "boolean" ? flags.enabled : undefined,
        cooldownDays: typeof flags.cooldownDays === "number" ? flags.cooldownDays : undefined,
        jsonOutput: flags.json === true,
      });
      return;
    }

    case "quotes": {
      await runQuotes({
        subcommand: subcommand || "list",
        status: typeof flags.status === "string" ? flags.status : undefined,
        theme: typeof flags.theme === "string" ? flags.theme : undefined,
        text: typeof flags.text === "string" ? flags.text : undefined,
        author: typeof flags.author === "string" ? flags.author : undefined,
        file: typeof flags.file === "string" ? flags.file : undefined,
        jsonOutput: flags.json === true,
      });
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
          return;        case "accounts":
          // Delegate to the account CLI
          const { runAccount } = await import("./account");
          await runAccount({ subcommand: "list" });
          return;
        case "hashtags":
          log.info("Use the Hashtag Bank tab in the web UI to manage hashtag sets.");
          log.info("API: GET /api/hashtags, POST /api/hashtags, DELETE /api/hashtags");
          return;        default:
          log.warn({ subcommand }, `Unknown resource: "${subcommand}"`);
          process.exit(1);
      }
    }

    default:
      printUsage();
      process.exit(1);
  }
}

main().catch((err) => {
  log.error({ err }, "CLI Error");
  process.exit(1);
});
