# Playwright Learnings

Patterns, gotchas, and what works for browser automation on this app.

## Navigation

### Account selector
- The account `<select>` element is always visible at the top of the page.
- Use `page.selectOption('select', 'accountId')` to switch accounts.
- Wait **at least 1.5 seconds** after selecting for data to load (`await page.waitForTimeout(1500)`).
- The option value is the account **id** (e.g., `"sid"`, `"temp2"`), not the display name.

### Tab switching
- Tabs are `<button>` elements with text: "Review", "Queue", "Templates", etc.
- Use `page.getByRole('button', { name: 'Templates' }).click()` or find by text content.

## Review Tab

### Caption options
- Caption option buttons are numbered 1-5 inside each image card.
- Each button contains a `<span>` with just the number text.
- **Gotcha**: The buttons may appear disabled until the page fully loads. Wait for them to be enabled.
- **Best approach**: Find by the parent button containing the number span:
  ```typescript
  const btn = page.locator('button').filter({ hasText: /^1$/ }).first();
  ```
  But this can match filter buttons like "All (10)" or "Pending (10)" because they contain "1" and "0".
- **Reliable approach**: Scope to the image grid container first, then find numbered buttons.

### Approve/Reject individual
- Each image card has "Approve" and "Reject" buttons in its footer.
- These buttons appear after the caption options section.
- Use `page.locator('button').filter({ hasText: 'Approve' }).first()` to find the first approve button.

### Bulk approve/reject
- Click the checkbox on image cards to select them.
- A floating action bar appears with "✅ Approve (N)" and "❌ Reject (N)" buttons.
- **Gotcha**: The floating bar is `position: sticky`, so it may overlap other elements. Scroll it into view first.
- **Gotcha**: In "All iterations" (cross-batch) mode, `manifest` is null. The batch status API must receive an `account` parameter.

### Select all
- The "Select all" checkbox is in the filter bar.
- It only selects **pending** images, not already approved/rejected ones.
- Click the label text "Select all" instead of the checkbox itself for reliability.

### "Reject remaining" button
- Visible in the filter bar when there are pending images.
- Marks all still-pending images as rejected via individual `POST /api/status` calls.
- Then refreshes all data (`fetchLatestBatch`, `fetchAllImages`, `fetchAllBatchesList`).

## Templates Tab

### Favorites
- ⭐ star button is visible on each template tile when an account is selected.
- The star calls `POST /api/templates` with `{ action: "favorite" | "unfavorite", filename, account }`.
- Favorites are stored at `accounts/<id>/favorites/` directory.
- The "Favorites (N)" filter shows only favorited templates.

## General Gotchas

### Element references
- VS Code browser tool refs (e.g., `e58`) **change on every page load**. Never hardcode refs.
- Always use text-based selectors or Playwright locators instead.

### Page load timing
- After selecting an account, wait **1.5-2 seconds** for the API calls to complete.
- The page loads three API calls in parallel: `manifest`, `allImages`, `allBatches`.
- After approve/reject, the UI updates optimistically via `setAllImages` and `setManifest`.

### Cross-batch mode
- When viewing "All iterations" (`batchScope === "__all__"`), the UI reads from `allImages` state, not `manifest`.
- Individual approve/reject updates both `setManifest` and `setAllImages` for immediate UI feedback.
- Bulk status uses `POST /api/batch-status` with `account` parameter.

### Console errors
- 404 errors for `/api/images/*.png` are expected when the image doesn't exist in the current view scope.
- The image serving API checks account dir first, then global, then templates.

### API patterns that work
| Endpoint | Method | Body | Works with account? |
|----------|--------|------|-------------------|
| `/api/status` | POST | `{ batchId, imageId, status, account }` | ✅ Yes |
| `/api/caption` | POST | `{ batchId, imageId, selectedOption, account }` | ✅ Yes |
| `/api/batch-status` | POST | `{ batchId, imageIds, status, account }` | ✅ Yes |
| `/api/manifest?allImages=true` | GET | `?account=sid` | ✅ Yes |
| `/api/templates` | GET | `?account=sid` | ✅ Yes |
| `/api/generate` | POST | `{ account }` | ✅ Yes |
| `/api/queue` | POST | `{ action: "process", account }` | ✅ Yes |
