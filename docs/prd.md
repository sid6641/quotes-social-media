# PRD: quotes-social-media

## Overview
An automated quote-image generator that takes background templates and quote text, feeds them through Gemini with engineered prompts, and produces Instagram-ready images. The user reviews generated images in a web UI, approves the best ones, and either downloads them or (post-MVP) publishes directly to Instagram.

## Problem Statement
Manually creating Instagram quote images is slow and repetitive. This project automates the workflow: maintain a library of backgrounds and quotes, let Gemini handle the image composition, review and pick the best results.

## Goals & Non-Goals

**Goals:**
- Generate 10 publish-ready Instagram images in a single batch
- Produce images that look polished enough to post without editing
- Let the user review and approve/reject each image before publishing
- Support both CLI and web-triggered generation

**Non-Goals:**
- Don't build a scheduling/cron system (future)
- Don't build a quote CMS (editing text files is fine for MVP)
- Don't optimize for reliability (minimal error handling)

## User Personas

| Persona | Description | Needs |
|---------|-------------|-------|
| Captain (you) | Side-project owner running this locally | Generate, review, and publish 10 IG quote images daily with minimal friction |

## User Stories

1. As a user, I want to add quotes to a text file so the app has content to work with.
2. As a user, I want to drop background images into a templates folder so the app has visual material to compose with.
3. As a user, I want to run a CLI command that generates a batch of quote images so I don't need to open a browser to trigger it.
4. As a user, I want to click a button on a web page to generate a batch so I have a visual option too.
5. As a user, I want to see all generated images side-by-side on a review page so I can compare and pick the best ones.
6. As a user, I want to approve or reject each image individually so I curate what gets published.
7. As a user, I want to download approved images so I can post them to Instagram.
8. As a user, I want prompt templates to be editable so I can tune the image quality over time.
9. (Post-MVP) As a user, I want approved images to auto-publish to my Instagram account.

## Flows

### Flow 1: Generate via CLI
1. User adds quotes to `quotes/` and backgrounds to `templates/`
2. User runs `npm run generate` in terminal
3. System picks a subset of quotes + backgrounds, builds prompts using prompt templates
4. System sends prompts + images to Gemini API
5. Gemini returns generated Instagram images
6. Images are saved to an output directory (`output/`)
7. System prints a link to the review page

### Flow 2: Generate via Web
1. User visits the review page
2. User clicks "Generate" button
3. Same backend flow as CLI
4. Page refreshes with new images displayed

### Flow 3: Review & Approve
1. User opens the review page
2. All generated images shown in a grid (thumbnails)
3. Each image has Approve / Reject buttons
4. Approved images are flagged for download/publishing
5. User clicks "Download Approved" to save a zip

## Acceptance Criteria

### Feature: Image Generation
- [ ] Given a quotes file and templates folder, when I run `npm run generate`, then 10 images are created in the output directory
- [ ] Given the review page, when I click "Generate", then the batch runs and new images appear
- [ ] Given a prompt template with styling instructions, when the generation runs, then Gemini respects the styling directives

### Feature: Review Page
- [ ] Given a completed batch, when I visit the review page, then all generated images are displayed in a grid
- [ ] Given an image in the grid, when I click "Approve", then it's marked as approved
- [ ] Given an image in the grid, when I click "Reject", then it's marked as rejected
- [ ] Given at least one approved image, when I click "Download Approved", then a download of approved images starts

### Feature: Quote & Template Management
- [ ] Given a new quote added to `quotes/`, when generation runs, then the new quote is available for selection
- [ ] Given a new background added to `templates/`, when generation runs, then the new background is available for selection

## Open Questions
- How many background templates to ship with initially?
- Should quotes be fully AI-generated or curated from a fixed file?
- What's the initial set of prompt templates?
