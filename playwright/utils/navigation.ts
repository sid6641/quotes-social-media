/**
 * Navigation helpers — account selection, tab switching.
 *
 * These functions accept a Playwright Page object and perform
 * common navigation actions within the Quotes Social Media UI.
 *
 * Usage (in VS Code browser eval):
 *   import { selectAccount, switchTab } from "../utils/navigation";
 *   await selectAccount(page, "sid");
 *   await switchTab(page, "Templates");
 */

/**
 * Select an account from the dropdown.
 * The account selector is a <select> element at the top of the page.
 * Waits for data to load after selection.
 *
 * @param page  - Playwright page object
 * @param accountId - Account ID to select (e.g., "sid", "temp2")
 */
export async function selectAccount(page: any, accountId: string): Promise<void> {
  await page.selectOption("select", accountId);
  // Wait for API calls to complete and UI to re-render
  await page.waitForTimeout(1500);
}

/**
 * Switch to a tab by its display name.
 * Tabs are buttons in the nav bar: Review, Queue, Templates, etc.
 *
 * @param page - Playwright page object
 * @param tabName - Display name of the tab (e.g., "Review", "Templates")
 */
export async function switchTab(page: any, tabName: string): Promise<void> {
  const buttons = await page.$$("button");
  for (const btn of buttons) {
    const text = await btn.textContent();
    if (text && text.trim() === tabName) {
      await btn.click();
      await page.waitForTimeout(500);
      return;
    }
  }
  console.warn(`Tab "${tabName}" not found`);
}

/**
 * Get the currently selected account ID from the dropdown.
 */
export async function getSelectedAccount(page: any): Promise<string | null> {
  return await page.evaluate(() => {
    const sel = document.querySelector("select");
    return sel ? sel.value : null;
  });
}

/**
 * Get all available account IDs from the dropdown.
 */
export async function getAvailableAccounts(page: any): Promise<string[]> {
  return await page.evaluate(() => {
    const sel = document.querySelector("select");
    if (!sel) return [];
    return Array.from(sel.options).map((o) => o.value).filter((v) => v !== "");
  });
}

/**
 * Read the current filter tab counts from the UI.
 * Returns { all, pending, approved, rejected } counts.
 */
export async function getFilterCounts(page: any): Promise<Record<string, number>> {
  return await page.evaluate(() => {
    const buttons = document.querySelectorAll("button");
    const counts: Record<string, number> = {};
    for (const btn of buttons) {
      const text = btn.textContent || "";
      const match = text.match(/^(All|Pending|Approved|Rejected)\s*\((\d+)\)$/);
      if (match) {
        counts[match[1].toLowerCase()] = parseInt(match[2], 10);
      }
    }
    return counts;
  });
}
