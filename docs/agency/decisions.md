# Decision Log

## 2026-07-10: Architecture — Decompose review page into tab components

### Context
The review page (`src/app/page.tsx`) grew to 2,297 lines with 47 useState hooks, 31 functions, and 6 tab views rendered inline. Testing any view required mounting the entire page.

### Decision
- Split into 6 self-contained tab components under `src/components/tabs/`
- Each tab receives `selectedAccount: string` + optional callbacks
- Shell handles: account selector, tab routing, generation actions, error banner, shared modals
- Shared types extracted to `src/components/tabs/types.ts`
- Each tab independently fetches its own data

### Rationale
- Locality: each tab's state and logic isolated to its component
- Testability: each tab testable in isolation with mocked fetch
- Interface shrinks: each tab exposes ~3 props instead of 47 state variables
- Deletion test: delete one tab component, others unaffected

### Decided By
Director (architecture review)

### Reopens?
No

## 2026-07-11: Review — Per-batch pagination instead of cross-batch view

### Context
The review tab had a complex cross-batch "all images" mode that merged images from all batches into one view, with intra-batch pagination (10 per page). This required maintaining `allImages` state, `batchScope` toggle, `batchSelectorOpen` dropdown, `switchBatch()` function, and `isCrossBatch` computations — 7 extra state variables.

### Decision
- Paginate by batch: one page = one batch
- Each batch is max 10 images (fixed by generation), so per-batch pagination naturally replaces intra-batch pagination
- Removed: `allImages`, `batchScope`, `batchSelectorOpen`, `switchBatch()`, `fetchAllImages`, `fetchAllBatchesList`, `isCrossBatch`
- Pagination: fetch `?all=true` for list, then `?batchId=xxx` for individual batch
- Batch header shows ID, date, trigger, image count

### Rationale
- Simpler state: 7 fewer state variables, no cross-batch merge logic
- Naturally matches user mental model (review one batch at a time)
- Each batch is small (≤10 images), so one page is never overwhelming
- Batch selector dropdown no longer needed — pagination prev/next replaces it

### Decided By
Captain + Director

### Reopens?
No

## 2026-07-11: Generation — Remove global quotes/ directory fallback

### Context
`loadQuotes()` in mixer.ts fell back to the project root `quotes/` directory when the account's quote pool was empty. This was a legacy behavior from before the account-isolation migration.

### Decision
- Remove the global `quotes/` fallback entirely
- Each account must have its own quotes seeded via the pool or `accounts/<id>/quotes/` text files
- If pool is empty and no text files found, throw a clear error with CLI instructions

### Rationale
- Account isolation: an account shouldn't accidentally pull quotes meant for another account
- Clearer failure mode: you get an actionable error message instead of silently falling back

### Decided By
Captain + Director

### Reopens?
No

## 2026-07-11: Status changes — Always re-fetch batch from server

### Context
`handleStatusChange` (individual approve/reject) was doing an optimistic local `setManifest` update without re-fetching from the server. If the user then clicked "Reject remaining", it used stale local state that might not match the server — potentially including an already-approved image in the reject list.

### Decision
- After every approve/reject API call, re-fetch the batch manifest from the server
- This ensures local state is always in sync with what's on disk
- Consistent with how `handleRejectRemaining` and `handleMarkBatchReviewed` already work

### Rationale
- Optimistic updates are fine for immediate UX feedback, but subsequent operations need ground truth
- Server is the source of truth for status; local state is a cache

### Decided By
Director

### Reopens?
No

## 2026-07-12: Testing — Pure function extraction for store-backed modules

### Context
Four modules (mixer, quote-pool, manifest, queue) had business logic interleaved
with filesystem I/O via `JsonStore<T>`. Tests couldn't call the exported functions
without hitting the filesystem.

### Decision
- Extract pure versions of all business-logic functions that operate on plain
data structures (arrays of quotes, manifests, queue entries)
- Pure functions accept explicit `now: Date` parameters for deterministic
time-dependent testing
- Public store-backed functions delegate to pure functions + read/write store
- Tests call pure functions only — no filesystem, no mocking

### Rationale
- No test infrastructure needed (no temp dirs, no fixture files)
- Tests run in 300ms (no I/O)
- Pure functions are independently verifiable — the combinatorial logic,
lifecycle transitions, and scheduling math are the risky parts
- The store read/write is trivial (delegates to JsonStore) — not worth testing

### Decided By
Captain + Director (TDD skill)

### Reopens?
No

## 2026-07-12: API — Queue endpoints must be account-scoped

### Context
DELETE /api/queue and POST /api/queue { action: 'process' } both ignored the
account parameter. The QueueTab UI sent requests without account context.
This meant:
- The ✕ remove button only deleted from the global queue (which is empty)
- 'Publish Due Items Now' only processed the global queue

### Decision
- DELETE /api/queue accepts optional `account` param → passes to removeFromQueue
- POST /api/queue { action: 'process' } accepts optional `account` param → passes to processQueue
- QueueTab sends `account` on both DELETE and process requests
- QueueTab shows 'select an account' hint immediately when no account is selected

### Rationale
- Queue files are account-scoped (accounts/<id>/output/publish-queue.json)
- There is no global queue — all operations must target a specific account

### Decided By
Director

### Reopens?
No

## 2026-07-12: Scheduling — Use UTC for publish time calculation

### Context
`getNextScheduledTime` used `setHours(hour, minute, 0, 0)` which operates in
local time. `toISOString()` outputs UTC. Tests failed in non-UTC timezones
because the expected UTC string didn't match the local-time-derived value.

### Decision
- `getNextScheduledTimeFrom` builds the target date using `Date.UTC()`
- All comparisons and outputs are in UTC
- PUBLISH_TIME env var is interpreted as UTC

### Rationale
- Server timezone may differ from user's timezone
- All stored ISO strings are UTC
- Schedule comparison in getDueItems uses UTC timestamps

### Decided By
Director (TDD test failure drove the fix)

### Reopens?
No

### Context
Five modules (manifest, queue, quote-pool, account, hashtag-bank) each implemented the same file-I/O + JSON-cache pattern independently: `readX()`, `writeX()`, `invalidateCache()`, `ensureDir()`.

### Decision
- Extract `JsonStore<T>` interface with `get()`, `set(data)`, `invalidate()`
- `createFileStore<T>(path, default)` — file-backed adapter for production
- `createMemoryStore<T>(default)` — in-memory adapter for tests
- All 5 modules delegate to JsonStore via local factory functions
- Account-scoped modules use `Map<string, JsonStore<T>>` for lazy per-account store creation

### Rationale
- Locality: filesystem error handling and JSON parsing in one place
- Leverage: one interface, 5 domain modules, 2 adapters (file + memory)
- Testability: swap in memoryStore — no temp directories needed
- Deletion test: delete the file adapter, in-memory adapter still works

### Decided By
Director (architecture review)

### Reopens?
No

## 2026-07-10: Architecture — Deepen generation module + fix dependency direction

### Context
Architecture review revealed two related issues: (1) CLI and API route each duplicated the same ~150-line generation pipeline, (2) `src/lib/scheduler.ts` imported from `../cli/generate` — lib code depending on CLI code.

### Decision
- Extract `runGenerate` into `src/lib/generate.ts` as the single deep module
- CLI (`src/cli/generate.ts`) and API route (`src/app/api/generate/route.ts`) become thin adapters
- `scheduler.ts` imports from `./generate` (same lib layer)
- Progress reporting uses an `onProgress` callback instead of hardcoded print/write logic
- `trigger` field (cli vs web) configurable via `GenerateOptions`

### Rationale
- Locality: generation bugs, error handling, and pipeline logic concentrate in one module
- Leverage: one interface tested once, exercised via CLI, API, and scheduler
- Dependency discipline: lib never imports from cli/ or app/
- Deletion test: delete cli/generate.ts, generation still works via API and scheduler

### Decided By
Director (architecture review)

### Reopens?
No — this is a structural improvement that doesn't change behavior.

## 2026-07-07: Project Structure — Simple folder layout

### Context
Client wants a straightforward, no-overhead project structure.

### Decision
- `templates/` folder for Instagram-style image templates
- `quotes/` folder for quote source (text file)
- Source code in `src/`
- No database in MVP — file-based storage

### Decided By
Client (intake interview)

### Reopens?
No — can evolve but this is the starting point.

## 2026-07-07: Quote Generation — Gemini API

### Context
Quotes need an AI source for generation.

### Decision
Use Gemini API (Gemini 2.5 Flash model) to generate quotes.

### Decided By
Client

### Reopens?
Yes — model choice can change based on cost/quality needs.

## 2026-07-07: Review UI — Core feature

### Context
Client emphasized the review step is the main feature.

### Decision
Build a web endpoint in Next.js to preview generated quote images before publishing. Review is the primary interaction point.

### Decided By
Client

### Reopens?
No — this is a core requirement.

## 2026-07-07: Output cadence — 10 images/day

### Context
Client wants daily automated Instagram posting at scale.

### Decision
Pipeline generates ~10 images per day in batch. Output is Instagram-ready (1080x1080 or appropriate IG dimensions).

### Decided By
Client (grill session)

### Reopens?
Yes — volume can be adjusted later.

## 2026-07-07: Generation trigger — CLI + Web

### Context
Client wants both options for triggering quote-image generation.

### Decision
- CLI command (`npm run generate`) for batch generation
- Web button on the review page for on-demand generation

### Decided By
Client (grill session)

### Reopens?
No

## 2026-07-07: Image format & template approach

### Context
Client wants Instagram-optimized output.

### Decision
- Standard Instagram post format: 1080x1080px square
- Templates are background images with text overlay rendered via Sharp/Canvas
- Design goal: polished, high-contrast, "viral-ready" Instagram aesthetic
- Only integrations: Gemini API (now) + Instagram Graph API (post-MVP)

### Decided By
Client (grill session)

### Reopens?
No — format is standard. Template designs can evolve.

## 2026-07-08: Caption v2 — Image-aware + 5 options + self-learning

### Context
Captions generated without seeing the image were generic. Users need choice.

### Decision
- Send actual generated image to Gemini alongside the quote for context-aware captions
- Generate 5 distinct options per image with different tones (warm, bold, story, minimalist, philosophical)
- Self-learning store records which options users pick and uses top examples as few-shot prompts
- Store capped at 50 examples, sorted by popularity

### Decided By
Director (architectural) + Client approval

### Reopens?
No

## 2026-07-08: Logger writes to stderr

### Context
Logger JSON output was interfering with pipeable CLI JSON output (--json flag).

### Decision
Logger writes to stderr (fd 2) by default. stdout is reserved for structured CLI output.

### Decided By
Director (engineering)

### Reopens?
No

## 2026-07-08: Quote Pool lifecycle

### Context
Flat text files don't track usage, cooldown, or themes. No reuse prevention.

### Decision
- File-based quote pool at output/quote-pool.json with lifecycle states
- available → used → cooldown (30 days) → recycle, auto-retire after 5 uses
- Theme categories for filtering per account
- Dedup on import by text content

### Decided By
Director (architectural) + Client approval

### Reopens?
Yes — cooldown days can become per-account

## 2026-07-08: Account sandbox isolation

### Context
Multiple Instagram accounts need separate queues, manifests, configs, and themes.

### Decision
- Each account gets output/accounts/<id>/ with own config, queue, manifest, images
- Quote pool is shared but each quote tracks which accounts used it
- --account flag on generate and publish scopes operations to an account
- Backward compat: no account = uses global output/ dir

### Decided By
Director (design doc) + Client approval

### Reopens?
No

## 2026-07-08: MCP server parked, reels parked

### Context
Client decided to focus on core UX first — caption pipeline, CLI improvements, review UI, publish queue.

### Decision
- MCP server idea deferred (no timeline)
- FFmpeg-based reel compositing deferred (no timeline)
- Quote scraping from existing pages deferred (noted for later)
- Current focus: caption pipeline → CLI improvements → publish queue

### Decided By
Client

### Reopens?
Yes — all three can be revisited when client is ready.
- Reliability / error handling: minimal effort — if Gemini or rendering fails, just surface the error
- No retries, no queue, no backup API

### Decided By
Client (grill session)

### Reopens?
No — clear priority signal.

## 2026-07-07: Architecture — Gemini end-to-end image generation

### Context
Client clarified that Gemini should generate the final Instagram image (not just the quote text).

### Decision
- Architecture: background image + quote text → crafted prompt → Gemini → ready-to-post Instagram image
- No Canvas/Sharp compositing — Gemini handles the full image rendering
- Core quality lever is **prompt engineering** — well-crafted system prompts that tell Gemini exactly how to style text, layout, contrast, typography on the given background
- Templates folder = background image library
- Quotes folder = quote text library
- Prompt templates = the engineered prompts that orchestrate Gemini's output

### Decided By
Client (grill session)

### Reopens?
No — this defines the architecture.

## 2026-07-07: MVP Scope & Future Roadmap

### Context
Client wanted guidance on what to build vs save for later.

### Decision — MVP (In Scope)
- Plain text quote library in `quotes/` folder
- Image templates in `templates/` folder
- Quote generation via Gemini API (on-demand)
- Quote-image rendering via Canvas/Sharp (template + text composition)
- Review web endpoint — side-by-side preview, approve/reject
- Export/download approved images

### Decision — Future (Out of Scope for MVP)
- **Instagram Graph API auto-publishing** — First extension after MVP
- Daily cron scheduler
- Smart template rotation
- Hashtag generation
- Analytics / performance tracking
- Quote CMS web UI
- Multi-account support

### Decided By
Director (suggestion) + Client (approved)

### Reopens?
Yes — future phases can expand scope.
