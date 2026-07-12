# Playwright — Quotes Social Media

A library of reusable Playwright utilities and patterns for interacting with the
Quotes Social Media review UI. These are designed to be run with the VS Code
browser tools or with `npx playwright test`.

## Setup

Playwright is not a project dependency — use the VS Code integrated browser or
install it globally:

```bash
npx playwright install chromium
```

## File Structure

```
playwright/
  README.md              ← This file
  learnings.md           ← Patterns, gotchas, what works
  utils/
    navigation.ts        ← Account selection, tab switching
    review.ts            ← Caption pick, approve/reject, bulk actions
    templates.ts         ← Template favorite/unfavorite
    image-assert.ts      ← Checking image state assertions
  scripts/
    smoke-test.ts        ← Quick smoke test of all core flows
```

## Core Workflows

### 1. Daily Batch — Generate → Review → Queue

```typescript
import { selectAccount } from "../utils/navigation";
import { approveImage, rejectImage, rejectRemaining } from "../utils/review";

// Select account
await selectAccount(page, "temp2");

// Paginate through batches, approve good ones
// Each page = 1 batch (max 10 images)
// "← Prev" / "Next →" to navigate batches
await approveImage(page);    // approve first pending image
await rejectRemaining(page); // reject rest of batch

// Switch to Queue tab to see queued items
await page.getByRole("button", { name: "Queue" }).click();
```

### 2. Mark Batch as Reviewed

```typescript
// Switch to Unreviewed filter (default), then mark page as seen
await page.getByRole("button", { name: /👁️/ }).click();
```

### 3. Export Calendar

```typescript
// From the Review tab with approved images
await page.getByRole("button", { name: /📅/ }).click();
```

## Core Patterns

### Selecting an account

```typescript
import { selectAccount } from "../utils/navigation";

await selectAccount(page, "sid");
```

### Clicking a caption option

```typescript
import { pickCaption } from "../utils/review";

// Click the first image's caption option 1
await pickCaption(page, { imageIndex: 0, optionIndex: 0 });
```

## Gotchas

- Queue is **account-scoped** — select a specific account before checking the Queue tab.
- After any navigation (tab switch, account change), wait 2-3 seconds for data to load.
- `page.evaluate()` can fail with `ReferenceError: document is not defined` if the page navigates between calls — scope operations within a single `evaluate` when possible.
- The Reject remaining button is batch-scoped (current batch only) and disappears once all images are approved/rejected.

### Approving an image

```typescript
import { approveImage } from "../utils/review";

// Approve the first pending image
await approveImage(page, { imageIndex: 0 });
```

### Bulk approve selected images

```typescript
import { selectImages, bulkApprove } from "../utils/review";

// Select first 3 images and approve them
await selectImages(page, [0, 1, 2]);
await bulkApprove(page);
```

## Running Smoke Tests

```bash
npx tsx playwright/scripts/smoke-test.ts
```
