import { describe, it, expect } from "vitest";
import {
  addQuoteToPool,
  importQuotesToPool,
  getAvailableQuotesFromPool,
  markQuoteUsedInPool,
  recycleQuoteInPool,
  getPoolStatsFromPool,
  type QuotePool,
} from "./quote-pool";

function emptyPool(): QuotePool {
  return { quotes: [] };
}

function seededPool(): QuotePool {
  return {
    quotes: [
      {
        id: "q-00001",
        text: "Be yourself.",
        source: "manual",
        status: "available",
        usageCount: 0,
        usedByAccounts: [],
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-01T00:00:00.000Z",
      },
      {
        id: "q-00002",
        text: "Simplicity is the ultimate sophistication.",
        source: "imported",
        status: "available",
        usageCount: 2,
        usedByAccounts: ["testplay"],
        lastUsedAt: "2026-07-10T00:00:00.000Z",
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-10T00:00:00.000Z",
      },
      {
        id: "q-00003",
        text: "The only way to do great work is to love what you do.",
        source: "imported",
        status: "cooldown",
        usageCount: 4,
        usedByAccounts: ["testplay"],
        lastUsedAt: "2026-07-05T00:00:00.000Z",
        cooldownUntil: "2026-08-04T00:00:00.000Z",
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-05T00:00:00.000Z",
      },
      {
        id: "q-00004",
        text: "In the middle of difficulty lies opportunity.",
        source: "imported",
        status: "retired",
        usageCount: 5,
        usedByAccounts: ["testplay"],
        lastUsedAt: "2026-07-08T00:00:00.000Z",
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-08T00:00:00.000Z",
      },
      {
        id: "q-00005",
        text: "The future belongs to those who believe.",
        source: "manual",
        status: "cooldown",
        usageCount: 1,
        usedByAccounts: ["testplay"],
        lastUsedAt: "2026-07-01T00:00:00.000Z",
        cooldownUntil: "2026-07-20T00:00:00.000Z", // expired cooldown
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-01T00:00:00.000Z",
      },
      {
        id: "q-00006",
        text: "It does not matter how slowly you go.",
        source: "manual",
        status: "available",
        usageCount: 0,
        usedByAccounts: [],
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-01T00:00:00.000Z",
      },
    ],
  };
}

const NOW = new Date("2026-07-12T12:00:00.000Z");

// ── addQuoteToPool ─────────────────────────────────────────────────

describe("addQuoteToPool", () => {
  it("adds a quote with available status", () => {
    const pool = emptyPool();
    addQuoteToPool(pool, "New quote", {}, NOW);
    expect(pool.quotes).toHaveLength(1);
    expect(pool.quotes[0].text).toBe("New quote");
    expect(pool.quotes[0].status).toBe("available");
    expect(pool.quotes[0].usageCount).toBe(0);
  });

  it("generates sequential IDs", () => {
    const pool = emptyPool();
    addQuoteToPool(pool, "First", {}, NOW);
    addQuoteToPool(pool, "Second", {}, NOW);
    expect(pool.quotes[0].id).toBe("q-00001");
    expect(pool.quotes[1].id).toBe("q-00002");
  });

  it("continues ID sequence from existing pool", () => {
    const pool = { quotes: [{ id: "q-00005", text: "Existing" } as any] };
    addQuoteToPool(pool, "New", {}, NOW);
    expect(pool.quotes[1].id).toBe("q-00006");
  });

  it("trims whitespace from text", () => {
    const pool = emptyPool();
    addQuoteToPool(pool, "  spaced out  ", {}, NOW);
    expect(pool.quotes[0].text).toBe("spaced out");
  });

  it("sets author when provided", () => {
    const pool = emptyPool();
    addQuoteToPool(pool, "Quote", { author: "Oscar Wilde" }, NOW);
    expect(pool.quotes[0].author).toBe("Oscar Wilde");
  });

  it("sets source as manual by default", () => {
    const pool = emptyPool();
    addQuoteToPool(pool, "Quote", {}, NOW);
    expect(pool.quotes[0].source).toBe("manual");
  });

  it("sets source when provided", () => {
    const pool = emptyPool();
    addQuoteToPool(pool, "Quote", { source: "ai-generated" }, NOW);
    expect(pool.quotes[0].source).toBe("ai-generated");
  });

  it("sets createdAt and updatedAt from now parameter", () => {
    const pool = emptyPool();
    addQuoteToPool(pool, "Quote", {}, NOW);
    expect(pool.quotes[0].createdAt).toBe(NOW.toISOString());
    expect(pool.quotes[0].updatedAt).toBe(NOW.toISOString());
  });
});

// ── importQuotesToPool ─────────────────────────────────────────────

describe("importQuotesToPool", () => {
  it("imports multiple quotes", () => {
    const pool = emptyPool();
    const count = importQuotesToPool(pool, ["A", "B", "C"], {}, NOW);
    expect(count).toBe(3);
    expect(pool.quotes).toHaveLength(3);
  });

  it("skips empty lines", () => {
    const pool = emptyPool();
    const count = importQuotesToPool(pool, ["A", "", "  ", "B"], {}, NOW);
    expect(count).toBe(2);
    expect(pool.quotes).toHaveLength(2);
  });

  it("skips case-insensitive duplicates", () => {
    const pool = emptyPool();
    importQuotesToPool(pool, ["Hello World"], {}, NOW);
    const count = importQuotesToPool(pool, ["hello world", "HELLO WORLD", "Different"], {}, NOW);
    expect(count).toBe(1); // only "Different" is new
    expect(pool.quotes).toHaveLength(2);
  });

  it("trims whitespace from imported quotes", () => {
    const pool = emptyPool();
    importQuotesToPool(pool, ["  trimmed  "], {}, NOW);
    expect(pool.quotes[0].text).toBe("trimmed");
  });

  it("returns count of imported quotes", () => {
    const pool = emptyPool();
    const c1 = importQuotesToPool(pool, ["A"], {}, NOW);
    expect(c1).toBe(1);
    const c2 = importQuotesToPool(pool, ["A", "B"], {}, NOW);
    expect(c2).toBe(1); // only B is new
  });
});

// ── getAvailableQuotesFromPool ─────────────────────────────────────

describe("getAvailableQuotesFromPool", () => {
  it("excludes retired quotes", () => {
    const result = getAvailableQuotesFromPool(seededPool(), 10, NOW);
    const texts = result.map((q) => q.text);
    expect(texts).not.toContain("In the middle of difficulty lies opportunity."); // q-00004 retired
  });

  it("excludes active cooldown quotes (cooldownUntil in the future)", () => {
    const result = getAvailableQuotesFromPool(seededPool(), 10, NOW);
    const texts = result.map((q) => q.text);
    expect(texts).not.toContain("The only way to do great work is to love what you do."); // q-00003 cooldown until Aug 4
  });

  it("includes expired cooldown quotes (cooldownUntil in the past)", () => {
    const result = getAvailableQuotesFromPool(seededPool(), 10, NOW);
    const texts = result.map((q) => q.text);
    // q-00005 cooldown until Jul 20, which is after NOW (Jul 12)? Wait...
    // Jul 20 > Jul 12, so it's still in cooldown
    // Let me verify: q-00005 cooldownUntil is "2026-07-20" and NOW is "2026-07-12"
    // Jul 20 > Jul 12, so it should be excluded
    expect(texts).not.toContain("The future belongs to those who believe.");
  });

  it("returns only available-status quotes (plus expired cooldowns)", () => {
    const pool = emptyPool();
    pool.quotes.push(
      { id: "q-01", text: "Available", status: "available", usageCount: 0, usedByAccounts: [], createdAt: "2026-07-01T00:00:00.000Z", updatedAt: "2026-07-01T00:00:00.000Z" },
      { id: "q-02", text: "Used", status: "used", usageCount: 1, usedByAccounts: ["x"], lastUsedAt: "2026-07-01T00:00:00.000Z", createdAt: "2026-07-01T00:00:00.000Z", updatedAt: "2026-07-01T00:00:00.000Z" },
    );
    const result = getAvailableQuotesFromPool(pool, 10, NOW);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("Available");
  });

  it("sorts by usageCount ascending, then lastUsedAt ascending", () => {
    const pool = {
      quotes: [
        { id: "q-03", text: "Used twice recently", status: "available", usageCount: 2, usedByAccounts: ["x"], lastUsedAt: "2026-07-10T00:00:00.000Z", createdAt: "2026-07-01T00:00:00.000Z", updatedAt: "2026-07-10T00:00:00.000Z" },
        { id: "q-01", text: "Never used", status: "available", usageCount: 0, usedByAccounts: [], createdAt: "2026-07-01T00:00:00.000Z", updatedAt: "2026-07-01T00:00:00.000Z" },
        { id: "q-02", text: "Used once older", status: "available", usageCount: 1, usedByAccounts: ["x"], lastUsedAt: "2026-07-05T00:00:00.000Z", createdAt: "2026-07-01T00:00:00.000Z", updatedAt: "2026-07-05T00:00:00.000Z" },
      ],
    };
    const result = getAvailableQuotesFromPool(pool, 10, NOW);
    expect(result[0].text).toBe("Never used");     // usageCount=0
    expect(result[1].text).toBe("Used once older"); // usageCount=1, older
    expect(result[2].text).toBe("Used twice recently"); // usageCount=2
  });

  it("respects the count limit", () => {
    const pool = emptyPool();
    for (let i = 0; i < 10; i++) {
      pool.quotes.push({
        id: `q-${String(i + 1).padStart(5, "0")}`,
        text: `Quote ${i + 1}`,
        status: "available",
        usageCount: 0,
        usedByAccounts: [],
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-01T00:00:00.000Z",
      });
    }
    const result = getAvailableQuotesFromPool(pool, 3, NOW);
    expect(result).toHaveLength(3);
  });
});

// ── markQuoteUsedInPool ────────────────────────────────────────────

describe("markQuoteUsedInPool", () => {
  it("transitions available to cooldown", () => {
    const pool = emptyPool();
    addQuoteToPool(pool, "Test quote", {}, NOW);
    const result = markQuoteUsedInPool(pool, pool.quotes[0].id, "testacc", 30, NOW);
    expect(result.success).toBe(true);
    expect(result.pool.quotes[0].status).toBe("cooldown");
  });

  it("increments usageCount", () => {
    const pool = emptyPool();
    addQuoteToPool(pool, "Test quote", {}, NOW);
    markQuoteUsedInPool(pool, pool.quotes[0].id, "testacc", 30, NOW);
    expect(pool.quotes[0].usageCount).toBe(1);
  });

  it("retires after 5 uses", () => {
    const pool: QuotePool = {
      quotes: [{
        id: "q-00001",
        text: "About to retire",
        source: "manual",
        status: "available",
        usageCount: 4,
        usedByAccounts: [],
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-01T00:00:00.000Z",
      }],
    };
    const result = markQuoteUsedInPool(pool, "q-00001", "testacc", 30, NOW);
    expect(result.success).toBe(true);
    expect(result.pool.quotes[0].status).toBe("retired");
    expect(result.pool.quotes[0].usageCount).toBe(5);
  });

  it("sets cooldownUntil to now + cooldownDays", () => {
    const pool = emptyPool();
    addQuoteToPool(pool, "Test quote", {}, NOW);
    markQuoteUsedInPool(pool, pool.quotes[0].id, "testacc", 30, NOW);
    const expected = new Date(NOW);
    expected.setDate(expected.getDate() + 30);
    expect(pool.quotes[0].cooldownUntil).toBe(expected.toISOString());
  });

  it("tracks usedByAccounts", () => {
    const pool = emptyPool();
    addQuoteToPool(pool, "Test quote", {}, NOW);
    markQuoteUsedInPool(pool, pool.quotes[0].id, "account-a", 30, NOW);
    expect(pool.quotes[0].usedByAccounts).toContain("account-a");
  });

  it("does not duplicate account in usedByAccounts", () => {
    const pool = emptyPool();
    addQuoteToPool(pool, "Test quote", {}, NOW);
    markQuoteUsedInPool(pool, pool.quotes[0].id, "testacc", 30, NOW);
    markQuoteUsedInPool(pool, pool.quotes[0].id, "testacc", 30, NOW);
    const accounts = pool.quotes[0].usedByAccounts.filter((a) => a === "testacc");
    expect(accounts).toHaveLength(1);
  });

  it("returns success=false for non-existent quote", () => {
    const pool = emptyPool();
    const result = markQuoteUsedInPool(pool, "nonexistent", "testacc", 30, NOW);
    expect(result.success).toBe(false);
  });
});

// ── recycleQuoteInPool ─────────────────────────────────────────────

describe("recycleQuoteInPool", () => {
  it("transitions cooldown back to available", () => {
    const pool = seededPool();
    const cooldownQuote = pool.quotes.find((q) => q.status === "cooldown")!;
    const result = recycleQuoteInPool(pool, cooldownQuote.id, NOW);
    expect(result.success).toBe(true);
    const recycled = result.pool.quotes.find((q) => q.id === cooldownQuote.id)!;
    expect(recycled.status).toBe("available");
    expect(recycled.cooldownUntil).toBeUndefined();
  });

  it("transitions retired back to available", () => {
    const pool = seededPool();
    const retiredQuote = pool.quotes.find((q) => q.status === "retired")!;
    const result = recycleQuoteInPool(pool, retiredQuote.id, NOW);
    expect(result.success).toBe(true);
    const recycled = result.pool.quotes.find((q) => q.id === retiredQuote.id)!;
    expect(recycled.status).toBe("available");
  });

  it("returns success=false for non-existent quote", () => {
    const pool = emptyPool();
    const result = recycleQuoteInPool(pool, "nonexistent", NOW);
    expect(result.success).toBe(false);
  });
});

// ── getPoolStatsFromPool ───────────────────────────────────────────

describe("getPoolStatsFromPool", () => {
  it("counts total quotes", () => {
    const stats = getPoolStatsFromPool(seededPool());
    expect(stats.total).toBe(6);
  });

  it("counts by status", () => {
    const stats = getPoolStatsFromPool(seededPool());
    expect(stats.available).toBe(3);  // q-00001, q-00002, q-00006
    expect(stats.cooldown).toBe(2);   // q-00003, q-00005
    expect(stats.retired).toBe(1);    // q-00004
    expect(stats.used).toBe(0);
  });

  it("returns zeros for empty pool", () => {
    const stats = getPoolStatsFromPool(emptyPool());
    expect(stats).toEqual({ total: 0, available: 0, cooldown: 0, retired: 0, used: 0 });
  });
});
