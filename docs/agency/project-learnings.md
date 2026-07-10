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
