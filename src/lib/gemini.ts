import fs from "fs";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getMimeType } from "./media";

/**
 * Model to use for image generation.
 * gemini-2.0-flash-exp-image-generation supports image output.
 * Override via GEMINI_MODEL env var if needed.
 */
const IMAGE_GEN_MODEL = process.env.GEMINI_MODEL || "gemini-3.1-flash-image";

/**
 * Generate a quote image by sending a background image and engineered prompt
 * to Gemini. Returns the generated image as a Buffer.
 *
 * The prompt instructs Gemini to produce a 1080×1080px composite with the
 * quote text styled over the background.
 */
export async function generateQuoteImage(
  backgroundPath: string,
  quoteText: string,
  promptTemplate: string
): Promise<Buffer> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "your_gemini_api_key_here") {
    throw new Error(
      "GEMINI_API_KEY is not set. Create a .env file with your key."
    );
  }

  // Read background image
  if (!fs.existsSync(backgroundPath)) {
    throw new Error(`Background image not found: ${backgroundPath}`);
  }

  const imageBuffer = fs.readFileSync(backgroundPath);
  const mimeType = getMimeType(backgroundPath);
  const base64Image = imageBuffer.toString("base64");

  // The prompt template already has {{quote_text}} and {{background_description}}
  // substituted by the caller — use as-is
  const prompt = promptTemplate;

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: IMAGE_GEN_MODEL });

  const result = await model.generateContent([
    {
      inlineData: {
        mimeType,
        data: base64Image,
      },
    },
    { text: prompt },
  ]);

  const response = result.response;
  const parts = response.candidates?.[0]?.content?.parts ?? [];

  // Find the first inline_data part (generated image)
  for (const part of parts) {
    if (part.inlineData) {
      return Buffer.from(part.inlineData.data, "base64");
    }
  }

  // If no image was generated, try getting it from the response directly
  // Some models return the image differently
  const text = response.text();
  if (text) {
    throw new Error(
      `Gemini did not return an image. Response: ${text.substring(0, 200)}`
    );
  }

  throw new Error(
    "Gemini response contained no image data. The model may not support image generation."
  );
}


