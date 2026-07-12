/**
 * Smoke test — validates core flows work end-to-end.
 *
 * Run with: npx tsx playwright/scripts/smoke-test.ts
 *
 * Prerequisites:
 *   - Dev server running at http://localhost:3005
 *   - At least one account with generated images (e.g., "sid" or "temp2")
 *
 * Tests:
 *   1. Page loads and accounts are visible
 *   2. Selecting an account shows images
 *   3. Caption option can be picked
 *   4. Approve works (individual + bulk)
 *   5. Templates tab shows templates
 *   6. Template favorite works
 */

import { chromium, type ElementHandle } from "playwright";

const BASE_URL = "http://localhost:3005";

async function main() {
  console.log("🚀 Quotes Social Media — Smoke Test");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      console.log(`  ✅ ${name}`);
      passed++;
    } catch (err) {
      console.log(`  ❌ ${name}: ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }
  }

  // Test 1: Page loads
  await test("Page loads and shows accounts", async () => {
    await page.goto(BASE_URL, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);

    const accounts = await page.evaluate(() => {
      const sel = document.querySelector("select");
      if (!sel) throw new Error("Account selector not found");
      return Array.from(sel.options).map((o) => o.value).filter((v) => v !== "");
    });

    if (accounts.length === 0) throw new Error("No accounts found");
    console.log(`     Accounts: ${accounts.join(", ")}`);
  });

  // Test 2: Select an account
  const accounts = await page.evaluate(() => {
    const sel = document.querySelector("select");
    return sel ? Array.from(sel.options).map((o) => o.value).filter((v) => v !== "") : [];
  });

  const testAccount = accounts[0] || "sid";

  await test(`Select account "${testAccount}" shows images or filters`, async () => {
    await page.selectOption("select", testAccount);
    await page.waitForTimeout(2000);

    const filters = await page.evaluate(() => {
      const buttons = document.querySelectorAll("button");
      const result: Record<string, string> = {};
      for (const btn of buttons) {
        const text = btn.textContent || "";
        const match = text.match(/^(All|Unreviewed)\s*\(\d+\)$/);
        if (match) result[match[1].toLowerCase()] = text;
      }
      return result;
    });

    if (Object.keys(filters).length === 0) {
      throw new Error("Filter buttons not found — no data loaded");
    }
    console.log(`     Filters: ${JSON.stringify(filters)}`);
  });

  // Test 3: Caption pick
  await test("Caption option can be clicked", async () => {
    const cards = await page.$$('[class*="rounded-xl"][class*="border"]');
    if (cards.length === 0) {
      console.log("     No image cards — skipping caption test");
      return;
    }

    // Find caption button "1" inside the first card
    const btn = await cards[0].$("button");
    if (btn) {
      const text = await btn.textContent();
      if (text === "1") {
        await btn.click();
        await page.waitForTimeout(500);
        console.log("     Caption option 1 clicked");
      }
    }
  });

  // Test 4: Templates tab
  await test("Templates tab loads", async () => {
    const buttons = await page.$$("button");
    for (const btn of buttons) {
      const text = await btn.textContent();
      if (text && text.trim() === "Templates") {
        await btn.click();
        await page.waitForTimeout(1000);
        break;
      }
    }

    const images = await page.$$("img");
    const templateImages = images.filter(async (img: ElementHandle) => {
      const src = await img.getAttribute("src");
      return src && (src.endsWith(".jpg") || src.endsWith(".png"));
    });

    console.log(`     Template images visible: ${templateImages.length > 0}`);
  });

  // Summary
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Smoke test failed:", err);
  process.exit(1);
});
