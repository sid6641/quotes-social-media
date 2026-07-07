<!-- BEGIN:project-constitution -->
# Project — Agent Organization

This file is the **project-level** layer of a two-tier agent organization.

**User-level Director constitution**: `{{VSCODE_USER_PROMPTS_FOLDER}}/director.instructions.md`
**User-level specialist agents**: `{{VSCODE_USER_PROMPTS_FOLDER}}/*.agent.md`

---

## Project Overview

quotes-social-media — An automated quote-image generator that mixes Instagram-style templates with a quote library to produce and publish optimized Instagram posts.

## Tech Stack

- **Framework**: Next.js
- **Language**: TypeScript
- **Image Generation**: Canvas API / Sharp (to render template + quote compositions)
- **Storage**: Local filesystem (MVP) — photos and quote library
- **Review UI**: Web endpoint to preview generated quote images before publishing
- **Instagram Publishing**: TBD (manual download + upload, or API integration)

## Project Structure

```
src/         → Source code (Next.js app)
templates/   → Instagram-style image templates
quotes/      → Quote source text files
.env         → API keys and config
```

## Commands

```
Build:   <!-- TODO -->
Test:    <!-- TODO -->
Dev:     <!-- TODO -->
Lint:    <!-- TODO -->
```

## Code Style

<!-- TODO: Conventions, naming, patterns -->

## Boundaries
- **Always**: Run tests, validate input, surface assumptions
- **Ask first**: Schema changes, new deps, CI/config changes
- **Never**: Commit secrets, skip tests, guess framework APIs

---

## Agency Skills

This project has access to the **AI Software Agency** — a full software development lifecycle orchestration system.

### Phase 1 — Requirements & Contracting
- `agency-orchestrate` — Full pipeline manager (starts here)
- `agency-grill` — Requirements extraction interview
- `agency-spec` — PRD + technical spec generation

### Phase 2 — Development (autonomous)
- Managed by `agency-orchestrate` — coding agents execute from specs

### Phase 3 — Testing, Learning & Review
- `agency-review` — Code review orchestration
- `agency-retro` — Retrospective + learning capture
- `agency-report` — Status reporting and dashboards

### Setup
- `agency-import` — One-command bootstrap for new projects

### Knowledge Base
The agency maintains a persistent knowledge base at `docs/agency/`. Every agent reads this on start and writes back on completion. Key files:

| File | Purpose |
|------|---------|
| `docs/agency/README.md` | Entry point — read this first |
| `docs/agency/phase.md` | Current phase and step status |
| `docs/agency/decisions.md` | Key decisions with rationale |
| `docs/agency/session-log.md` | Chronological session journal |
| `docs/agency/state/current-task.md` | Active task state for resume |

To resume: read `docs/agency/README.md` → `docs/agency/phase.md` → `docs/agency/state/current-task.md`.

To start: tell the Director your high-level intent. The agency handles the rest.
