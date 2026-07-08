# Current Task

**Agent**: Director
**Skill**: Content Calendar Export (P0)
**Started**: 2026-07-08
**Updated**: 2026-07-08
**Step Detail**: Export feature complete — CLI, API, and UI button.

## Progress

- [x] MVP implemented, reviewed, and fixed
- [x] Caption v2 (image-aware, 5 options, self-learning)
- [x] CLI improvements (flags, subcommands, JSON output, list)
- [x] Publish queue (approve → scheduled post)
- [x] Post preview, batch history, caption copy
- [x] Template preview, hashtag bank, batch select
- [x] Structured logging (pino)
- [x] Phase A: Quote Pool with lifecycle
- [x] Phase B: Account sandboxes with isolated dirs
- [x] All CLI pipeable with --json
- [x] **P0: Content Calendar Export** (CLI + API + UI button)

## Open Questions

- Phase C: AI Quote Generation
- Phase D: Autopilot Scheduler (built but CLI-only — needs cron verification)
- Fix routing layer account-scoping gaps (5 critical, 4 medium documented in BEHAVIORS.md)

## Next Micro-Step

Fix the 5 critical account-scoping gaps in the routing layer (see BEHAVIORS.md "Known Behavioral Gaps").
Next feature: Phase C — AI Quote Generation.
