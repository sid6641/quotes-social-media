/**
 * Quotes Generator — uses Gemini to produce original quote text
 * and optionally full Instagram-ready images (Plan B).
 *
 * Plan A: generate text → import into pool → existing pipeline makes images
 * Plan B: generate a complete 1080×1080 Instagram-ready image directly
 */

import { GoogleGenerativeAI } from "@google/generative-ai";

// ─── Configuration ───────────────────────────────────────────────────

const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || "gemini-2.5-flash";
const IMAGE_MODEL = process.env.GEMINI_MODEL || "gemini-3.1-flash-image";

export interface GeneratedQuote {
  text: string;
  author?: string;
}

const DEFAULT_THEMES = [
  "motivation",
  "perseverance",
  "success",
  "mindfulness",
  "creativity",
  "humor",
  "philosophy",
  "leadership",
  "growth",
  "simplicity",
] as const;

export type QuoteTheme = (typeof DEFAULT_THEMES)[number];

// ─── Helpers ─────────────────────────────────────────────────────────

function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === "your_gemini_api_key_here") {
    throw new Error("GEMINI_API_KEY is not set. Create a .env file with your key.");
  }
  return key;
}

// ─── Pure: Prompt Builder ────────────────────────────────────────────

/**
 * Build the prompt text for Gemini quote generation.
 * Pure function — no side effects, no API calls.
 */
export function buildGeneratePrompt(count: number, theme?: string): string {
  const themePrompt = theme
    ? `The theme is "${theme}".`
    : "Use a variety of themes (motivation, perseverance, success, mindfulness, etc.).";

  return `You are a quotes author. Generate ${count} original, unique, Instagram-worthy quotes.

${themePrompt}

Requirements:
- Each quote must be original — do NOT use existing famous quotes
- Each quote should be 5-20 words, impactful, and quotable
- Vary the style: some profound, some witty, some minimalist
- Optionally attribute a fictional author name for some quotes (max 20% of them)
- Return as a JSON array of objects with "text" and optionally "author" fields
- Example: [{"text": "Fall seven times, stand up eight.", "author": "Miyagi"}, {"text": "Breathe. It's just a chapter, not the whole story."}]

Return ONLY valid JSON, no markdown, no explanation.`;
}

// ─── Pure: Response Parser ───────────────────────────────────────────

/**
 * Parse Gemini's raw text response into structured quote objects.
 * Strips markdown fences, handles malformed JSON.
 * Pure function — no side effects, no API calls.
 */
export function parseQuotesResponse(rawText: string): GeneratedQuote[] {
  const jsonStr = rawText.trim().replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  const parsed = JSON.parse(jsonStr);

  if (!Array.isArray(parsed)) {
    throw new Error("Gemini did not return an array of quotes");
  }

  return parsed.map((q: any) => ({
    text: q.text?.trim() || "",
    author: q.author?.trim(),
  })).filter((q) => q.text.length > 0);
}

// ─── Pure: Direct Image Prompt Builder ───────────────────────────────

/**
 * Build the prompt text for direct Instagram image generation.
 * Pure function — no side effects, no API calls.
 */
export function buildDirectImagePrompt(quoteText: string, theme?: string): string {
  const themeGuidance = theme
    ? `Visual style: "${theme}". Choose colors, fonts, and composition that match this mood.`
    : "Choose a visually appealing style — minimalist, warm, or dramatic — that fits the quote's tone.";

  return `You are an expert Instagram quote image designer. Create a 1080×1080px square image for the following quote:

"${quoteText}"

${themeGuidance}

Requirements:
- 1080×1080px, ready to post on Instagram
- NO additional text, watermark, or branding besides the quote itself
- The quote should be prominently and beautifully displayed
- Use color, typography, and composition to make it feel premium
- No external logos, no handles, no URLs

Return ONLY the generated image.`;
}

// ─── Plan A: Text Generation (Integration) ──────────────────────────

/**
 * Generate original quote texts using Gemini.
 *
 * @param count  Number of quotes to generate (default: 10)
 * @param theme  Topic or mood (e.g. "motivation", "humor")
 * @returns  Array of { text, author? } objects
 */
export async function generateQuotes(
  count: number = 10,
  theme?: string
): Promise<GeneratedQuote[]> {
  const apiKey = getApiKey();
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: TEXT_MODEL });

  const prompt = buildGeneratePrompt(count, theme);
  const result = await model.generateContent(prompt);
  const response = result.response;
  const text = response.text().trim();

  return parseQuotesResponse(text);
}

// ─── Plan B: Direct Image Generation ─────────────────────────────────

/**
 * Generate a complete Instagram-ready quote image using Gemini.
 * No background template needed — Gemini creates the full visual.
 *
 * @param quoteText  The quote to render
 * @param theme  Visual style guidance
 * @returns  Buffer of the generated 1080×1080 PNG image
 */
export async function generateQuoteImageDirect(
  quoteText: string,
  theme?: string
): Promise<Buffer> {
  const apiKey = getApiKey();
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: IMAGE_MODEL });

  const prompt = buildDirectImagePrompt(quoteText, theme);

  const result = await model.generateContent([
    { text: prompt },
  ]);

  const parts = result.response.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    if (part.inlineData) {
      return Buffer.from(part.inlineData.data, "base64");
    }
  }

  throw new Error("Gemini did not return an image. Try a model that supports image generation.");
}
