# Spec: Phase 3 — Multi-Account Solidification & Workflow Improvements

Date: 2026-07-10
Status: 🟢 In Progress — core features shipped, calendar deferred

---

## Problem Statement

The quotes-social-media platform was built as a single-account quote-image generator. As usage scales to multiple Instagram accounts, users need:

1. **Account sandboxing** — quotes, templates, and generation scoped per-account with zero cross-contamination
2. **Favorites + filtering** — ability to mark and filter quotes and templates as favorites
3. **Better generation controls** — count selection and "generate all combos" mode
4. **Queue visibility** — preview queue entries with full image, caption, and schedule
5. **Workflow polish** — search, progress feedback, and reusable UI components

The codebase had grown to 2,600+ lines in a single page component with heavy copy-paste. It needed structural refactoring to remain maintainable.

## Solution

Sandbox every data domain (quotes, templates, manifests, queues) per account with three-way scope filters. Add generate count controls and queue preview. Extract 11 shared UI primitives into a component library to eliminate duplication.

## User Stories

### Account Sandboxing
1. As a content manager, I want quotes sandboxed per account, so that my motivation account doesn't pull quotes from my humor account
2. As a content manager, I want each account to have its own quote pool at `accounts/<id>/output/quotes.json`, completely isolated
3. As a content manager, I want selecting "All accounts" in the quotes tab to show a prompt to pick an account, not a mixed global pool
4. As a content manager, I want switching accounts to auto-refetch quotes, templates, queue, and review data

### Quotes — Three-Way Filter & Favorites
5. As a content manager, I want an "All" / "Account" / "Favorites" three-way filter in the quotes tab, matching the templates tab pattern
6. As a content manager, I want to star/unstar quotes (☆/★), storing favorites per account
7. As a content manager, I want to see a count badge on the Favorites tab showing how many quotes are favorited
8. As a content manager, I want to add new quotes scoped to the currently selected account
9. As a content manager, I want to delete quotes from the selected account's pool

### Templates — Three-Way Filter
10. As a content manager, I want an "All" / "Account" / "Favorites" three-way filter in the templates tab
11. As a content manager, I want "All" to show only global templates, "Account" to show account templates + favorites, "Favorites" to show only favorited
12. As a content manager, I want the templates API to return BOTH global and account templates with a `source` field for filtering
13. As a content manager, I want "All accounts" mode to show only the "All" filter (global templates)

### Generate Controls
14. As a content manager, I want a number input (1-10) to control how many images to generate, replacing the hardcoded 10
15. As a content manager, I want an "All images" checkbox that generates the full Cartesian product (n quotes × m templates) for the account
16. As a content manager, I want the generate button to show "Generate 5 Images" or "Generate All Images" depending on the checkbox state
17. As a content manager, I want a progress bar with real-time polling showing "Generating 3/10 — quote text..." during generation

### Queue Preview
18. As a content manager, I want to click any queue entry to open a preview modal showing the full image, complete caption, all hashtags, status badge, and schedule
19. As a content manager, I want to remove items from the queue directly from the preview modal
20. As a content manager, I want queue entry cards to show a pointer cursor and hover shadow to indicate they are clickable

### Account Management
21. As a content manager, I want to create accounts via a modal dialog with Identity fields (Account ID, Display Name) and Instagram API fields (IG User ID, Access Token, Page ID)
22. As a content manager, I want to edit account settings including cooldown days, publish schedule, and Instagram auth
23. As a content manager, I want the Account ID field to be required in the creation modal

### Workflow Polish
24. As a content manager, I want to search quotes by text in real-time from the quotes tab
25. As a content manager, I want reusable, tested UI components instead of copy-pasted patterns
26. As a content manager, I want three-way scope filters to use consistent pill-button styling across quotes, templates, and review tabs

### Architecture & Maintainability
27. As a developer, I want 11 shared UI primitives extracted into `src/components/ui/` (Modal, FilterBar, StatusBadge, EmptyState, LoadingState, Banner, TabBar)
28. As a developer, I want modals extracted as components (ImagePreviewModal, QueuePreviewModal, CreateAccountModal, EditAccountModal)
29. As a developer, I want the page size reduced from 2,668 lines to ~2,200 lines through component extraction
30. As a developer, I want FilterBar to be generic over key types so TypeScript enforces correct state-setter matching

## Implementation Decisions

### Account Sandboxing
- All quote, template, manifest, and queue data is stored under `accounts/<id>/output/` with per-account JSON files
- Global pools (`output/quote-pool.json`) exist only as legacy fallback; "All accounts" mode shows a prompt, not global data
- Quote pool library (`quote-pool.ts`) adds optional `accountId?: string` parameter to all CRUD functions
- A `useEffect` watches `selectedAccount` changes and re-fetches data for the active view mode

### Three-Way Filter Architecture
- The templates API (`GET /api/templates?account=xxx`) now returns BOTH global and account templates with a `source: "global" | "account"` field
- The frontend filters client-side: All → `source === "global"`, Account → `source === "account" || isFavorite`, Favorites → `isFavorite`
- The quotes API adds a `status=favorites` filter on the server
- Quote favoriting uses an `isFavorite?: boolean` field on each quote entry in the pool JSON
- Template favoriting copies files to `accounts/<id>/favorites/`

### Generate Controls
- The API route `POST /api/generate` accepts `count: number` and `all: boolean`
- When `all: true`, `pickCombinations()` generates the full Cartesian product of quotes × templates
- Progress is tracked via a temp file (`.generation-progress.json`) in the account's output directory, polled every 500ms by the frontend
- The progress file is cleaned up after generation completes or fails

### Queue Preview
- Queue entry cards have `onClick` handlers that set `queuePreview` state
- Remove button uses `e.stopPropagation()` to prevent triggering the preview
- The modal shows: image, quote, full caption with all hashtags, status badge, schedule/publish date, error message if failed

### Component Architecture
```
src/components/
├── ui/               # Zero-domain primitives
│   ├── Modal.tsx     # Generic overlay → 4 inline modal patterns eliminated
│   ├── FilterBar.tsx # Generic<K> pill-button bar → 3 inline filter patterns eliminated
│   ├── StatusBadge.tsx
│   ├── EmptyState.tsx, LoadingState.tsx
│   ├── Banner.tsx    # Dismissible success/error/warning
│   └── TabBar.tsx
├── preview/          # Modal components using shared Modal
│   ├── ImagePreviewModal.tsx
│   └── QueuePreviewModal.tsx
└── accounts/
    ├── CreateAccountModal.tsx
    └── EditAccountModal.tsx
```

### QuoteEntry Type Addition
```typescript
export interface QuoteEntry {
  // ...existing fields...
  isFavorite?: boolean;
  // ...existing fields...
}
```

### API Contracts
- `POST /api/quotes` — accepts `action: "favorite" | "unfavorite"` with `quoteId` and `account`
- `POST /api/generate` — accepts `count: number` and `all: boolean`
- `GET /api/generate?account=xxx` — returns progress: `{ total, completed, current }`
- `GET /api/templates?account=xxx` — now returns templates with `source: "global" | "account"`

## Testing Decisions

### What Makes a Good Test
- Test external behavior: API responses, state transitions, filter logic
- Do NOT test implementation details: React state internals, CSS classes
- Prefer integration tests at the API route level over unit tests

### Modules to Test
1. **Quote pool isolation** — adding a quote to account A doesn't appear in account B
2. **Three-way filter logic** — client-side filtering correctly separates global/account/favorite
3. **Generate count limits** — count=1 produces 1 image, all=true produces n×m images
4. **Progress file lifecycle** — file exists during generation, cleaned up after
5. **Modal rendering** — components render without errors when props are provided

### Prior Art
- Playwright smoke test at `playwright/scripts/smoke-test.ts` (existing pattern)
- Playwright utilities at `playwright/utils/` (navigation, review, templates, image-assert)

## Out of Scope

- **Calendar tab** (weekly unified view) — parked for later
- **Undo for approve/reject** — not implemented yet
- **Confirmation dialogs** for destructive actions — not implemented yet
- **Instagram live publishing** — Meta anti-spam restriction still blocks new accounts; local simulation only
- **Drag-and-drop queue reorder** — deferred
- **Caption editing in preview modal** — not implemented
- **Batch-specific view in review tab** — exists but not redesigned
- **Pagination for large image sets** — deferred pending design exploration

## Further Notes

- The codebase now has 11 component files (770 lines) extracted from a single 2,668-line page. The page is now ~2,200 lines.
- All three-way filters (quotes, templates) are backed by the API, not purely client-side, so they remain consistent on refresh
- The `FilterBar` component uses TypeScript generics (`<K extends string>`) so the state setter type is enforced at compile time
- The progress polling approach (temp file + setInterval) was chosen over Server-Sent Events for simplicity with Next.js 14 API routes
