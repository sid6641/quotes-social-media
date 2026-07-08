/**
 * Caption generation for Instagram quote posts.
 *
 * Given a quote, generates a commentary/reflection and relevant hashtags
 * using a Gemini text model (cheaper than the image model).
 */

import { GoogleGenerativeAI } from "@google/generative-ai";

export interface CaptionData {
  commentary: string;
  hashtags: string[];
}

/**
 * Default text model for caption generation.
 * Cheaper and faster than the image-gen model.
 * Override via GEMINI_TEXT_MODEL env var.
 */
const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || "gemini-2.0-flash";

const CAPTION_SYSTEM_PROMPT = `You are a social media caption writer for an inspirational quotes Instagram page. Your tone is warm, relatable, and slightly aspirational — like a thoughtful friend sharing wisdom.

For each quote, generate:
1. A short commentary/reflection (1-3 sentences) that adds emotional resonance, context, or a personal spin. Make it feel human, not robotic.
2. 8-12 highly relevant hashtags that mix broad categories (e.g. #motivation #inspiration #quotes) with niche ones specific to the quote's theme.

Respond with a JSON array. Example:
[
  {
    "commentary": "This one hits different on a tough morning. Growth isn't about giant leaps — it's about showing up consistently, even when it's uncomfortable.",
    "hashtags": ["#motivation", "#mindset", "#growthmindset", "#dailyinspiration", "#keepgoing", "#quotes", "#wisdom", "#personalgrowth", "#stayconsistent", "#morningmotivation"]
  }
]`;

/**
 * Generate captions for an array of quotes in a single API call.
 * Returns a CaptionData for each quote, in the same order.
 */
export async function generateCaptions(quotes: string[]): Promise<CaptionData[]> {
  if (quotes.length === 0) return [];

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "your_gemini_api_key_here") {
    throw new Error(
      "GEMINI_API_KEY is not set. Create a .env file with your key."
    );
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: TEXT_MODEL });

  const numberedQuotes = quotes
    .map((q, i) => `${i + 1}. "${q}"`)
    .join("\n");

  const prompt = `${CAPTION_SYSTEM_PROMPT}\n\nGenerate captions for these quotes:\n\n${numberedQuotes}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();

  // Extract JSON array from the response
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error(
      `Failed to parse caption response. Raw: ${text.substring(0, 200)}`
    );
  }

  let parsed: Array<{ commentary?: string; hashtags?: string[] }>;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error(
      `Invalid JSON in caption response. Raw: ${text.substring(0, 200)}`
    );
  }

  // Validate and normalize
  return parsed.map((item, i) => ({
    commentary: item.commentary || `Reflection on: ${quotes[i]}`,
    hashtags: Array.isArray(item.hashtags) ? item.hashtags : generateFallbackHashtags(quotes[i]),
  }));
}

/**
 * Fallback hashtag generation when the AI response is malformed.
 * Extracts keywords from the quote and prepends common tags.
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

/**
 * Generate a single caption. Convenience wrapper that delegates to batch.
 */
export async function generateCaption(quote: string): Promise<CaptionData> {
  const results = await generateCaptions([quote]);
  return results[0];
}
