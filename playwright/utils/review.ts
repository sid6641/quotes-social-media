/**
 * Review tab helpers — caption pick, approve/reject, bulk actions.
 *
 * These functions interact with the image cards in the Review tab.
 * They work in both single-batch and cross-batch ("All iterations") mode.
 */

export interface ImageLocator {
  /** Index of the image card in the grid (0-based) */
  imageIndex: number;
}

export interface CaptionPickOptions extends ImageLocator {
  /** Caption option index 0-4 */
  optionIndex: number;
}

/**
 * Pick a caption option for a specific image by index.
 *
 * @param page - Playwright page object
 * @param opts - { imageIndex: 0-based, optionIndex: 0-4 }
 */
export async function pickCaption(page: any, opts: CaptionPickOptions): Promise<void> {
  const { imageIndex, optionIndex } = opts;
  const btnNumber = optionIndex + 1;

  // Find the image card by index and click its numbered caption button
  const cards = await page.$$('[class*="rounded-xl"][class*="border"]');
  if (imageIndex >= cards.length) {
    console.warn(`Image card ${imageIndex} not found (only ${cards.length} visible)`);
    return;
  }

  const card = cards[imageIndex];
  const buttons = await card.$$("button");
  for (const btn of buttons) {
    const text = await btn.textContent();
    if (text && text.trim() === String(btnNumber)) {
      await btn.click();
      await page.waitForTimeout(300);
      return;
    }
  }
  console.warn(`Caption button ${btnNumber} not found on image ${imageIndex}`);
}

/**
 * Approve a specific image by index.
 *
 * @param page - Playwright page object
 * @param opts - { imageIndex: 0-based }
 */
export async function approveImage(page: any, opts: ImageLocator): Promise<void> {
  const { imageIndex } = opts;

  const cards = await page.$$('[class*="rounded-xl"][class*="border"]');
  if (imageIndex >= cards.length) {
    console.warn(`Image card ${imageIndex} not found`);
    return;
  }

  const card = cards[imageIndex];
  const buttons = await card.$$("button");
  for (const btn of buttons) {
    const text = await btn.textContent();
    if (text && text.includes("Approve") && !text.includes("Approved")) {
      await btn.click();
      await page.waitForTimeout(500);
      return;
    }
  }
  console.warn(`Approve button not found on image ${imageIndex}`);
}

/**
 * Reject a specific image by index.
 */
export async function rejectImage(page: any, opts: ImageLocator): Promise<void> {
  const { imageIndex } = opts;

  const cards = await page.$$('[class*="rounded-xl"][class*="border"]');
  if (imageIndex >= cards.length) {
    console.warn(`Image card ${imageIndex} not found`);
    return;
  }

  const card = cards[imageIndex];
  const buttons = await card.$$("button");
  for (const btn of buttons) {
    const text = await btn.textContent();
    if (text && text.includes("Reject") && !text.includes("Rejected")) {
      await btn.click();
      await page.waitForTimeout(500);
      return;
    }
  }
  console.warn(`Reject button not found on image ${imageIndex}`);
}

/**
 * Select image checkboxes by their indices.
 *
 * @param page - Playwright page object
 * @param indices - Array of 0-based image indices to select
 */
export async function selectImages(page: any, indices: number[]): Promise<void> {
  const cards = await page.$$('[class*="rounded-xl"][class*="border"]');
  for (const idx of indices) {
    if (idx >= cards.length) continue;
    const checkbox = await cards[idx].$('input[type="checkbox"]');
    if (checkbox) {
      await checkbox.click();
      await page.waitForTimeout(100);
    }
  }
}

/**
 * Click the bulk Approve button in the floating action bar.
 * Select images first with selectImages().
 */
export async function bulkApprove(page: any): Promise<void> {
  const buttons = await page.$$("button");
  for (const btn of buttons) {
    const text = await btn.textContent();
    if (text && text.includes("✅ Approve")) {
      await btn.click();
      await page.waitForTimeout(1000);
      return;
    }
  }
  console.warn("Bulk Approve button not found — select images first");
}

/**
 * Click the bulk Reject button in the floating action bar.
 */
export async function bulkReject(page: any): Promise<void> {
  const buttons = await page.$$("button");
  for (const btn of buttons) {
    const text = await btn.textContent();
    if (text && text.includes("❌ Reject")) {
      await btn.click();
      await page.waitForTimeout(1000);
      return;
    }
  }
  console.warn("Bulk Reject button not found — select images first");
}

/**
 * Click the "Reject remaining" button to reject all still-pending images.
 */
export async function rejectRemaining(page: any): Promise<void> {
  const buttons = await page.$$("button");
  for (const btn of buttons) {
    const text = await btn.textContent();
    if (text && text.includes("Reject remaining")) {
      await btn.click();
      await page.waitForTimeout(2000);
      return;
    }
  }
  console.warn("Reject remaining button not found — no pending images?");
}
