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

### Per-batch pagination

- Each page = one batch (max 10 images). Pagination is via "← Prev" / "Next →" buttons.
- "1 / 4" label shows current position. Disabled buttons at boundaries.
- Batch header shows: "Batch {id} · {date} · {trigger} | {N} images"
- **Gotcha**: Switching accounts causes a full data reload. Wait 2-3s.

### Filter bar (simplified)

- Only two filters: **Unreviewed (N)** and **All (N)**.
- Default is Unreviewed — shows only images with `status==="pending"` and `reviewed!==true`.
- Clicking a filter resets selection state.

### Mark batch as reviewed

- "👁️ Mark batch as reviewed" button appears when Unreviewed filter is active and there are unreviewed images.
- Sets `reviewed: true` on all images in the current batch (does NOT approve them).
- Re-fetches the batch after API call.

### Reject remaining button

- "🗑️ Reject remaining" button appears in the batch header when there are pending images.
- Rejects all non-approved images in the **current batch only** (batch-scoped).
- Sends `POST /api/batch-status` with the current batch's ID.
- Button disappears once all images are approved or rejected.

### Caption options

- Caption option buttons are numbered 1-5 inside each image card.
- Each button contains a `<span>` with just the number text.

**Gotcha**: The buttons may appear disabled until the page fully loads. Wait for them to be enabled.

**Best approach**: Find by the parent button containing the number span:

```typescript
const btn = page.locator('button').filter({ hasText: /^1$/ }).first();
```

But this can match filter buttons like "All (10)" or "Unreviewed (0)" because they contain "1" and "0".

**Reliable approach**: Scope to the image grid container first, then find numbered buttons.

### Approve/Reject individual

- Each image card has "Approve" and "Reject" buttons in its footer.
- These buttons appear after the caption options section.
- Use `page.locator('button').filter({ hasText: 'Approve' }).first()` to find the first approve button.
- **Important**: After approve/reject, the batch is re-fetched from the server. The page may briefly show "Loading...".

### Bulk approve/reject

- Click the checkbox on image cards to select them.
- A floating action bar appears with "✅ Approve (N)" and "❌ Reject (N)" buttons.
- **Gotcha**: The floating bar is `position: sticky`, so it may overlap other elements. Scroll it into view first.

### Select all

- The "Select all" checkbox is in the filter bar.
- It selects all **visible** images (filtered by current filter).
- Click the label text "Select all" instead of the checkbox itself for reliability.

## Queue Tab

### Account scoping

- Queue files are account-scoped: `accounts/<id>/output/publish-queue.json`.
- With "All accounts" selected, the queue tab shows a hint: *"Select an account from the dropdown above..."*
- **Must** select a specific account to see queue entries.

## Page Stability

- Playwright's `page.evaluate()` can fail with `ReferenceError: document is not defined` if the page navigates between calls.
- After any navigation (tab switch, account change), always wait with `page.waitForTimeout(2000-3000)`.
- The page may briefly show "Loading manifest..." between fetches — wait for the filter bar to appear before interacting.

## Templates Tab

### Favorites

- ⭐ star button is visible on each template tile when an account is selected.
- Toggling the star sends `POST /api/templates/:filename/favorite`.

## General Gotchas

### Element references

- VS Code browser tool refs (e.g., `e58`) **change on every page load**. Never hardcode refs.
- Always use semantic selectors: `button:has-text("Approve")`, `select`, `img[alt*="Quote"]`.

### Page load timing

- After selecting an account, wait **1.5-2 seconds** for the API calls to complete.
- A 404 for `/api/manifest` (no params) is normal when viewing an account — the global manifest doesn't exist.

### Console errors

- 404 errors for `/api/images/*.png` are expected when the image doesn't exist in the current view scope.

### API patterns that work

| Endpoint | Method | Body | Works with account? |
| --------- | ------ | ---- | ------------------- |
| `/api/status` | POST | `{ batchId, imageId, status, account? }` | Yes |
| `/api/batch-status` | POST | `{ batchId, imageIds[], status, account? }` | Yes |
| `/api/review` | POST | `{ images[{batchId, imageId}], account? }` | Yes |
| `/api/manifest` | GET | `?batchId=xxx&account=yyy` | Yes |
| `/api/queue` | GET | `?account=yyy` | Yes |
| `/api/export` | POST | `{ days: 7, account: "yyy" }` | Yes |

## Historical Notes

### Caption pick not syncing to queue (2026-07-10)

Picking a caption option (`POST /api/caption`) only updates the manifest — it does NOT update the
queue entry's caption. If the queue entry was created before the caption was picked, the queue
still has the auto-selected caption. Fixed by: (not yet fixed, workaround: pick caption before approving).
