import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { loadTemplate, applyTemplate, listTemplates } from "@/lib/prompts";
import { pickCombinations } from "@/lib/mixer";
import { generateQuoteImage } from "@/lib/gemini";
import { generateCaptionOptions } from "@/lib/caption";
import { createBatch, generateBatchId, invalidateCache } from "@/lib/manifest";
import { getAccount, getAccountDir, getAccountImagesDir, getAccountTemplatesDir } from "@/lib/account";

const GLOBAL_OUTPUT = path.resolve(process.cwd(), "output");
const GLOBAL_TEMPLATES_DIR = path.resolve(process.cwd(), "templates");

export async function POST(request: NextRequest) {
  try {
    // 0. Parse optional account and count
    const body = await request.json().catch(() => ({}));
    const accountId: string | undefined = body.account;
    const generateCount: number = Math.min(Math.max(body.count || 5, 1), 10);

    // Resolve account-specific paths
    const account = accountId ? getAccount(accountId) : undefined;
    const outputDir = account ? getAccountDir(accountId!) : GLOBAL_OUTPUT;
    const imagesDir = account ? getAccountImagesDir(accountId!) : GLOBAL_OUTPUT;

    // Progress file path
    const progressPath = path.join(outputDir, ".generation-progress.json");

    // Resolve template base directory (account first, then global)
    // Must match loadTemplates() logic in mixer.ts
    const templateDir = (() => {
      if (accountId) {
        const accountDir = getAccountTemplatesDir(accountId);
        if (fs.existsSync(accountDir)) {
          const files = fs.readdirSync(accountDir);
          const hasImages = files.some((f) =>
            [".jpg", ".jpeg", ".png", ".webp"].includes(path.extname(f).toLowerCase())
          );
          if (hasImages) return accountDir;
        }
      }
      return GLOBAL_TEMPLATES_DIR;
    })();

    // 1. Load prompt template (account-scoped)
    const templates = listTemplates(accountId);
    if (templates.length === 0) {
      return NextResponse.json(
        { success: false, error: "No prompt templates found in prompts/." },
        { status: 400 }
      );
    }

    const promptName = templates[0];
    const rawTemplate = loadTemplate(promptName, accountId);

    // 2. Pick combinations (account-scoped, with count)
    const combos = pickCombinations(generateCount, accountId);

    // 3. Ensure output directories exist
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true });
    }

    // Write initial progress
    const writeProgress = (completed: number, current: string) => {
      try {
        fs.writeFileSync(progressPath, JSON.stringify({ total: combos.length, completed, current }), "utf-8");
      } catch { /* non-fatal */ }
    };
    writeProgress(0, "Starting...");

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
      const templatePath = path.join(templateDir, template);

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
        fs.writeFileSync(path.join(imagesDir, filename), imageBuffer);
        results.push({ quote, template, filename, success: true });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({ quote, template, filename, success: false, error: msg });
      }
      writeProgress(i + 1, quote);
    }

    // 5. Generate captions for successful images
    const successfulImages = results.filter((r) => r.success);
    const captionOptionsList: Awaited<ReturnType<typeof generateCaptionOptions>>[] = [];

    if (successfulImages.length > 0) {
      for (const image of successfulImages) {
        try {
          const imagePath = path.join(imagesDir, image.filename);
          const options = await generateCaptionOptions(image.quote, imagePath);
          captionOptionsList.push(options);
        } catch {
          captionOptionsList.push([]);
        }
      }
    }

    // 6. Save manifest (account-scoped dir)
    if (successfulImages.length > 0) {
      createBatch(
        successfulImages.map((r) => ({
          quote: r.quote,
          template: r.template,
          filename: r.filename,
        })),
        "web",
        promptName,
        captionOptionsList.length > 0 ? captionOptionsList : undefined,
        outputDir
      );
      invalidateCache();
    }

    const totalOptions = captionOptionsList.reduce((s, o) => s + o.length, 0);

    // Clean up progress file
    try { fs.unlinkSync(progressPath); } catch { /* ok */ }

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

/**
 * GET /api/generate?account=xxx — check generation progress
 */
export async function GET(request: NextRequest) {
  const accountId = request.nextUrl.searchParams.get("account");
  const account = accountId ? getAccount(accountId) : undefined;
  const outputDir = account ? getAccountDir(accountId!) : GLOBAL_OUTPUT;
  const progressPath = path.join(outputDir, ".generation-progress.json");

  try {
    if (fs.existsSync(progressPath)) {
      const raw = fs.readFileSync(progressPath, "utf-8");
      const progress = JSON.parse(raw);
      return NextResponse.json({ success: true, ...progress });
    }
    return NextResponse.json({ success: true, total: 0, completed: 0, current: null });
  } catch {
    return NextResponse.json({ success: true, total: 0, completed: 0, current: null });
  }
}
