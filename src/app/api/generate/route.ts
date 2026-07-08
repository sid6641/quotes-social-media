import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { loadTemplate, applyTemplate, listTemplates } from "@/lib/prompts";
import { pickCombinations } from "@/lib/mixer";
import { generateQuoteImage } from "@/lib/gemini";
import { generateCaptionOptions } from "@/lib/caption";
import { createBatch, generateBatchId, invalidateCache } from "@/lib/manifest";

const OUTPUT_DIR = path.resolve(process.cwd(), "output");
const TEMPLATES_DIR = path.resolve(process.cwd(), "templates");

export async function POST(_request: NextRequest) {
  try {
    // 1. Load prompt template
    const templates = listTemplates();
    if (templates.length === 0) {
      return NextResponse.json(
        { success: false, error: "No prompt templates found in prompts/." },
        { status: 400 }
      );
    }

    const promptName = templates[0];
    const rawTemplate = loadTemplate(promptName);

    // 2. Pick combinations
    const combos = pickCombinations();

    // 3. Ensure output directory
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    // 4. Generate images
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

      try {
        const imageBuffer = await generateQuoteImage(
          templatePath,
          quote,
          prompt
        );
        fs.writeFileSync(path.join(OUTPUT_DIR, filename), imageBuffer);
        results.push({ quote, template, filename, success: true });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({ quote, template, filename, success: false, error: msg });
      }
    }

    // 5. Generate captions for successful images
    const successfulImages = results.filter((r) => r.success);
    const captionOptionsList: Awaited<ReturnType<typeof generateCaptionOptions>>[] = [];

    if (successfulImages.length > 0) {
      for (const image of successfulImages) {
        try {
          const imagePath = path.join(OUTPUT_DIR, image.filename);
          const options = await generateCaptionOptions(image.quote, imagePath);
          captionOptionsList.push(options);
        } catch {
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
        "web",
        promptName,
        captionOptionsList.length > 0 ? captionOptionsList : undefined
      );
      invalidateCache();
    }

    const totalOptions = captionOptionsList.reduce((s, o) => s + o.length, 0);

    return NextResponse.json({
      success: true,
      batchId,
      imageCount: successfulImages.length,
      captionOptionsCount: totalOptions,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 }
    );
  }
}
