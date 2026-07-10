# Session Log

## 2026-07-10 — Architecture hardening: JsonStore<T> + getMimeType dedup

### Agent
Director (architecture review → implementation)

### Summary
- **Candidate #2**: Extracted file-backed store pattern into `src/lib/json-store.ts`
  - `JsonStore<T>` interface: `get()`, `set(data)`, `invalidate()`
  - `createFileStore<T>(path, default)` — production adapter
  - `createMemoryStore<T>(default)` — test adapter (no filesystem)
  - Refactored 5 modules: manifest.ts, queue.ts, quote-pool.ts, account.ts, hashtag-bank.ts
  - Removed ~130 lines of duplicated read/write/cache/ensureDir
- **Candidate #4**: Deduplicated `getMimeType` — extracted to `src/lib/media.ts`
  - Updated gemini.ts and caption.ts to import shared definition

### Before → After
- Before: 5 modules each had private read/write/cache/ensureDir copies
- After: All 5 delegate to `JsonStore<T>` — one seam, two adapters (file + memory)

### State At End
Candidates #1, #2, #3, #4 complete. Only #5 (page monolith) remains.

## 2026-07-10 — Architecture review: collapse generation pipeline + fix dependency leak

### Agent
Director (architecture review + implementation)

### Skill
improve-codebase-architecture → direct implementation

### Summary
- Full architecture review via codebase-memory MCP knowledge graph (1009 nodes, 1809 edges)
- HTML report generated at `/tmp/architecture-review-2026-07-10.html` with 5 candidates
- **Candidate 1+3 implemented**: Collapsed CLI/API generation pipeline into single deep module + fixed lib→CLI dependency inversion

### Changes Made
- **New**: `src/lib/generate.ts` — single deep generation module (~240 lines), single interface `runGenerate(options) → GenerateResult`
- **Collapsed**: `src/cli/generate.ts` from ~260 lines → ~110 lines (thin CLI adapter)
- **Collapsed**: `src/app/api/generate/route.ts` from ~190 lines → ~80 lines (thin HTTP adapter)
- **Fixed**: `src/lib/scheduler.ts` now imports from `./generate` instead of `../cli/generate`
- **Updated**: `src/cli/index.ts` calls `runGenerateCli` (CLI-specific wrapper)
- TypeScript build verified — zero errors in src/

### Architecture Before → After
- Before: CLI and API each had full ~150-line pipeline copy; scheduler imported from CLI (lib→CLI leak)
- After: One deep module (`lib/generate.ts`) with `onProgress` callback; CLI, API, scheduler are thin adapters
- Interface: `runGenerate(options, onProgress?) → GenerateResult` — 3 callers, 1 interface to test

### Learnings Captured
- Dependency inversion pattern: lib should never import from cli/ or app/ — move shared logic down
- Progress callbacks decouple output formatting from business logic
- `trigger` field made configurable (cli vs web) via options rather than hardcoded

### State At End
Candidates 1+3 complete. Remaining candidates (file-backed store pattern, getMimeType dedup, page monolith) queued.

## 2026-07-07 — Builder MVP + Reviewer fixes

### Agent
Director → Builder → Reviewer

### Skill
agency-orchestrate, agency-handoff, agency-review

### Summary
- Handoff package created at `docs/handoff.md`
- Builder dispatched: implemented full MVP (20 source files)
- Full TypeScript build verified — zero errors
- Reviewer dispatched: 18 items verified, 3 blocking issues found and fixed
  - B1: Batch ID collision — CLI and API now use sequence-aware IDs from manifest.ts
  - B2: Wasteful API probe removed — no more `generateContent("test")` on every call
  - B3: Redundant quote_text substitution removed
- Warnings noted: API error capture fixed, image dimension validation pending
- All fixes committed and pushed

### Artifacts Produced
- `docs/handoff.md` — Phase 1→2 handoff package
- 20 source files — full MVP implementation
- Review fixes — 3 blocking issues resolved

### State At End
MVP implemented, reviewed, and fixed. Ready for use.

## 2026-07-08 — P0: Content Calendar Export

### Agent
Director → Builder

### Skill
N/A (direct implementation)

### Summary
- Built Content Calendar Export feature to bypass Instagram API restriction
- **New files**: `src/lib/exporter.ts` — core export library, `src/cli/export.ts` — CLI command, `src/app/api/export/route.ts` — API endpoint
- **Modified**: `src/cli/index.ts` — registered export command with parsing + dispatch, `src/app/page.tsx` — added 📅 Export Calendar button + result banner
- CLI: `npm run cli export -- --days 7 --account dailygrind`
- API: `POST /api/export { days: 7 }`
- UI: Amber "📅 Export Calendar" button in the action bar
- Output: `output/exports/calendar-<account>-<date>.json` + `output/exports/<account>-content/01-YYYY-MM-DD.png` + caption.txt per day
- Tested: 3 images exported successfully with captions and hashtags

### State At End
Export feature complete. Users can generate, approve, and export a content calendar for manual Instagram posting.

## 2026-07-08 — Phase D: Autopilot Scheduler (simplified)

### Agent
Director → Builder

### Skill
N/A (direct implementation)

### Summary
- Built the Autopilot Scheduler — just generates images on a cron schedule
- **New files**: `src/lib/scheduler.ts` — runs `generate` for each enabled account, `src/cli/autopilot.ts` — CLI command with cron management
- **Modified**: `src/cli/index.ts` — registered autopilot command
- Autopilot does NOT auto-approve or export — just generates images for review
- CLI: `npm run cli autopilot [--account <id>] [--count <n>] [--dry-run] [--setup-cron] [--cron-status]`
- Cron integration: `--setup-cron` installs daily 08:00 cron, `--remove-cron` removes it, `--cron-status` checks
- User reviews images in the UI at http://localhost:3000 → approves/rejects → exports manually

### State At End
Autopilot generates images daily. User reviews and publishes manually.

## 2026-07-07 — PRD and technical spec drafted

### Agent
Director

### Skill
agency-spec

### Summary
- PRD drafted with 9 user stories, 3 flows, 9 acceptance criteria
- Technical spec drafted with architecture diagram, data model, project structure, prompt template format
- Phase updated: Step: spec, Requirements Brief marked complete

### Artifacts Produced
- `docs/prd.md` — Product Requirements Document
- `docs/technical-spec.md` — Technical specification

### State At End
Review fixes applied and verified (build clean). MVP code ready for use.

## 2026-07-07 — Full grill interview completed, requirements brief produced

### Agent
Director

### Skill
agency-grill

### Summary
- Full requirements extraction across all 6 areas (North Star, Scope, Users, Tech, Non-Functionals, Risks)
- Architecture clarified: Gemini handles end-to-end image generation via engineered prompt templates
- Tech stack updated: no Canvas/Sharp — Gemini does the rendering
- MVP scope defined: CLI + web trigger → generate 10 images → review → download
- 4 risks identified and captured
- Requirements brief written and saved

### Artifacts Produced
- `docs/requirements-brief.md` — Complete requirements brief

### State At End
PRD and technical spec written and committed. Ready for client approval, then handoff to Phase 2.

## 2026-07-07 — Project initialized and knowledge base seeded

### Agent
Director

### Skill
agency-import

### Summary
- Project scaffolded with AGENTS.md + knowledge base (7 files)
- GitHub repository created at github.com/sid6641/quotes-social-media
- Knowledge base populated via client interview
- Tech stack decided: Next.js, TypeScript, Gemini API for quote generation
- .env, .env.example, and .gitignore created
- Project structure defined: src/, templates/, quotes/

### Artifacts Produced
- `AGENTS.md` — Project-level agent config
- `docs/agency/README.md` — Project context
- `docs/agency/phase.md` — Phase status (Phase 1, Step: grill)
- `docs/agency/decisions.md` — 3 initial decisions
- `docs/agency/session-log.md` — This entry
- `.env` / `.env.example` — API key placeholders
- `.gitignore` — Node.js/Next.js ignores

### State At End
Requirements brief completed and approved. Ready to proceed with agency-spec for PRD/spec generation.

## 2026-07-08 — Caption pipeline built (commentary + hashtags)

### Agent
Director → Builder

### Skill
agency-grill (requirements)

### Summary
- New scope direction set: focus on core UX, drop MCP server for now, drop reels for now
- Caption pipeline built: AI-generated commentary + hashtags for every generated quote image
- New module `src/lib/caption.ts` — batch caption generation via Gemini text model (gemini-2.0-flash)
- Manifest types extended with `caption?: { commentary, hashtags }`
- CLI generate now prints captions after batch generation
- Web API generate now returns captionCount
- New API route `POST /api/caption` for saving edited captions
- Review UI updated: captions displayed per image card, inline editing with save/cancel
- Build verified — zero TypeScript errors

### Artifacts Produced
- `src/lib/caption.ts` — Caption generation module
- `src/app/api/caption/route.ts` — Caption save endpoint
- Updated: `src/lib/manifest.ts`, `src/cli/generate.ts`, `src/app/api/generate/route.ts`, `src/app/page.tsx`

### Decisions Made
- Caption generation uses a separate text model (gemini-2.0-flash) from image generation — cheaper and faster
- Captions are generated in batch (all quotes in one API call) after image generation completes
- Caption generation failure is non-fatal — images proceed without captions
- Captions are editable in the review UI with save/cancel
- Captions include: commentary (1-3 sentences) + hashtags (8-12)

### State At End
Caption pipeline complete and verified. Next up: CLI improvements (flags, subcommands), then review UI + publish queue improvements.

## 2026-07-08 — CLI improvements (flags, subcommands, list)

### Agent
Director → Builder

### Skill
— (direct build)

### Summary
- Built proper CLI with command routing (`src/cli/index.ts`)
- `npm run generate` still works unchanged (backward compat)
- `npm run cli generate [options]` — enhanced CLI entry point
- `--count <n>` flag to override batch size
- `--template <name>` flag to pick a specific prompt template
- `--json` flag for JSON output (pipes to `jq`)
- `npm run cli list quotes` — lists all quotes from quotes/ folder
- `npm run cli list templates` — lists template images with file sizes
- `npm run cli list prompts` — lists prompt templates with first-line summary
- Refactored `pickCombinations()` to accept a count parameter (was hardcoded 10)
- `runGenerate()` now returns a structured `GenerateResult` for programmatic use
- Build verified — zero errors
- CLI tested: `--help`, `list prompts`, `list quotes`, `list templates` all work

### Artifacts Produced
- `src/cli/index.ts` — CLI entry point with routing
- `src/cli/list.ts` — list subcommand handlers
- Updated: `src/cli/generate.ts`, `src/lib/mixer.ts`, `package.json`

### State At End
CLI improvements complete. Next up: publish queue (approve → scheduled post) + review UI enhancements.

## 2026-07-08 — Publish queue built

### Agent
Director → Builder

### Skill
— (direct build)

### Summary
- Built full publish queue system: queue file, API, CLI, and UI
- `src/lib/queue.ts` — Queue management module (add, remove, process, stats, daily scheduling)
- Queue stored in `output/publish-queue.json`
- Auto-queues on approve: status API now calls `addToQueue()` when image is approved
- Auto-removes on reject: status API calls `removeImageFromQueue()` when rejected
- Daily scheduling: items scheduled for next `PUBLISH_TIME` (default 09:00, configurable via env var)
- CLI: `npm run cli publish` with `--status`, `--force`, `--dry-run` flags
- API: `GET /api/queue` (list), `POST /api/queue` (add/process), `DELETE /api/queue` (remove)
- Web UI: "Publish Queue" tab with queue table, status badges, remove button, "Publish Due Items Now" button
- Publish is simulated for now (Instagram restricted) — marks items as published
- Build verified — zero errors
- CLI tested: `publish --status` works (shows empty queue)

### Artifacts Produced
- `src/lib/queue.ts` — Queue management
- `src/app/api/queue/route.ts` — Queue API
- `src/cli/publish.ts` — Publish CLI command
- Updated: `src/cli/index.ts`, `src/app/api/status/route.ts`, `src/app/page.tsx`, `README.md`

### Decisions Made
- Queue stored in separate file (`output/publish-queue.json`) from manifest
- Approve auto-queues, reject auto-removes (via status API)
- Daily scheduling: configurable `PUBLISH_TIME` env var (default 09:00)
- Publish is simulated while Instagram is restricted
- Queue entries are deduplicated (no duplicate batchId+imageId combos)

### State At End
Publish queue complete. Next up: review UI enhancements (full preview, batch selection, keyboard shortcuts).

## 2026-07-08 — Full session: Caption v2, Post preview, Batch history, Template preview, Hashtag bank, Batch select, Bug fixes, Structured logging, Quote Pool (Phase A), Account Sandboxes (Phase B), JSON piping

### Agent
Director → Builder

### Summary
Massive session covering all remaining Phase 2 features plus Phases A and B:

**Caption v2 (Image-aware + 5 options + Self-learning)**
- `src/lib/caption.ts` — Rewritten to send actual image to Gemini for context-aware caption generation
- Generates 5 distinct caption options per image (warm, bold, story-driven, minimalist, philosophical)
- Self-learning store at `output/caption-examples.json` — records user picks, uses top 2 as few-shot examples
- UI updated to show 5 pickable numbered options per image card with visual selection state

**Post preview, batch history, caption copy**
- Phone-frame modal showing image + full caption + hashtags
- Clickable batch selector in header to switch between past batches
- One-click clipboard copy with "Copied!" feedback

**Template preview, hashtag bank, batch select**
- Templates tab with thumbnails and file sizes from `templates/` dir
- Hashtag bank: named sets CRUD via web UI + API
- Batch select: checkboxes on cards, floating action bar for bulk approve/reject

**Bug fixes**
- 404 loading hang: `setLoading(false)` was missing in 404 early-return
- Caption sync after approval: queue entry now updates when caption option changes
- Duplicate queue entries prevented via dedup logic

**Structured logging (pino)**
- `src/lib/logger.ts` — Pino-based JSON logging with LOG_LEVEL, LOG_PRETTY, LOG_FILE
- All console.log/error replaced across CLI and lib files
- Logger writes to stderr (fd 2) so stdout stays clean for pipeable JSON output

**Phase A — Quote Pool**
- `src/lib/quote-pool.ts` — Self-managing pool with lifecycle (available → cooldown → recycle, auto-retire after 5 uses)
- Theme categories, dedup on import, per-account usage tracking
- API: `GET/POST/DELETE /api/quotes`
- CLI: `npm run cli quotes list/add/import/stats/expire`
- Web UI: Quotes tab with stats, add form, filter tabs, delete
- Auto-seeds from text files on first run

**Phase B — Account Sandboxes**
- `src/lib/account.ts` — CRUD for accounts with isolated dirs (`output/accounts/<id>/`)
- Per-account config: themes, schedule, IG auth, cooldownDays
- API: `GET/POST/DELETE /api/accounts`
- CLI: `npm run cli account create/list/get/update/delete`
- Web UI: Accounts tab with create form, enable/disable toggle, delete
- `generate --account <id>` — uses account's themes for quote filtering, writes to account directory
- `publish --account <id>` — reads account-specific queue
- `queue.ts` and `manifest.ts` updated for per-account paths
- `mixer.ts` updated for theme-filtered quote picking
- All commands support `--json` for pipeable output

### Decisions Made
- Caption v2: send actual image to Gemini for context-aware captions (was text-only)
- 5 caption options per image with different tones for user to choose from
- Self-learning store capped at 50 examples, sorted by pickCount
- Logger writes to stderr for clean JSON piping on stdout
- Quote pool replaces flat text file approach with lifecycle management
- Each account gets fully isolated directory (manifest, queue, images, config)
- Accounts can share the quote pool but each tracks which account used which quote
- --account flag scopes both generation and publishing to a specific account
- `--json` flag on all CLI commands for pipeable output

### Artifacts Produced
- `src/lib/caption.ts` (rewrite) — Image-aware 5-option caption generation
- `src/lib/caption-learning.ts` — Self-learning store for caption picks
- `src/lib/logger.ts` — Pino-based structured logger
- `src/lib/quote-pool.ts` — Quote pool with lifecycle management
- `src/lib/account.ts` — Account sandbox management
- `src/app/api/quotes/route.ts` — Quotes REST API
- `src/app/api/accounts/route.ts` — Accounts REST API
- `src/cli/quotes.ts` — CLI quotes commands
- `src/cli/account.ts` — CLI account commands
- Updated: `page.tsx`, `generate.ts`, `publish.ts`, `index.ts`, `queue.ts`, `manifest.ts`, `mixer.ts`, `gemini.ts`, `list.ts`, many API routes

### State At End
All Phase 2 features complete. Phases A (Quote Pool) and B (Account Sandboxes) complete.
Next up: Phase C (AI Quote Generation), Phase D (Autopilot Scheduler), or other roadmap items.

## 2026-07-08 — Account scope audit, behavioral gaps found, BEHAVIORS.md created

### Agent
Director → Builder + Explore

### Skill
— (direct audit)

### Summary
- Comprehensive behavioral audit of the entire application
- Created `BEHAVIORS.md` — a living behavioral contract document describing every flow (generate, approve, publish, export, image serving, quote lifecycle, account management)
- **Key finding**: The library layer (`lib/`) mostly supports account-scoped operations via optional parameters. The **routing layer** (`api/*` route handlers) and **UI** (`page.tsx`) consistently fail to extract and forward the `account` parameter.
- 5 🔴 critical gaps found (generate ignores account, queue ignores account, publish pre-blocks fallback, status ignores accountDir, UI Publish Now doesn't send account)
- 4 🟡 medium gaps found (image route ignores `?account=`, batch history global-only, account ID not sanitized, export output path changed)
- Documented 12 behavioral areas with current code state (✅ working / ❌ broken / ⚠️ partial)

### Key Behavioral Rules Captured
1. **Account isolation**: Every account is fully isolated in `output/<id>/` with own images, manifest, queue, archive, calendar
2. **Generation**: All images + manifest go to account's dir, never global
3. **Approval**: Auto-queues to account's queue; rejection auto-removes
4. **Publish**: Processes only the selected account's queue; Instagram unavailability is non-fatal (local simulation)
5. **Export**: Reads from account manifest, writes to account calendar dir
6. **Image serving**: Tries account images dir first, then global, then templates
7. **Quote lifecycle**: Per-account pool with available → used → cooldown → recycle

### Artifacts Produced
- `BEHAVIORS.md` — Complete behavioral contract with 12 sections, invariants, and known gaps table

### State At End
Behavioral contract documented. 5 critical gaps identified in the routing layer. Ready for systematic fix.
