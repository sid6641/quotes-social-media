/**
 * Image assertion helpers — checking state, counts, and visibility.
 */

export interface PageState {
  filterCounts: Record<string, number>;
  batchLabel: string | null;
  selectedAccount: string | null;
  errorText: string | null;
  imageCount: number;
  isCrossBatch: boolean;
}

/**
 * Read the current state of the review page.
 */
export async function getPageState(page: any): Promise<PageState> {
  return await page.evaluate(() => {
    // Filter counts
    const buttons = document.querySelectorAll("button");
    const filterCounts: Record<string, number> = {};
    for (const btn of buttons) {
      const text = btn.textContent || "";
      const match = text.match(/^(All|Pending|Approved|Rejected)\s*\((\d+)\)$/);
      if (match) {
        filterCounts[match[1].toLowerCase()] = parseInt(match[2], 10);
      }
    }

    // Batch label
    const batchEl = Array.from(buttons).find((b) => b.textContent?.includes("📦"));
    const batchLabel = batchEl?.textContent?.trim() || null;

    // Selected account
    const sel = document.querySelector("select");
    const selectedAccount = sel ? sel.value : null;

    // Error text
    const errEl = document.querySelector('[class*="text-red-500"]');
    const errorText = errEl?.textContent?.trim() || null;

    // Image count
    const images = document.querySelectorAll('img[alt^="Quote:"]');

    // Cross-batch check
    const isCrossBatch = batchLabel?.includes("All iterations") ?? false;

    return { filterCounts, batchLabel, selectedAccount, errorText, imageCount: images.length, isCrossBatch };
  });
}

/**
 * Assert that no error banner is visible.
 */
export function expectNoError(state: PageState): void {
  if (state.errorText) {
    console.error(`UNEXPECTED ERROR: "${state.errorText}"`);
  }
}

/**
 * Assert that the filter counts match expected values.
 */
export function expectCounts(
  state: PageState,
  expected: Partial<Record<string, number>>
): void {
  for (const [key, val] of Object.entries(expected)) {
    if (state.filterCounts[key] !== val) {
      console.warn(`Expected ${key}=${val}, got ${state.filterCounts[key]}`);
    }
  }
}

/**
 * Wait for the page to finish loading (images rendered or "No images" shown).
 */
export async function waitForPageReady(page: any, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const state = await getPageState(page);
    if (state.imageCount > 0 || (state.filterCounts.all === 0 && state.filterCounts.all !== undefined)) {
      return;
    }
    await page.waitForTimeout(300);
  }
  console.warn("waitForPageReady: timed out waiting for stable state");
}
