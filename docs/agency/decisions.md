# Decision Log

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

## 2026-07-07: Quality over reliability

### Context
Client cares about publish-ready image quality, not uptime or error recovery.

### Decision
- Primary focus: image composition quality (typography, layout, contrast, aesthetics)
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
