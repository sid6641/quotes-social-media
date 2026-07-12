import { describe, it, expect } from "vitest";
import { pickCombos, type QuoteEntry, type QuoteTemplateCombo } from "./mixer";

const quotes: QuoteEntry[] = [
  { text: "Be yourself; everyone else is already taken.", id: "q-001" },
  { text: "Simplicity is the ultimate sophistication.", id: "q-002" },
  { text: "The only way to do great work is to love what you do.", id: "q-003" },
  { text: "In the middle of difficulty lies opportunity.", id: "q-004" },
  { text: "The future belongs to those who believe in the beauty of their dreams.", id: "q-005" },
  { text: "It does not matter how slowly you go as long as you do not stop.", id: "q-006" },
  { text: "Two roads diverged in a wood, and I took the one less traveled by.", id: "q-007" },
  { text: "The only impossible journey is the one you never begin.", id: "q-008" },
  { text: "What lies behind us and what lies before us are tiny matters compared to what lies within us.", id: "q-009" },
  { text: "Creativity is intelligence having fun.", id: "q-010" },
];

const templates = [
  "bg-dark.jpg",
  "bg-light.jpg",
  "bg-gradient.jpg",
  "bg-minimal.jpg",
  "bg-nature.jpg",
];

describe("pickCombos", () => {
  // ── Basic count ────────────────────────────────────────────────

  it("returns exactly the requested number of combos", () => {
    const result = pickCombos(quotes, templates, 3, new Set());
    expect(result).toHaveLength(3);
  });

  it("returns all quote×template combos when all=true", () => {
    const result = pickCombos(quotes, templates, 0, new Set(), true);
    expect(result).toHaveLength(quotes.length * templates.length);
  });

  it("returns empty array when count is 0 and all is not set", () => {
    const result = pickCombos(quotes, templates, 0, new Set());
    expect(result).toHaveLength(0);
  });

  it("returns empty array when count is negative", () => {
    const result = pickCombos(quotes, templates, -1, new Set());
    expect(result).toHaveLength(0);
  });

  // ── Index-based pairing ────────────────────────────────────────

  it("pairs quote[i] with template[i] sequentially", () => {
    const result = pickCombos(quotes, templates, 3, new Set());
    expect(result[0].quote).toBe(quotes[0].text);
    expect(result[0].template).toBe(templates[0]);
    expect(result[1].quote).toBe(quotes[1].text);
    expect(result[1].template).toBe(templates[1]);
    expect(result[2].quote).toBe(quotes[2].text);
    expect(result[2].template).toBe(templates[2]);
  });

  it("wraps around when count exceeds quotes length", () => {
    const result = pickCombos(quotes, templates, 12, new Set());
    // After 10 quotes, wraps back to quote[0]
    expect(result[10].quote).toBe(quotes[0].text);
    expect(result[11].quote).toBe(quotes[1].text);
  });

  it("wraps around when count exceeds templates length", () => {
    const result = pickCombos(quotes, templates, 7, new Set());
    // template[5] wraps to template[0]
    expect(result[5].template).toBe(templates[0]);
    expect(result[6].template).toBe(templates[1]);
  });

  // ── Same quote can appear multiple times ───────────────────────

  it("can pick the same quote multiple times with different templates", () => {
    // 10 quotes, 5 templates, requesting 10 combos
    // quote[0] pairs with template[0], then wraps: quote[0] pairs with template[5%5=0] again
    // But template[0]+quote[0] would be a duplicate key, so dedup picks alternate template
    const result = pickCombos(quotes, templates, 10, new Set());
    const quoteTexts = result.map((c) => c.quote);
    const beYourself = quoteTexts.filter((t) => t === quotes[0].text);
    expect(beYourself.length).toBeGreaterThanOrEqual(1);
  });

  // ── Combo dedup ────────────────────────────────────────────────

  it("never returns the same quote+template combo twice", () => {
    const result = pickCombos(quotes, templates, 50, new Set());
    const keys = result.map((c) => `${c.quote}::${c.template}`);
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(keys.length);
  });

  it("selects an alternate template when the default pairing is a duplicate", () => {
    // 1 quote, 5 templates, requesting 5 combos
    // Without dedup, all 5 would pair with template[0]
    const singleQuote: QuoteEntry[] = [{ text: "Only quote", id: "q-001" }];
    const result = pickCombos(singleQuote, templates, 5, new Set());
    expect(result).toHaveLength(5);
    // Each should have a unique template
    const templatesUsed = result.map((c) => c.template);
    expect(new Set(templatesUsed).size).toBe(5);
  });

  // ── Fresh quote preference ─────────────────────────────────────

  it("prefers quotes not in recentlyUsed when alternatives exist", () => {
    const recentlyUsed = new Set([quotes[0].text, quotes[1].text]);
    const result = pickCombos(quotes, templates, 2, recentlyUsed);
    // Should pick from fresh quotes (index 2+), not the recently used ones
    expect(result[0].quote).not.toBe(quotes[0].text);
    expect(result[0].quote).not.toBe(quotes[1].text);
  });

  it("falls back to recently used quotes when all quotes are recently used", () => {
    const allRecentlyUsed = new Set(quotes.map((q) => q.text));
    const result = pickCombos(quotes, templates, 2, allRecentlyUsed);
    // Must fall back — no fresh quotes available
    expect(result).toHaveLength(2);
  });

  // ── QuoteId propagation ────────────────────────────────────────

  it("preserves quoteId from input entries", () => {
    const result = pickCombos(quotes, templates, 2, new Set());
    expect(result[0].quoteId).toBe("q-001");
    expect(result[1].quoteId).toBe("q-002");
  });

  // ── All mode specifics ─────────────────────────────────────────

  it("all mode returns every quote paired with every template", () => {
    const qq: QuoteEntry[] = [
      { text: "A", id: "q1" },
      { text: "B", id: "q2" },
    ];
    const tt = ["x.jpg", "y.jpg"];
    const result = pickCombos(qq, tt, 0, new Set(), true);
    expect(result).toEqual([
      { quote: "A", template: "x.jpg", quoteId: "q1" },
      { quote: "A", template: "y.jpg", quoteId: "q1" },
      { quote: "B", template: "x.jpg", quoteId: "q2" },
      { quote: "B", template: "y.jpg", quoteId: "q2" },
    ]);
  });

  it("all mode ignores count and recentlyUsed", () => {
    const qq: QuoteEntry[] = [{ text: "A", id: "q1" }];
    const tt = ["x.jpg"];
    const result = pickCombos(qq, tt, 999, new Set(["A"]), true);
    // Despite count=999 and recentlyUsed containing "A", all mode returns 1
    expect(result).toHaveLength(1);
  });
});
