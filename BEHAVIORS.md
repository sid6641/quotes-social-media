# Application Behaviors

> A living document describing how this application behaves — the behavioral contract, invariants, and known gaps.
> When adding a feature or fixing a bug, consult this file to understand the intended behavior.

---

## 1. Account Isolation

### Behavior
Every account is fully isolated in `output/<account-id>/` with its own:
- `images/` — Generated quote images
- `manifest.json` — Batch history (generated + approved/rejected images)
- `quotes.json` — Quote pool (seeded from global `quotes/` on first use)
- `publish-queue.json` — Scheduled publish entries
- `archive/` — Published/copied images
- `calendar/` — Exported content calendar

### Invariants
- **No account data leaks between accounts.** Account A's images, queue, and manifest must never appear in Account B's view.
- **"All accounts" view** in the UI shows global `output/` data only — it does NOT aggregate across accounts.
- **An account without a quote pool** auto-seeds from `quotes/*.txt` on the first generation attempt.

### Known Gaps
- `GET /api/manifest` with no account returns the global manifest. It should return a 404 if no global data exists.
- Account IDs with spaces (e.g., "sample 1") create directories with spaces. This works on macOS but may break scripts.

---

## 2. Generation Flow

### Flow
```
User clicks "Generate" (or CLI: npm run cli generate)
  → pickCombinations(count, accountId) — picks quotes from account's pool
  → For each combo: Gemini generates an image from prompt template
  → Image saved to <account>/images/<batchId>-NN.png
  → Captions generated (5 options per image)
  → Manifest entry created in <account>/manifest.json
```

### Invariants
- **All images go to the account's `images/` dir**, never to global `output/`.
- **Manifest always written to the account's dir**, never global.
- **Default batch size is 10 images** (configurable via `--count`).
- **Batch ID format**: `YYYY-MM-DD-NNN` (date + sequence within day).
- **Prompt templates** are read from `prompts/` folder using `{{variable}}` syntax.

### Current Code State
- **CLI** (`src/cli/generate.ts`): ✅ Account-scoped — passes `accountId` to `pickCombinations()`, writes to `getAccountDir()` and `getAccountImagesDir()`.
- **API** (`src/app/api/generate/route.ts`): ❌ **Does NOT read `account` from request body.** Always writes to global `output/`. Uses `_request` (unused parameter). Needs fix.

---

## 3. Approval / Rejection Flow

### Flow
```
User clicks Approve (or Reject) on an image card
  → POST /api/status { batchId, imageId, status, account? }
  → Manifest updated in <account>/manifest.json
  → If approved: auto-added to <account>/publish-queue.json
  → If rejected: auto-removed from <account>/publish-queue.json
```

### Invariants
- **Approval is immediate and non-reversible** (UI doesn't support un-approve).
- **Approving auto-queues** the image for publishing.
- **Rejecting auto-removes** from queue if present.
- **Status updates persist in manifest** across server restarts (file-based).

### Current Code State
- **API** (`src/app/api/status/route.ts`): ❌ Does NOT pass `outputDir` to `addToQueue()`. Approved images go to global `publish-queue.json` even for account-scoped operations.
- **UI** (`src/app/page.tsx`): ✅ Sends `account` in request body.

---

## 4. Publish Queue Flow

### Flow
```
User clicks "Publish Due Items Now"
  → POST /api/queue { action: "process", account? }
  → processQueue(accountDir, accountId) reads from <account>/publish-queue.json
  → For each queued item:
      → If Instagram configured: publishToInstagram() → markPublished()
      → If NOT configured: publishToInstagram() falls back to simulateLocalPublish()
        → Image copied to <account>/archive/
        → Caption file written to <account>/archive/
        → Queue entry marked as "published"
```

### Invariants
- **"Publish Due Items Now" processes the SELECTED ACCOUNT's queue only**, not the global queue.
- **Instagram API unavailability is non-fatal** — falls back to local simulation (archive).
- **Published items stay in queue** with status "published" (not removed).
- **Publishing is idempotent** — items already published are skipped.

### Current Code State
- **CLI** (`src/lib/scheduler.ts`): ✅ Uses `processQueue()` correctly.
- **UI** (`src/app/page.tsx` handlePublishNow): ❌ Sends `{ action: "process" }` without `account` field.
- **API** (`src/app/api/queue/route.ts`): ❌ POST handler doesn't read `account` from body. Calls `processQueue()` without arguments.
- **Lib** (`src/lib/queue.ts processQueue`): ✅ Signature accepts `accountDir` and `accountId`. Correct internally.

---

## 5. Instagram Publish Flow

### Flow
```
publishToInstagram(imageUrl, caption, accountId)
  → resolvePublishConfig(accountId)
      → Tries account-specific IG auth (from account config)
      → Falls back to env vars (INSTAGRAM_ACCESS_TOKEN + INSTAGRAM_IG_USER_ID)
      → If neither available: THROWS → caught by caller → simulateLocalPublish()
  → createMediaContainer() → Instagram API Step 1
  → wait 2 seconds
  → publishMediaContainer() → Instagram API Step 2
  → Returns mediaId
```

### Invariants
- **Local simulation fallback** copies the image + caption to `<account>/archive/` when Instagram API is unavailable.
- **Image URL** is constructed from `NEXT_PUBLIC_BASE_URL` (defaults to `http://localhost:3000`).
- **The call chain is:** API route → `publishToInstagram()` → fallback handled INSIDE `publishToInstagram`. The route must NOT pre-validate.

### Current Code State
- **Direct publish** (`src/app/api/publish/route.ts`): ❌ Has a pre-check `resolvePublishConfig()` that blocks with 400 before `publishToInstagram()` is ever called. The `simulateLocalPublish` fallback is unreachable through this route.
- **Queue publish** (`src/lib/queue.ts processQueue`): ✅ Calls `publishToInstagram()` directly with fallback handled internally.

---

## 6. Content Calendar Export Flow

### Flow
```
User clicks "📅 Export Calendar" (or CLI)
  → POST /api/export { days, account? }
  → exportContentCalendar({ accountId, days })
      → Collects approved (non-published) images from account's manifest
      → Reads image from account's images/ dir
      → Generates day-by-day schedule starting tomorrow
      → Copies images + writes caption.txt files to account's calendar/ dir
```

### Invariants
- **Only approved, non-published images** are included in the export.
- **Export starts from tomorrow** (never includes today).
- **Each day gets a sequential number**: `01-YYYY-MM-DD.png` + `01-YYYY-MM-DD-caption.txt`.
- **Export output goes to `<account>/calendar/`**, never global.
- **Export is non-destructive** — does not modify manifests or queues.

### Current Code State
- **API** (`src/app/api/export/route.ts`): ✅ Correctly passes `account` to `exportContentCalendar()`.
- **Lib** (`src/lib/exporter.ts`): ✅ Correctly reads from account dir, writes to account's calendar dir.
- **UI** (`src/app/page.tsx` handleExport): ✅ Sends `{ days, account }` in request body.

---

## 7. Image Serving

### Behavior
Images are served from two locations, checked in order:
1. `output/<account>/images/<filename>` (when `?account=xxx` is specified)
2. `output/<filename>` (global fallback)
3. `templates/<filename>` (template images)

### Invariants
- **Account-scoped image URLs** MUST include `?account=<id>` query parameter.
- **Directory traversal** is blocked (filenames with `..` or `/` are rejected).
- **All generated images are PNG** (may change if Gemini output format changes).

### Current Code State
- **API** (`src/app/api/images/[filename]/route.ts`): ❌ Does NOT read `?account=` query parameter. Only searches global `output/` and `templates/`. Account images are 404 through the web UI.

---

## 8. Quote Pool Lifecycle

### Behavior
```
Quotes move through states:
  available → used (on generation) → cooldown (30 days) → available again
  After 5 uses: retired permanently
```

### Invariants
- **Quote pool is per-account** — each account has its own `quotes.json` with independent lifecycle.
- **Auto-seeding**: When an account has no quotes, the first generation auto-seeds from `quotes/*.txt`.
- **Dedup**: Quotes with identical text are silently skipped on import.
- **Cooldown is configurable** per account via `cooldownDays` field.
- **Global fallback**: If no account specified, the global `quotes/sample.txt` or `output/quote-pool.json` is used.

### Current Code State
- **Lib** (`src/lib/quote-pool.ts`): ✅ Supports account-scoped operations via `accountId` parameter.

---

## 9. Account Management

### Behavior
```
User creates account via Accounts tab (UI) or CLI
  → Account added to output/accounts.json with: { id, name, cooldownDays, enabled }
  → Directories created: output/<id>/ { images/, archive/, calendar/ }
  → Quotes auto-imported on first generation
```

### Invariants
- **Account ID must be unique** — creating a duplicate ID overwrites the existing entry.
- **Account ID is not sanitized** — spaces and special characters are allowed.
- **Deleting an account** removes it from accounts.json but does NOT delete its directory on disk.
- **Disabling an account** (`enabled: false`) excludes it from autopilot but allows manual operations.

### Current Code State
- **API** (`src/app/api/accounts/route.ts`): ⚠️ Does not sanitize account IDs. Spaces in IDs work on macOS but cause URL encoding issues.

---

## 10. Autopilot Scheduler

### Behavior
```
CLI: npm run cli autopilot [--account <id>] [--count <n>] [--dry-run]
Cron: Runs daily at 08:00 (configurable with --setup-cron)
  → For each enabled account (or specified --account):
      → Generate images
      → Done (no auto-approve, no auto-export)
```

### Invariants
- **Autopilot generates only** — it never auto-approves, auto-exports, or auto-publishes.
- **Disabled accounts** (`enabled: false`) are skipped.
- **Dry-run mode** logs what would happen without generating.

---

## 11. CLI Behavior

### Commands
| Command | Description | Account Scope |
|---------|-------------|---------------|
| `generate` | Generate quote images | ✅ `--account` |
| `publish` | Publish from queue | ✅ `--account` |
| `export` | Export content calendar | ✅ `--account` |
| `list` | List quotes/templates/prompts | ❌ Global only |
| `account` | CRUD account management | N/A |
| `quotes` | Manage quote pool | ✅ Per-account |
| `autopilot` | Batch generation for cron | ✅ `--account` |

### Invariants
- **All commands support `--json`** for pipeable output.
- **Logger writes to stderr** — stdout is always clean JSON or formatted output.
- **Help text** is shown for unknown commands and with `--help`.

---

## 12. Web UI Behavior

### Tabs
| Tab | Purpose | Account Scope |
|-----|---------|---------------|
| **Review** | View + approve/reject generated images | ✅ Scoped |
| **Queue** | View + publish queued items | ✅ Scoped |
| **Templates** | View template images | ❌ Global only |
| **Hashtag Bank** | Browse saved hashtag sets | ❌ Global only |
| **Quotes** | Manage quote pool | ✅ Scoped |
| **Accounts** | Create/manage accounts | N/A |

### Invariants
- **Account selector** at the top scopes ALL tabs to the selected account.
- **"All accounts"** shows global data only (no aggregation).
- **Generating** in "All accounts" creates a global batch (not scoped to any account).
- **Batch history dropdown** shows past batches for the selected account.

---

## Appendix: Known Behavioral Gaps

### 🔴 Critical (breaks core workflow for accounts)

| Gap | File(s) | Impact |
|-----|---------|--------|
| Generate route ignores `account` | `api/generate/route.ts` | Images/manifest written to global, not account dir |
| Queue route ignores `account` | `api/queue/route.ts` | Publish processes global queue, not account queue |
| Publish route pre-blocks fallback | `api/publish/route.ts` | `simulateLocalPublish` never reached |
| Status route ignores `accountDir` | `api/status/route.ts` | Approved images added to global queue |
| UI Publish Now doesn't send account | `page.tsx` handlePublishNow | Queue process has no account context |

### 🟡 Medium (degraded UX for accounts)

| Gap | File(s) | Impact |
|-----|---------|--------|
| Image route ignores `?account=` | `api/images/[filename]/route.ts` | Account images are 404 in UI |
| `getAllBatches()` no account param | `lib/manifest.ts` | Batch history is global-only |
| Account ID not sanitized | `api/accounts/route.ts` | IDs with spaces cause URL encoding issues |
| Export calendar output path changed | `lib/exporter.ts` | Calendar dir changed from `output/exports/` to `output/<account>/calendar/` — verify CLI export still correct |

### ✅ Working (account-scoping correct)

| File | What works |
|------|------------|
| `lib/manifest.ts` `getLatestBatch(accountId?)` | ✅ Reads from account dir when accountId provided |
| `lib/queue.ts` `processQueue(accountDir, accountId)` | ✅ Signature correct, reads/writes to account dir |
| `lib/exporter.ts` | ✅ Account-scoped correctly |
| `lib/quote-pool.ts` | ✅ Account-scoped correctly |
| `lib/account.ts` | ✅ Directory helpers all support accountId |
| `lib/mixer.ts` `pickCombinations()` | ✅ Accepts accountId |
| `api/export/route.ts` | ✅ Passes account through |
| `api/status/route.ts` (manifest update) | ✅ Reads/writes manifest from account dir |
| `cli/generate.ts` | ✅ Account-scoped correctly |
| CLI all commands with `--account` | ✅ Scoped correctly |

---

> **When fixing gaps**: The library layer (`lib/`) mostly supports accounts correctly. The routing layer (`api/`) and UI (`page.tsx`) consistently fail to forward the account context. Fix the routing layer, not the library layer.
