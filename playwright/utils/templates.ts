/**
 * Templates tab helpers — favorite, unfavorite, filter.
 */

/**
 * Favorite (star) a template by its index in the grid.
 *
 * @param page - Playwright page object
 * @param templateIndex - 0-based index in the templates grid
 */
export async function favoriteTemplate(page: any, templateIndex: number): Promise<void> {
  const cards = await page.$$('[class*="rounded-xl"][class*="border"]');
  if (templateIndex >= cards.length) {
    console.warn(`Template card ${templateIndex} not found`);
    return;
  }

  const card = cards[templateIndex];
  const buttons = await card.$$("button");
  for (const btn of buttons) {
    const text = await btn.textContent();
    if (text === "☆" || text === "★") {
      await btn.click();
      await page.waitForTimeout(500);
      return;
    }
  }
  console.warn(`Star button not found on template ${templateIndex}`);
}

/**
 * Check if a template is favorited by its index.
 */
export async function isFavorited(page: any, templateIndex: number): Promise<boolean> {
  return await page.evaluate((idx: number) => {
    const cards = document.querySelectorAll('[class*="rounded-xl"][class*="border"]');
    if (idx >= cards.length) return false;
    const btn = cards[idx].querySelector("button");
    return btn?.textContent === "★";
  }, templateIndex);
}

/**
 * Switch the template filter between "All" and "Favorites".
 */
export async function setTemplateFilter(page: any, filter: "all" | "favorites"): Promise<void> {
  const buttons = await page.$$("button");
  for (const btn of buttons) {
    const text = await btn.textContent();
    if (text && text.toLowerCase().startsWith(filter)) {
      await btn.click();
      await page.waitForTimeout(300);
      return;
    }
  }
  console.warn(`Template filter "${filter}" not found`);
}
