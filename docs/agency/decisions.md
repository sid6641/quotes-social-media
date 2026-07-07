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
