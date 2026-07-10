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

## Core Patterns

### Selecting an account

```typescript
import { selectAccount } from "../utils/navigation";

// Via Playwright page object
await selectAccount(page, "sid");
```

### Clicking a caption option

```typescript
import { pickCaption } from "../utils/review";

// Click the first image's caption option 1
await pickCaption(page, { imageIndex: 0, optionIndex: 0 });
```

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
