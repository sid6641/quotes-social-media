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
import { generateCaptions } from "../lib/caption";
import { createBatch, generateBatchId } from "../lib/manifest";

const OUTPUT_DIR = path.resolve(process.cwd(), "output");
const TEMPLATES_DIR = path.resolve(process.cwd(), "templates");

export interface GenerateOptions {
  /** Number of images to generate (default: 10) */
  count?: number;
  /** Prompt template name to use (default: first available) */
  templateName?: string;
  /** If true, print JSON result instead of formatted output */
  jsonOutput?: boolean;
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
  const { templateName, jsonOutput } = options;
  const targetCount = options.count ?? 10;

  const log = jsonOutput
    ? { info: () => {}, step: () => {}, successMsg: () => {}, errorMsg: () => {} }
    : {
        info: (msg: string) => console.log(msg),
        step: (msg: string) => process.stdout.write(msg),
        successMsg: () => console.log("✅"),
        errorMsg: () => console.log("❌"),
      };

  if (!jsonOutput) {
    log.info("📸 Quotes Social Media — Batch Generator\n");
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
  log.info(`📝 Using prompt template: ${promptName}`);

  // 2. Pick quote + template combinations
  const combos = pickCombinations(targetCount);
  log.info(`📋 Picked ${combos.length} quote + template combinations\n`);

  // 3. Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // 4. Generate each image
  const batchId = generateBatchId();
  const results: Array<{
    quote: string;
    template: string;
    filename: string;
    success: boolean;
    error?: string;
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
      log.step(
        `  ⏳ [${i + 1}/${combos.length}] Generating "${quote.substring(0, 40)}..." `
      );
    }

    try {
      const imageBuffer = await generateQuoteImage(templatePath, quote, prompt);
      fs.writeFileSync(path.join(OUTPUT_DIR, filename), imageBuffer);
      if (!jsonOutput) log.successMsg();
      results.push({ quote, template, filename, success: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!jsonOutput) {
        log.errorMsg();
        console.log(`      Error: ${msg}`);
      }
      results.push({ quote, template, filename, success: false, error: msg });
    }
  }

  // 5. Generate captions for successful images
  const successfulImages = results.filter((r) => r.success);
  let captions: Awaited<ReturnType<typeof generateCaptions>> = [];

  if (successfulImages.length > 0) {
    if (!jsonOutput) {
      log.step(`\n  💬 Generating captions... `);
    }
    try {
      captions = await generateCaptions(successfulImages.map((r) => r.quote));
      if (!jsonOutput) {
        console.log(`✅ (${captions.length} captions)`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!jsonOutput) {
        console.log(`❌`);
        console.log(`      Caption generation failed: ${msg}`);
        console.log(`      Continuing without captions.`);
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
      captions.length > 0 ? captions : undefined
    );
  }

  // 7. Build result
  const result: GenerateResult = {
    batchId,
    successCount: successfulImages.length,
    failCount: results.length - successfulImages.length,
    images: results.map((r, i) => ({
      ...r,
      caption:
        r.success && captions[i] ? captions[i] : undefined,
    })),
  };

  // 8. Output
  if (jsonOutput) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    const { successCount, failCount } = result;
    console.log(`\n📊 Summary:`);
    console.log(`   ✅ ${successCount} images generated successfully`);
    if (failCount > 0) {
      console.log(`   ❌ ${failCount} images failed`);
    }
    console.log(`   📁 Output directory: ${OUTPUT_DIR}`);

    if (captions.length > 0) {
      console.log(`\n📝 Generated Captions:`);
      for (let i = 0; i < captions.length; i++) {
        const image = successfulImages[i];
        const cap = captions[i];
        console.log(`\n   ${i + 1}. "${image.quote.substring(0, 50)}..."`);
        console.log(`      ${cap.commentary}`);
        console.log(`      ${cap.hashtags.join(" ")}`);
      }
    }

    console.log(`\n👉 Review at http://localhost:3000 (run: npm run dev)`);
  }

  return result;
}

// Backward-compatible direct execution: `npm run generate`
const isDirectRun =
  process.argv[1]?.endsWith("generate.ts") ||
  process.argv[1]?.endsWith("generate.js");

if (isDirectRun) {
  runGenerate().catch((err) => {
    console.error("\n❌ Generation failed:");
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
