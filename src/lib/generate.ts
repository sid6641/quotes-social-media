/**
 * Quote image generation pipeline — the single deep module for generating
 * quote images, captions, and manifest entries.
 *
 * Called by:
 *   - CLI (src/cli/generate.ts) — thin argument-parsing wrapper
 *   - API (src/app/api/generate/route.ts) — thin HTTP adapter
 *   - Scheduler (src/lib/scheduler.ts) — autopilot cron runner
 */

import path from "path";
import fs from "fs";
import { loadTemplate, applyTemplate, listTemplates } from "./prompts";
import { pickCombinations } from "./mixer";
import { generateQuoteImage } from "./gemini";
import { generateCaptionOptions } from "./caption";
import { createBatch, generateBatchId } from "./manifest";
import {
  getAccount,
  getAccountDir,
  getAccountImagesDir,
  getAccountTemplatesDir,
} from "./account";
import { markQuoteUsed } from "./quote-pool";
import { createLogger } from "./logger";

const log = createLogger("generate");

const GLOBAL_OUTPUT = path.resolve(process.cwd(), "output");
const GLOBAL_TEMPLATES_DIR = path.resolve(process.cwd(), "templates");

export interface GenerateOptions {
  /** Number of images to generate (default: 10). Ignored when generateAll is true. */
  count?: number;
  /** Prompt template name to use (default: first available). */
  templateName?: string;
  /** Account ID for scoped generation. */
  accountId?: string;
  /** Generate all quote × template combinations (overrides count). */
  generateAll?: boolean;
  /** Trigger source for manifest metadata (default: "cli"). */
  trigger?: "cli" | "web";
  /** Progress callback — called after each image and each caption. */
  onProgress?: (event: ProgressEvent) => void;
}

export interface ProgressEvent {
  phase: "image" | "caption" | "complete";
  completed: number;
  total: number;
  current?: string;
  batchId?: string;
  successCount?: number;
  failCount?: number;
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
 * Run a generation batch.
 *
 * Pipeline: load template → pick combos → generate images → generate captions → save manifest.
 * This is the single implementation — CLI, API, and scheduler all call this.
 */
export async function runGenerate(
  options: GenerateOptions = {}
): Promise<GenerateResult> {
  const { templateName, accountId } = options;
  const generateAll = options.generateAll === true;
  const targetCount = generateAll ? 0 : (options.count ?? 10);

  // ── Resolve account ──────────────────────────────────────────────
  const account = accountId ? getAccount(accountId) : undefined;
  const outputDir = account ? getAccountDir(accountId) : GLOBAL_OUTPUT;
  const imagesDir = account ? getAccountImagesDir(accountId) : GLOBAL_OUTPUT;
  const cooldownDays = account?.cooldownDays ?? 30;

  // ── 1. Load prompt template ─────────────────────────────────────
  const availableTemplates = listTemplates(accountId);
  if (availableTemplates.length === 0) {
    throw new Error(
      "No prompt templates found in prompts/. Create a default.md file."
    );
  }

  const promptName =
    templateName && availableTemplates.includes(templateName)
      ? templateName
      : availableTemplates[0];
  const rawTemplate = loadTemplate(promptName, accountId);

  // ── 2. Pick combinations ────────────────────────────────────────
  const combos = pickCombinations(targetCount, accountId, generateAll);

  // ── 3. Ensure output directories ────────────────────────────────
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
  }

  // ── Resolve template base directory ─────────────────────────────
  const templateDir = (() => {
    if (accountId) {
      const accountDir = getAccountTemplatesDir(accountId);
      if (fs.existsSync(accountDir)) {
        const files = fs.readdirSync(accountDir);
        const hasImages = files.some((f) =>
          [".jpg", ".jpeg", ".png", ".webp"].includes(
            path.extname(f).toLowerCase()
          )
        );
        if (hasImages) return accountDir;
      }
    }
    return GLOBAL_TEMPLATES_DIR;
  })();

  // ── 4. Generate images ──────────────────────────────────────────
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
    const templatePath = path.join(templateDir, template);

    const backgroundDescription =
      `A background image named "${template}"` +
      ` (style: Instagram quote template).`;

    const prompt = applyTemplate(rawTemplate, {
      quote_text: quote,
      background_description: backgroundDescription,
    });

    options.onProgress?.({
      phase: "image",
      completed: i,
      total: combos.length,
      current: quote,
    });

    try {
      const imageBuffer = await generateQuoteImage(templatePath, quote, prompt);
      fs.writeFileSync(path.join(imagesDir, filename), imageBuffer);
      results.push({ quote, template, filename, success: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error({ err: msg }, "Image generation failed");
      results.push({ quote, template, filename, success: false, error: msg });
    }
  }

  options.onProgress?.({
    phase: "image",
    completed: combos.length,
    total: combos.length,
    current: "Done generating images",
  });

  // ── 5. Generate captions ────────────────────────────────────────
  const successfulImages = results.filter((r) => r.success);
  const captionOptionsList: Awaited<
    ReturnType<typeof generateCaptionOptions>
  >[] = [];

  if (successfulImages.length > 0) {
    for (let i = 0; i < successfulImages.length; i++) {
      const image = successfulImages[i];
      const imagePath = path.join(imagesDir, image.filename);

      options.onProgress?.({
        phase: "caption",
        completed: i,
        total: successfulImages.length,
        current: image.quote,
      });

      try {
        const opts = await generateCaptionOptions(image.quote, imagePath);
        captionOptionsList.push(opts);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.error({ err: msg }, "Caption generation failed");
        captionOptionsList.push([]);
      }
    }
  }

  options.onProgress?.({
    phase: "caption",
    completed: successfulImages.length,
    total: successfulImages.length,
    current: "Done generating captions",
  });

  // ── 6. Save manifest ────────────────────────────────────────────
  if (successfulImages.length > 0) {
    createBatch(
      successfulImages.map((r) => ({
        quote: r.quote,
        template: r.template,
        filename: r.filename,
      })),
      options.trigger || "cli",
      promptName,
      captionOptionsList.length > 0 ? captionOptionsList : undefined,
      outputDir
    );
  }

  // ── 7. Mark quotes used ─────────────────────────────────────────
  for (const r of successfulImages) {
    if (r.quoteId) {
      markQuoteUsed(r.quoteId, accountId || "default", cooldownDays);
    }
  }

  // ── 8. Build result ─────────────────────────────────────────────
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

  options.onProgress?.({
    phase: "complete",
    completed: result.successCount,
    total: result.successCount + result.failCount,
    batchId: result.batchId,
    successCount: result.successCount,
    failCount: result.failCount,
  });

  log.info(
    {
      batchId: result.batchId,
      successCount: result.successCount,
      failCount: result.failCount,
      account: accountId,
    },
    "Batch complete"
  );

  return result;
}
