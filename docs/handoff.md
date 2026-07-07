# Handoff Package: quotes-social-media

## Summary
An automated quote-image generator that takes background templates and quote text, feeds them through Gemini with engineered prompts, and produces Instagram-ready images. The user reviews generated images in a web UI, approves the best ones, and downloads them for posting. Post-MVP extension adds auto-publishing via Instagram Graph API.

## Contract
- **Client**: Captain (sidkumar) — personal side project
- **PRD approved**: 2026-07-07
- **Technical spec approved**: 2026-07-07
- **Priority**: Medium — no hard deadline
- **Timeline**: No fixed date — build iteratively

## Deliverables

1. **CLI generation** — `npm run generate` picks quotes + templates, sends to Gemini, saves output images
2. **Web generation** — Button on the review page triggers the same generation flow
3. **Review page** — Web UI with image grid, approve/reject per image, download approved as zip
4. **Project scaffolding** — Next.js project with proper folder structure (`quotes/`, `templates/`, `prompts/`, `output/`)
5. **Prompt template system** — Editable prompt templates in `prompts/` folder with `{{variable}}` substitution
6. **Gemini integration** — API client that sends prompt + background image + quote for end-to-end image generation

## Key Decisions (DO NOT REOPEN)

1. **Gemini does the rendering** — No Canvas/Sharp compositing. Gemini handles full image generation from prompt + background + quote.
2. **File-based state** — No database. JSON manifest at `output/manifest.json` tracks approvals.
3. **10 images per batch** — Fixed batch size for MVP.
4. **Quality over reliability** — Minimal error handling. If Gemini fails, surface the error. No retries.
5. **1080x1080 square** — Standard Instagram post format only.

## Open Questions (Dev Team Can Decide)

1. **Gemini model selection** — Use the latest available model with image generation capabilities. Update `prompts/default.md` if model behavior changes.
2. **Quote deduplication** — Simple check against previously used quotes in the manifest.
3. **Template rotation** — Basic round-robin or random pick. Can be improved later.

## Constraints
- **API key**: User provides `GEMINI_API_KEY` in `.env` — the app must check for it and fail gracefully if missing
- **No external hosting**: Runs locally (`localhost`) in development
- **No database**: Everything is file-based for MVP
- **No auth**: Local-only. No login, no multi-user

## Quality Expectations
- **Image quality** is the #1 priority — prompt templates should be well-crafted
- **No automated tests required** for MVP (but core logic should be testable)
- **Code review**: Reviewer agent will audit before merge
- **Performance**: No specific targets (single-user local app)

## Client Communication
- **Status updates**: Via Director — the client will see commits and be asked to review
- **Escalation path**: If a decision in the spec is unclear, flag it in the PR — don't guess
- **Change process**: Any scope change must go through the Director and client approval

## Files
- `docs/requirements-brief.md` — Original requirements
- `docs/prd.md` — Product spec (client-approved)
- `docs/technical-spec.md` — Technical spec (client-approved)
- `docs/handoff.md` — This file
