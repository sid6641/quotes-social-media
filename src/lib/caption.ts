/**
 * Caption generation for Instagram quote posts.
 *
 * Given a quote AND the generated image, produces 5 distinct caption options
 * using Gemini. The image is sent alongside the quote so the caption matches
 * the visual mood, colors, and composition.
 *
 * Self-learning: Caption examples get stored when the user picks one.
 * Future generations include top examples as few-shot inspiration.
 */

import fs from "fs";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getMimeType } from "./media";

export interface CaptionData {
  commentary: string;
  hashtags: string[];
}

/**
 * Default text model for caption generation.
 * Must support image input — gemini-2.0-flash does.
 * Override via GEMINI_TEXT_MODEL env var.
 */
const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || "gemini-2.5-flash-image";
const OPTIONS_COUNT = 5;

const CAPTION_PROMPT = `You are a social media caption writer for an inspirational quotes Instagram page. Your tone is warm, relatable, and slightly aspirational.

## Step 1 — Analyze the image
Look at the image and identify:
- Visual mood and atmosphere (calm, dramatic, warm, minimalist, bold, etc.)
- Dominant colors and aesthetic style
- How the quote is presented (placement, typography, contrast, readability)
- The emotional response the image creates

## Step 2 — Generate 5 distinct caption options
Write exactly 5 caption options. Each MUST have a clearly different tone and approach:

| Option | Tone | Style |
|--------|------|-------|
| 1 | Warm & Reflective | Matches calm, aesthetic visuals. Gentle, thoughtful. |
| 2 | Bold & Punchy | Short, high-impact. For dramatic or contrasting visuals. |
| 3 | Story-driven | Personal, narrative. Feels like a journal entry. |
| 4 | Minimalist | Short commentary, powerful hashtags. Let the image breathe. |
| 5 | Philosophical | Deep, thought-provoking. Connects the quote to bigger ideas. |

Each option must include:
- **commentary**: 1-3 sentences matching the tone above
- **hashtags**: 8-12 tags mixing broad categories (e.g. #motivation) with niche ones tied to the quote's theme

## Guidelines
- Make every option feel human, not robotic — vary sentence structure
- Match the hashtag style to the tone (bold = sharp tags, reflective = softer tags)
- Never use generic filler — each option should be genuinely publishable

Quote to caption: "{{quote}}"

{few_shot}

Respond ONLY with a valid JSON array of exactly 5 objects (no markdown, no backticks):
[
  { "commentary": "...", "hashtags": ["...", "..."] },
  ...
]`;

/**
 * Load top caption examples from the learning store for few-shot prompting.
 */
function loadFewShotExamples(): string {
  try {
    const storePath = process.env.CAPTION_LEARNING_STORE || "output/caption-examples.json";
    if (!fs.existsSync(storePath)) return "";

    const raw = fs.readFileSync(storePath, "utf-8");
    const store = JSON.parse(raw);
    const examples = store.examples || [];

    // Sort by times used (most picked = best example), take top 2
    const best = (examples as Array<{ chosenCaption: CaptionData; pickCount: number }>)
      .filter((e) => e.chosenCaption?.commentary)
      .sort((a, b) => (b.pickCount || 0) - (a.pickCount || 0))
      .slice(0, 2);

    if (best.length === 0) return "";

    const lines = ["\n## Examples of great captions (learned from past picks):"];
    for (const ex of best) {
      lines.push(`- "${ex.chosenCaption.commentary}"`);
      lines.push(`  Tags: ${ex.chosenCaption.hashtags.join(" ")}`);
    }
    return lines.join("\n");
  } catch {
    return "";
  }
}

/**
 * Generate 5 caption options for a single quote+image pair.
 *
 * @param quote       The quote text
 * @param imagePath   Absolute path to the generated image file
 * @returns           Array of 5 CaptionData options
 */
export async function generateCaptionOptions(
  quote: string,
  imagePath: string
): Promise<CaptionData[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "your_gemini_api_key_here") {
    throw new Error(
      "GEMINI_API_KEY is not set. Create a .env file with your key."
    );
  }

  // Read the generated image
  if (!fs.existsSync(imagePath)) {
    throw new Error(`Image not found for caption generation: ${imagePath}`);
  }

  const imageBuffer = fs.readFileSync(imagePath);
  const mimeType = getMimeType(imagePath);
  const base64Image = imageBuffer.toString("base64");

  // Build prompt with few-shot examples
  const fewShot = loadFewShotExamples();
  const prompt = CAPTION_PROMPT.replace("{{quote}}", quote).replace("{few_shot}", fewShot);

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: TEXT_MODEL });

  const result = await model.generateContent([
    {
      inlineData: {
        mimeType,
        data: base64Image,
      },
    },
    { text: prompt },
  ]);

  const text = result.response.text();

  // Parse JSON array from response
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    // Retry once without few-shot examples in case they confused the model
    if (fewShot) {
      const cleanPrompt = CAPTION_PROMPT.replace("{{quote}}", quote).replace("{few_shot}", "");
      const retryResult = await model.generateContent([
        { inlineData: { mimeType, data: base64Image } },
        { text: cleanPrompt },
      ]);
      const retryText = retryResult.response.text();
      const retryMatch = retryText.match(/\[[\s\S]*\]/);
      if (retryMatch) {
        return parseOptions(retryMatch[0], quote);
      }
    }
    throw new Error(
      `Failed to parse caption options. Raw: ${text.substring(0, 300)}`
    );
  }

  return parseOptions(jsonMatch[0], quote);
}

/**
 * Parse and validate the JSON options array from Gemini.
 */
function parseOptions(jsonStr: string, quote: string): CaptionData[] {
  let parsed: Array<{ commentary?: string; hashtags?: string[] }>;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    // Try fixing common issues (trailing commas, single quotes)
    try {
      const fixed = jsonStr
        .replace(/,(\s*[}\]])/g, "$1")
        .replace(/'/g, '"');
      parsed = JSON.parse(fixed);
    } catch {
      throw new Error(`Invalid JSON in caption response.`);
    }
  }

  if (!Array.isArray(parsed)) {
    throw new Error("Caption response was not an array.");
  }

  // Ensure we return exactly OPTIONS_COUNT items
  const options: CaptionData[] = [];
  for (let i = 0; i < OPTIONS_COUNT; i++) {
    const item = parsed[i];
    if (item) {
      options.push({
        commentary: item.commentary?.trim() || `Option ${i + 1} for: ${quote.substring(0, 40)}...`,
        hashtags: Array.isArray(item.hashtags) ? item.hashtags : generateFallbackHashtags(quote),
      });
    } else {
      // Pad with fallbacks if Gemini returned fewer than 5
      options.push({
        commentary: getFallbackCommentary(quote, i),
        hashtags: generateFallbackHashtags(quote),
      });
    }
  }

  return options;
}

/**
 * Fallback commentary when Gemini doesn't return a valid option.
 */
function getFallbackCommentary(quote: string, index: number): string {
  const fallbacks = [
    `A gentle reminder that ${quote.toLowerCase()}`,
    `This one hits different. ${quote}`,
    `Here's a thought to carry with you today: ${quote}`,
    `Simple wisdom for a complicated world. ${quote}`,
    `Let this sink in for a moment: ${quote}`,
  ];
  return fallbacks[index] || fallbacks[0];
}

/**
 * Fallback hashtag generation when AI response is malformed.
 */
function generateFallbackHashtags(quote: string): string[] {
  const common = ["#quotes", "#inspiration", "#quoteoftheday"];
  const words = quote
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 4)
    .slice(0, 5);
  const specific = words.map((w) => `#${w}`);
  const combined = common.concat(specific);
  return combined.filter((v, i, a) => a.indexOf(v) === i);
}
