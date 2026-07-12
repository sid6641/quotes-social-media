import { describe, it, expect } from "vitest";
import {
  buildGeneratePrompt,
  parseQuotesResponse,
  buildDirectImagePrompt,
  type GeneratedQuote,
} from "./quotes-generator";

// ─── buildGeneratePrompt ────────────────────────────────────────────

describe("buildGeneratePrompt", () => {
  it("includes the requested count in the prompt", () => {
    const prompt = buildGeneratePrompt(5);
    expect(prompt).toContain("Generate 5 original");
  });

  it("includes the theme when provided", () => {
    const prompt = buildGeneratePrompt(3, "motivation");
    expect(prompt).toContain('The theme is "motivation".');
  });

  it("uses variety fallback when no theme given", () => {
    const prompt = buildGeneratePrompt(10);
    expect(prompt).toContain("Use a variety of themes");
    expect(prompt).not.toContain('The theme is "');
  });

  it("always returns a non-empty string", () => {
    const prompt = buildGeneratePrompt(1);
    expect(prompt).toBeTruthy();
    expect(typeof prompt).toBe("string");
  });
});

// ─── parseQuotesResponse ────────────────────────────────────────────

describe("parseQuotesResponse", () => {
  it("parses a clean JSON array of quotes", () => {
    const raw = JSON.stringify([
      { text: "Be yourself.", author: "Oscar Wilde" },
      { text: "Simplicity is key." },
    ]);
    const result = parseQuotesResponse(raw);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ text: "Be yourself.", author: "Oscar Wilde" });
    expect(result[1]).toEqual({ text: "Simplicity is key.", author: undefined });
  });

  it("strips markdown fences (```json ... ```)", () => {
    const raw = "```json\n[{\"text\": \"Hello world.\"}]\n```";
    const result = parseQuotesResponse(raw);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("Hello world.");
  });

  it("strips markdown fences without language hint (``` ... ```)", () => {
    const raw = "```\n[{\"text\": \"No lang hint.\"}]\n```";
    const result = parseQuotesResponse(raw);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("No lang hint.");
  });

  it("trims whitespace around fences and text", () => {
    const raw = "  \n```json\n[{\"text\": \"  Spaced out.  \"}]\n```  \n";
    const result = parseQuotesResponse(raw);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("Spaced out.");
  });

  it("handles missing author field gracefully", () => {
    const raw = JSON.stringify([{ text: "No author here." }]);
    const result = parseQuotesResponse(raw);
    expect(result[0].author).toBeUndefined();
  });

  it("filters out quotes with empty text after trimming", () => {
    const raw = JSON.stringify([
      { text: "Valid quote." },
      { text: "" },
      { text: "   " },
    ]);
    const result = parseQuotesResponse(raw);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("Valid quote.");
  });

  it("trims author field", () => {
    const raw = JSON.stringify([{ text: "A quote.", author: "  Plato  " }]);
    const result = parseQuotesResponse(raw);
    expect(result[0].author).toBe("Plato");
  });

  it("throws on non-array JSON (object)", () => {
    const raw = JSON.stringify({ text: "not an array" });
    expect(() => parseQuotesResponse(raw)).toThrow("Gemini did not return an array of quotes");
  });

  it("throws on non-array JSON (null)", () => {
    expect(() => parseQuotesResponse("null")).toThrow("Gemini did not return an array of quotes");
  });

  it("throws on malformed JSON", () => {
    expect(() => parseQuotesResponse("not valid json")).toThrow();
  });

  it("throws on empty string", () => {
    expect(() => parseQuotesResponse("")).toThrow();
  });
});

// ─── buildDirectImagePrompt ─────────────────────────────────────────

describe("buildDirectImagePrompt", () => {
  it("includes the quote text", () => {
    const prompt = buildDirectImagePrompt("Carpe diem.");
    expect(prompt).toContain("Carpe diem.");
  });

  it("includes theme guidance when theme provided", () => {
    const prompt = buildDirectImagePrompt("Hello.", "minimal");
    expect(prompt).toContain('Visual style: "minimal".');
  });

  it("uses fallback wording when no theme given", () => {
    const prompt = buildDirectImagePrompt("Hello.");
    expect(prompt).toContain("Choose a visually appealing style");
    expect(prompt).not.toContain('Visual style: "');
  });

  it("specifies 1080×1080px dimensions", () => {
    const prompt = buildDirectImagePrompt("Hello.");
    expect(prompt).toContain("1080×1080px");
  });
});
