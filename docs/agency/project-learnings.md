# Project Learnings

<!-- Append-only. Project-specific patterns, gotchas, and insights. -->

## 2026-07-10: Collapse duplicated pipelines into a single deep module

### Context
When CLI and API route implement the same workflow independently.

### The Pattern
1. Extract the shared pipeline into `src/lib/<name>.ts` with a single exported function
2. Use an `onProgress` callback to let callers own output formatting
3. Make caller-specific metadata (e.g. `trigger: "cli" | "web"`) a configurable option
4. CLI and API route become thin adapters (~20-30 lines each)
5. Enforce: lib never imports from cli/ or app/ — the dependency arrow always points up

### Evidence
This refactoring collapsed ~450 lines of duplicated pipeline code into ~240 lines in one module + ~190 lines across two thin adapters. Three callers (CLI, API, scheduler) now share one implementation. A generation bug fix now touches one file instead of two.

### Applied By
Director (architecture review → implementation)

## 2026-07-10: Decompose monolithic page into tab components with focused interfaces

### Context
When a single page component grows to 2,000+ lines with 47 useState hooks across 6 unrelated views.

### The Pattern
1. Identify the natural seams — each tab/view is a separate concern
2. Extract each tab into its own component with a minimal prop interface
3. Shell handles only cross-cutting concerns: routing, shared modals, global actions
4. Each tab manages its own data fetching — no prop drilling
5. Shared types go in a sibling `types.ts` file
6. Tabs communicate with the shell via callbacks (`onDataChange`, `onPreviewImage`)

### Evidence
Page shell reduced from 2,297 lines to ~250. Each tab independently testable. Changing the queue tab no longer risks breaking the review tab.

### Applied By
All agents — use tab decomposition pattern for any page with 3+ unrelated views.

## 2026-07-10: Extract duplicated file-I/O pattern into a generic JsonStore<T>

### Context
When multiple modules independently implement the same file-backed JSON cache pattern (read → parse → cache → mutate → write → invalidate).

### The Pattern
1. Define `JsonStore<T>` interface: `get()`, `set(data)`, `invalidate()`
2. `createFileStore<T>(path, default)` — one production adapter, handles fs, JSON, cache
3. `createMemoryStore<T>(default)` — one test adapter, no filesystem
4. Each domain module creates stores via factory functions
5. For per-account multi-file cases, use `Map<string, JsonStore<T>>` for lazy creation

### Evidence
Removed ~130 lines of duplicated read/write/cache/ensureDir across 5 modules. All now delegate to the same store pattern. Adding a new file-backed module now takes 3 lines instead of 30.

### Applied By
All agents — use `createFileStore` for any new file-backed JSON state.

## 2026-07-10: Dependency direction rule — lib never imports from cli/ or app/

### Context
`scheduler.ts` (in lib/) imported `runGenerate` from `../cli/generate`. This inverted the natural dependency direction.

### The Pattern
- `src/lib/` — business logic, no Next.js or CLI dependencies
- `src/cli/` — thin argument-parsing wrappers around lib
- `src/app/api/` — thin HTTP adapters around lib
- `src/app/page.tsx` — UI, can import lib but not cli
- Rule: if lib imports from cli/ or app/, the module in cli/ or app/ belongs in lib/

### Evidence
Moving `runGenerate` to lib fixed the leak and enabled the scheduler to sit cleanly in the lib layer. The type checker confirmed zero dependency violations.

### Applied By
All agents — this is now a codebase invariant.

<!-- Template:
## {{DATE}}: {{Pattern Name}}

### Context
{{When does this pattern apply}}

### The Pattern
{{What to do — or not do}}

### Evidence
{{Why this pattern holds — 1-2 sentences}}

### Applied By
{{Which agent/skill should follow this}}
-->
