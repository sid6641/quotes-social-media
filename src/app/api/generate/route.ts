import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { loadTemplate, applyTemplate, listTemplates } from "@/lib/prompts";
import { pickCombinations } from "@/lib/mixer";
import { generateQuoteImage } from "@/lib/gemini";
import { createBatch, invalidateCache } from "@/lib/manifest";

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
    const batchId = new Date().toISOString().slice(0, 10);
    const results: Array<{
      quote: string;
      template: string;
      filename: string;
      success: boolean;
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
      } catch {
        results.push({ quote, template, filename, success: false });
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
        "web",
        promptName
      );
      invalidateCache();
    }

    return NextResponse.json({
      success: true,
      batchId,
      imageCount: successfulImages.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 }
    );
  }
}
