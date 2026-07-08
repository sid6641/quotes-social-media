# Learning: Autopilot Scheduler (2026-07-08)

## Context
User wanted a fully automated pipeline — generate, approve, and export without manual intervention each day.

## Solution
A single CLI command that orchestrates the three-step pipeline:
1. `runGenerate()` — generates images via Gemini
2. `autoApproveImages()` — scans manifest, marks all pending as approved
3. `exportContentCalendar()` — exports the content calendar

Plus cron integration for daily scheduling.

## Key Patterns

### Auto-Approve Reads Manifest Directly
The `manifest.ts` library functions don't support account-scoped operations. The auto-approve function reads the manifest file directly via `fs` instead of using exported manifest functions, matching the pattern established in the exporter.

### Cron Integration via crontab
Using standard macOS `crontab` for scheduling:
- `crontab -l` to list existing jobs
- `crontab -` with stdin to write new jobs
- Unique comment marker (`# quotes-social-media autopilot`) to find/remove our entry

### Dry-Run Safety
`--dry-run` flag skips the actual Gemini API calls and file writes, just logging what would happen. Essential for verifying the config before running.

### Serial Account Processing
Accounts are processed one at a time (not in parallel) to avoid overloading the Gemini API rate limits.

## Edge Cases
- **No enabled accounts**: Gracefully logs a warning and returns empty result
- **Missing manifests**: Auto-approve silently skips accounts with no manifest
- **Previous pending images**: Auto-approve catches them too — tested: 2 leftover pending images from prior batch were approved alongside 3 new ones

## Open Questions
- Should we add a `--no-export` flag for days when no posting is planned?
- Should we add a notification mechanism (email/push) when autopilot completes?
