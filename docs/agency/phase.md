# Phase: 2 — Iterative Improvement
**Step**: Test coverage (TDD)
**Status**: 🟢 Active
**Started**: 2026-07-07
**Updated**: 2026-07-13

## Current Step Details

All 7 lib seams have pure-function unit tests (media, json-store, mixer, quote-pool, manifest, queue, quotes-generator). 148 tests total.

## Completed
- ✅ Architecture hardening (5 candidates)
- ✅ Review UI: per-batch pagination, unreviewed filter, reviewed tracking
- ✅ Reject remaining (batch-scoped)
- ✅ Queue tab empty-state hint for "All accounts"
- ✅ Global quotes fallback removed
- ✅ vitest test runner configured
- ✅ 148 unit tests across 7 modules (media, json-store, mixer, quote-pool, manifest, queue, quotes-generator)
- ✅ All 7 seams use pure-function extraction pattern for testability
- ✅ Bug fix: DELETE /api/queue now account-scoped
- ✅ Bug fix: processQueue now account-scoped
- ✅ Scheduling uses UTC (timezone-independent)
- ✅ Quotes generator: 19 tests for buildGeneratePrompt, parseQuotesResponse, buildDirectImagePrompt
- ✅ Quotes generate CLI wired (Plan A: text→pool, Plan B: direct image)

## Next Action

Continue with generation pipeline refinement, integration tests, or next roadmap feature.

## Progress

| Step | Status | Completed |
|------|--------|-----------|
| MVP Development | ✅ | 2026-07-07 |
| MVP Code Review | ✅ | 2026-07-07 |
| Caption Pipeline | ✅ | 2026-07-08 |
| CLI Improvements | ✅ | 2026-07-08 |
| Publish Queue | ✅ | 2026-07-08 |
| Post Preview / Batch History / Caption Copy | ✅ | 2026-07-08 |
| Template Preview / Hashtag Bank / Batch Select | ✅ | 2026-07-08 |
| Structured Logging (pino) | ✅ | 2026-07-08 |
| Phase A: Quote Pool | ✅ | 2026-07-08 |
| Phase B: Account Sandboxes | ✅ | 2026-07-08 |
| Behavioral Audit + BEHAVIORS.md | ✅ | 2026-07-08 |
| **P0: Content Calendar Export** | ✅ | 2026-07-08 |
| **Phase D: Autopilot Scheduler** | ✅ | 2026-07-08 |
| Phase C: AI Quote Generation | ❌ | — |
