/**
 * CLI entry point for quote image generation.
 *
 * Usage: npm run generate
 *
 * Picks 10 quote + template combinations, sends to Gemini,
 * saves the resulting images to output/, and prints a summary.
 */
import path from "path";
import fs from "fs";
import { loadTemplate, applyTemplate, listTemplates } from "../lib/prompts";
import { pickCombinations } from "../lib/mixer";
import { generateQuoteImage } from "../lib/gemini";
import { createBatch } from "../lib/manifest";

const OUTPUT_DIR = path.resolve(process.cwd(), "output");
const TEMPLATES_DIR = path.resolve(process.cwd(), "templates");

async function main() {
  console.log("📸 Quotes Social Media — Batch Generator\n");

  // 1. Load prompt template
  const templates = listTemplates();
  if (templates.length === 0) {
    throw new Error(
      "No prompt templates found in prompts/. Create a default.md file."
    );
  }

  const promptName = templates[0]; // Use the first available template
  const rawTemplate = loadTemplate(promptName);
  console.log(`📝 Using prompt template: ${promptName}`);

  // 2. Pick quote + template combinations
  const combos = pickCombinations();
  console.log(`📋 Picked ${combos.length} quote + template combinations\n`);

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

    // Build background description for the prompt
    const backgroundDescription = `A background image named "${template}"` + 
      ` (style: Instagram quote template).`;

    // Apply template variables
    const prompt = applyTemplate(rawTemplate, {
      quote_text: quote,
      background_description: backgroundDescription,
    });

    process.stdout.write(
      `  ⏳ [${i + 1}/${combos.length}] Generating "${quote.substring(0, 40)}..." `
    );

    try {
      const imageBuffer = await generateQuoteImage(templatePath, quote, prompt);
      const outputPath = path.join(OUTPUT_DIR, filename);
      fs.writeFileSync(outputPath, imageBuffer);
      console.log("✅");
      results.push({ quote, template, filename, success: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log("❌");
      console.log(`      Error: ${msg}`);
      results.push({ quote, template, filename, success: false, error: msg });
    }
  }

  // 5. Save manifest
  const successfulImages = results.filter((r) => r.success);
  if (successfulImages.length > 0) {
    createBatch(
      successfulImages.map((r) => ({
        quote: r.quote,
        template: r.template,
        filename: r.filename,
      })),
      "cli",
      promptName
    );
  }

  // 6. Summary
  const successCount = successfulImages.length;
  const failCount = results.length - successCount;
  console.log(`\n📊 Summary:`);
  console.log(`   ✅ ${successCount} images generated successfully`);
  if (failCount > 0) {
    console.log(`   ❌ ${failCount} images failed`);
  }
  console.log(`   📁 Output directory: ${OUTPUT_DIR}`);
  console.log(
    `\n👉 Review at http://localhost:3000 (run: npm run dev)`
  );
}

function generateBatchId(): string {
  const now = new Date();
  return now.toISOString().slice(0, 10); // YYYY-MM-DD
}

main().catch((err) => {
  console.error("\n❌ Generation failed:");
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
