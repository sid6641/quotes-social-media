# Requirements Brief: quotes-social-media

## Problem Statement
Manually creating Instagram quote images is slow and repetitive. This project automates the process: maintain a library of background templates and quotes, then use Gemini to generate publish-ready Instagram images in batches, with a review step to pick the best ones.

## Success Criteria
- Generate 10 Instagram-ready images per day in a single batch
- Review and approve/reject images via a web endpoint
- Approved images are ready to download (MVP) or auto-publish (post-MVP extension)
- Image quality is high enough to post without further editing

## Scope
**In (MVP)**:
- Plain text quote library in `quotes/` folder
- Background image templates in `templates/` folder
- Quote generation via Gemini API (on-demand)
- Image generation via Gemini API (background + quote → finished IG asset)
- Crafted prompt templates to control image output quality
- CLI command (`npm run generate`) to trigger batch generation
- Web button on review page to trigger generation
- Review web endpoint — side-by-side preview, approve/reject
- Download approved images

**Out (MVP)**:
- Instagram Graph API auto-publishing — first extension after MVP
- Daily cron scheduler
- Smart template rotation / de-duplication
- Hashtag generation
- Analytics / performance tracking
- Quote CMS web UI
- Multi-account support

**MVP**: CLI trigger → generate 10 images → review → download. That's it.

## Timeline & Constraints
- No hard deadline — personal side project
- No budget constraints (standard Gemini API costs)
- Single developer (Captain)

## Users
| Persona | Goal | Key Flow |
|---------|------|----------|
| Captain (you) | Generate, review, and publish 10 Instagram quote images daily | Add quotes → add templates → generate batch → review → download/post |

## Tech Stack
- **Framework**: Next.js + TypeScript
- **Image Generation**: Gemini API (end-to-end — prompt + background + quote → finished asset)
- **Prompt Engineering**: Crafted system prompts ("prompt templates") that control typography, layout, contrast, and styling
- **Storage**: Local filesystem (MVP)
- **Review UI**: Next.js web endpoint
- **Publishing**: Manual download (MVP) → Instagram Graph API (post-MVP)

## Non-Functionals
- **Quality**: Primary focus — images must look polished and publish-ready
- **Performance**: No strict targets (local usage)
- **Reliability**: Minimal effort — error surfacing is sufficient
- **Format**: 1080x1080px square (standard Instagram post)

## Architecture
```
quotes/            → Quote text files (plain text)
templates/         → Background images
prompts/           → Engineered prompt templates for Gemini

CLI (npm run generate) or Web button
  → Pick quote + background + prompt template
  → Send to Gemini API
  → Save generated image
  → Display in review endpoint
  → Approve → download or (future) auto-publish
```

## Risks
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Image quality depends on prompt engineering | M | H | Iterate on prompt templates — this is the core work |
| Gemini quote quality can be generic | M | M | Curate/manual override for important posts |
| Instagram API approval friction | L (post-MVP) | M | Research Meta app review requirements early |
| Background templates need text-safe zones | H | M | Design prompt instructions to adapt text placement per image |

## Open Questions
- What's the initial set of prompt templates? (to be designed during spec)
- How many background templates to start with?
- Should quotes be curated manually or fully AI-generated?
