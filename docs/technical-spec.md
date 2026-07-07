# Technical Spec: quotes-social-media

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Next.js App (TypeScript)                 │
│                                                             │
│  ┌──────────┐   ┌──────────────┐   ┌─────────────────────┐  │
│  │ CLI      │   │ Web UI       │   │ Gemini Service      │  │
│  │ (generate)│   │ (Review Page) │   │ (prompt + API call) │  │
│  └────┬─────┘   └──────┬───────┘   └──────────┬──────────┘  │
│       │                │                       │              │
│       └──────┬─────────┘                       │              │
│              │                                  │              │
│       ┌──────▼──────┐                  ┌───────▼───────┐     │
│       │ Quote Mixer │                  │ Gemini API    │     │
│       │ (pick q + t)│                  │ (generate img) │     │
│       └──────┬──────┘                  └───────┬───────┘     │
│              │                                  │              │
│       ┌──────▼──────┐                           │              │
│       │ Output Dir  │◄──────────────────────────┘              │
│       │ (generated/)│                                        │
│       └─────────────┘                                        │
└─────────────────────────────────────────────────────────────┘

Data sources:
  quotes/       → Plain text files (one quote per line, or markdown)
  templates/    → Background images (JPEG/PNG)
  prompts/      → Prompt templates (text files with {{variables}})
  output/       → Generated images (written by Gemini service)
```

## Tech Stack

- **Frontend**: Next.js (App Router) + TypeScript
- **Image Generation**: Google Gemini API (gemini-2.5-flash or latest available image-capable model)
- **Storage**: Local filesystem (MVP)
- **Styling**: Tailwind CSS (Next.js default)
- **No database**: MVP uses file-based state (JSON manifest for approvals)

## Key Design Decisions

| Decision | Choice | Rationale | Alternatives Considered |
|----------|--------|-----------|------------------------|
| Image rendering approach | Gemini API end-to-end | Simpler — no compositing library needed, quality controlled via prompts | Sharp/Canvas — more control but more code |
| State management | File-based JSON manifest | No DB setup needed for MVP | SQLite, Postgres — overkill for single-user |
| Quote source | Plain text file | Simple, version-controllable | CMS, database — adds complexity |
| Batch size | 10 images per run | User requirement | N/A |

## Project Structure

```
quotes-social-media/
├── src/
│   ├── app/
│   │   ├── page.tsx              → Review page (grid + approve/reject)
│   │   ├── layout.tsx            → Root layout
│   │   └── api/
│   │       └── generate/route.ts → API endpoint for web-triggered generation
│   ├── lib/
│   │   ├── gemini.ts             → Gemini API client (prompt builder + image call)
│   │   ├── mixer.ts              → Quote + template picker logic
│   │   ├── prompts.ts            → Prompt template loader + variable replacer
│   │   └── manifest.ts           → JSON manifest read/write (track approvals)
│   └── cli/
│       └── generate.ts           → CLI entry point (npm run generate)
├── quotes/                       → Quote text files
├── templates/                    → Background images
├── prompts/                      → Prompt templates
│   └── default.md                → Default prompt template (will iterate)
├── output/                       → Generated images + manifest
├── .env                          → GEMINI_API_KEY
├── next.config.js
├── tsconfig.json
└── package.json
```

## API / Integration Points

| Endpoint | Method | Purpose | Auth |
|----------|--------|---------|------|
| `/api/generate` | POST | Trigger a batch of 10 image generations | None (local MVP) |
| Gemini API | POST (external) | Send prompt + background image for generation | API key in .env |

### Gemini API Integration

```typescript
// gemini.ts — concept
// Uses Google Generative AI SDK (@google/generative-ai)
// Sends: prompt template (with styling instructions) + quote text + background image reference
// Receives: generated image (base64 or binary)
// Saves to: output/{timestamp}-{index}.png
```

Key considerations for the Gemini call:
- Background image is sent as a base64 inline data part
- Prompt template is the system instruction — engineered for typography, contrast, layout
- Quote text is inserted into the prompt via variable substitution
- Model: use the latest Gemini model with image generation capabilities

## Data Model

No database. State is stored in a JSON manifest at `output/manifest.json`:

```json
{
  "batch": {
    "id": "2026-07-07-001",
    "generatedAt": "2026-07-07T10:00:00Z",
    "trigger": "cli"
  },
  "images": [
    {
      "id": "img-001",
      "filename": "2026-07-07-001-01.png",
      "quote": "The only way to do great work is to love what you do.",
      "template": "sunset-beach.jpg",
      "promptTemplate": "default.md",
      "status": "pending" // pending | approved | rejected
    }
  ]
}
```

## Prompt Template Format

Prompt templates live in `prompts/` and use `{{variable}}` syntax:

```markdown
# prompts/default.md

You are an expert Instagram quote image designer. Generate a 1080x1080px
square image with the following:

Background: {{background_description}}
Quote text: "{{quote_text}}"

Styling requirements:
- Use elegant serif or sans-serif typography (e.g. Playfair Display, Montserrat)
- Text should be prominently centered or subtly positioned based on the background
- Ensure high contrast — use text shadow or semi-transparent overlay if needed
- Add subtle decorative elements if appropriate (thin lines, gentle gradients)
- The final image should look like a premium Instagram post, ready to publish
- NO watermarks, NO logos, NO external branding
```

## Implementation Notes

1. **Gemini image capabilities**: Verify that the chosen Gemini model supports image generation from text+image prompts. If not, fall back to sending the background as context and having Gemini generate the composite. Test this early.

2. **Prompt iteration**: The prompt template is the main quality lever. Ship with one good default, but make it easy to add more. The `prompts/` folder should be scanned at runtime so new templates are picked up automatically.

3. **File naming**: Output images named `{batch-id}-{index:02d}.png` for easy sorting. Batch ID is date-based (e.g. `2026-07-07-001`).

4. **CLI entry**: `npm run generate` should run via `tsx` or `ts-node` to execute TypeScript directly in CLI context, or compile and run from `dist/`.

## Edge Cases

- **No quotes or templates**: Surface a clear error message telling the user what's missing.
- **Gemini API failure**: Surface the error to the user. No retries (per client decision).
- **Duplicate generation**: Each run creates a new batch. Previous batches remain in `output/` but the review page shows the latest batch.
- **Image size**: Ensure Gemini output is 1080x1080px. Validate dimensions before saving.

## Testing Strategy

- **Unit tests**: Core logic (mixer picks correct template, prompt variable substitution, manifest read/write)
- **Integration test**: Gemini API call with a test quote (requires API key — skip in CI)
- **Manual**: Generate a batch, review in browser, approve/reject, download

## Future Considerations (Not Building Now)

- Instagram Graph API integration — requires Meta app review
- Cron scheduler — would run `npm run generate` daily
- Quote CMS — web UI for managing quotes instead of text files
- Template analytics — track which combinations perform best
