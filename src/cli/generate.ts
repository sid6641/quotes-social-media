/**
 * Quote image generation logic.
 *
 * Exports `runGenerate()` for the CLI entry point.
 * Can also be run directly: `npm run generate` (backward compat).
 */
import "dotenv/config";
import path from "path";
import fs from "fs";
import { loadTemplate, applyTemplate, listTemplates } from "../lib/prompts";
import { pickCombinations } from "../lib/mixer";
import { generateQuoteImage } from "../lib/gemini";
import { generateCaptionOptions } from "../lib/caption";
import { createBatch, generateBatchId } from "../lib/manifest";
import { getAccount, getAccountDir, getAccountImagesDir } from "../lib/account";
import { markQuoteUsed } from "../lib/quote-pool";
import { createLogger as createAppLogger } from "../lib/logger";

const GLOBAL_OUTPUT = path.resolve(process.cwd(), "output");
const logger = createAppLogger("generate");
const TEMPLATES_DIR = path.resolve(process.cwd(), "templates");

export interface GenerateOptions {
  /** Number of images to generate (default: 10) */
  count?: number;
  /** Prompt template name to use (default: first available) */
  templateName?: string;
  /** If true, print JSON result instead of formatted output */
  jsonOutput?: boolean;
  /** Account ID for scoped generation (uses account's theme, dir, cooldown) */
  accountId?: string;
}

export interface GenerateResult {
  batchId: string;
  successCount: number;
  failCount: number;
  images: Array<{
    quote: string;
    template: string;
    filename: string;
    success: boolean;
    error?: string;
    caption?: { commentary: string; hashtags: string[] };
  }>;
}

/**
 * Run a generation batch with the given options.
 * Returns a structured result for programmatic use.
 */
export async function runGenerate(
  options: GenerateOptions = {}
): Promise<GenerateResult> {
  const { templateName, jsonOutput, accountId } = options;
  const targetCount = options.count ?? 10;

  // Resolve account-specific paths
  const account = accountId ? getAccount(accountId) : undefined;
  const outputDir = account ? getAccountDir(accountId) : GLOBAL_OUTPUT;
  const imagesDir = account ? getAccountImagesDir(accountId) : GLOBAL_OUTPUT;
  const cooldownDays = account?.cooldownDays ?? 30;

  const print = jsonOutput
    ? { info: () => {}, step: () => {}, successMsg: () => {}, errorMsg: () => {} }
    : {
        info: (msg: string) => { logger.info(msg); },
        step: (msg: string) => process.stdout.write(msg),
        successMsg: () => { logger.info("✅ Done"); },
        errorMsg: () => { logger.error("❌ Failed"); },
      };

  if (!jsonOutput) {
    const scope = account ? ` for account "${accountId}"` : "";
    print.info(`📸 Quotes Social Media — Batch Generator${scope}`);
  }

  // 1. Load prompt template
  const availableTemplates = listTemplates();
  if (availableTemplates.length === 0) {
    throw new Error(
      "No prompt templates found in prompts/. Create a default.md file."
    );
  }

  const promptName =
    templateName && availableTemplates.includes(templateName)
      ? templateName
      : availableTemplates[0];
  const rawTemplate = loadTemplate(promptName);
  print.info(`📝 Using prompt template: ${promptName}`);

  // 2. Pick quote + template combinations
  // If account has themes, filter quotes by those themes
  const combos = pickCombinations(targetCount, account?.theme);
  print.info(`📋 Picked ${combos.length} quote + template combinations`);

  // 3. Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
  }

  // 4. Generate each image
  const batchId = generateBatchId();
  const results: Array<{
    quote: string;
    template: string;
    filename: string;
    success: boolean;
    error?: string;
    quoteId?: string;
  }> = [];

  for (let i = 0; i < combos.length; i++) {
    const { quote, template } = combos[i];
    const filename = `${batchId}-${String(i + 1).padStart(2, "0")}.png`;
    const templatePath = path.join(TEMPLATES_DIR, template);

    const backgroundDescription =
      `A background image named "${template}"` +
      ` (style: Instagram quote template).`;

    const prompt = applyTemplate(rawTemplate, {
      quote_text: quote,
      background_description: backgroundDescription,
    });

    if (!jsonOutput) {
      print.step(
        `  ⏳ [${i + 1}/${combos.length}] Generating "${quote.substring(0, 40)}..." `
      );
    }

    try {
      const imageBuffer = await generateQuoteImage(templatePath, quote, prompt);
      fs.writeFileSync(path.join(imagesDir, filename), imageBuffer);
      if (!jsonOutput) print.successMsg();
      results.push({ quote, template, filename, success: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!jsonOutput) {
        print.errorMsg();
        logger.error({ err: msg }, "Image generation failed");
      }
      results.push({ quote, template, filename, success: false, error: msg });
    }
  }

  // 5. Generate captions for successful images
  const successfulImages = results.filter((r) => r.success);
  // Each element is an array of 5 options for that image
  const captionOptionsList: Awaited<ReturnType<typeof generateCaptionOptions>>[] = [];

  if (successfulImages.length > 0) {
    if (!jsonOutput) {
      print.step(`\n  💬 Generating captions (${successfulImages.length} images, 5 options each)...\n`);
    }
    for (let i = 0; i < successfulImages.length; i++) {
      const image = successfulImages[i];
      const imagePath = path.join(imagesDir, image.filename);
      if (!jsonOutput) {
        print.step(`     [${i + 1}/${successfulImages.length}] "${image.quote.substring(0, 35)}..." `);
      }
      try {
        const options = await generateCaptionOptions(image.quote, imagePath);
        captionOptionsList.push(options);
        if (!jsonOutput) logger.info(`✅ (${options.length} options)`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!jsonOutput) {
          logger.error("❌");
          logger.error({ err: msg }, "Caption generation failed");
        }
        captionOptionsList.push([]);
      }
    }
  }

  // 6. Save manifest
  if (successfulImages.length > 0) {
    createBatch(
      successfulImages.map((r) => ({
        quote: r.quote,
        template: r.template,
        filename: r.filename,
      })),
      "cli",
      promptName,
      captionOptionsList.length > 0 ? captionOptionsList : undefined,
      outputDir
    );
  }

  // 7. Mark quotes as used in the pool (track per-account usage)
  for (const r of successfulImages) {
    if (r.quoteId) {
      markQuoteUsed(r.quoteId, accountId || "default", cooldownDays);
    }
  }

  // 8. Build result
  const defaultCaptions = captionOptionsList.map((opts) =>
    opts.length > 0 ? opts[0] : undefined
  );

  const result: GenerateResult = {
    batchId,
    successCount: successfulImages.length,
    failCount: results.length - successfulImages.length,
    images: results.map((r, i) => ({
      ...r,
      caption:
        r.success && defaultCaptions[i] ? defaultCaptions[i] : undefined,
    })),
  };

  // 8. Output
  if (jsonOutput) {
    console.log(JSON.stringify(result, null, 2));
    logger.info({ batchId: result.batchId, successCount: result.successCount }, "Batch complete");
  } else {
    const { successCount, failCount } = result;
    logger.info({ successCount, failCount, batchId: result.batchId, outputDir, account: accountId }, "Generation summary");
    logger.info({ successCount, failCount, outputDir }, `📊 Summary: ${successCount} generated, ${failCount} failed`);

    if (captionOptionsList.length > 0) {
      logger.info({ captionCount: captionOptionsList.length }, `📝 ${captionOptionsList.length} images have 5 caption options each`);
      logger.info("✏️  Review at http://localhost:3000");
    }
  }

  return result;
}

// Backward-compatible direct execution: `npm run generate`
const isDirectRun =
  process.argv[1]?.endsWith("generate.ts") ||
  process.argv[1]?.endsWith("generate.js");

if (isDirectRun) {
  runGenerate().catch((err) => {
    logger.error({ err }, "Generation failed");
    process.exit(1);
  });
}
