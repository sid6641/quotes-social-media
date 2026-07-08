# Quotes Social Media

Automated quote-image generator for Instagram. Mixes background templates with a quote library, generates polished images via Gemini AI, and lets you review, caption, and publish — all from CLI or web UI.

## Quick Start

```bash
# Install dependencies
npm install

# Set up your API key
cp .env.example .env
# Edit .env with your GEMINI_API_KEY

# Add background images to templates/
# Add quotes to quotes/sample.txt

# Generate a batch
npm run generate

# Review in browser
npm run dev
# → http://localhost:3000
```

## CLI Reference

### `npm run generate`

Generate a batch of 10 images with default settings. Shorthand for `npm run cli generate`.

### `npm run cli generate [options]`

Full CLI with flags.

| Flag | Description | Default |
|------|-------------|---------|
| `--count <n>` | Number of images to generate | `10` |
| `--template <name>` | Prompt template to use | First in `prompts/` |
| `--json` | Output results as JSON | Off (fancy terminal output) |

**Examples:**

```bash
# Generate 10 images (default)
npm run cli generate

# Generate 5 images
npm run cli generate -- --count 5

# Use a specific prompt template with 3 images
npm run cli generate -- --template modern --count 3

# JSON output (pipe to jq)
npm run cli generate -- --json | jq '.images[].filename'
```

### `npm run cli list <resource>`

List available resources.

| Resource | What it shows |
|----------|---------------|
| `quotes` | All quotes from `quotes/` folder |
| `templates` | Template images in `templates/` with file sizes |
| `prompts` | Prompt templates in `prompts/` |

**Examples:**

```bash
npm run cli list quotes
npm run cli list templates
npm run cli list prompts
```

### `npm run cli publish [options]`

Process the publish queue. Publishes items whose scheduled time has passed.

| Flag | Description |
|------|-------------|
| `--status` | Show queue status without publishing |
| `--force` | Queue all approved images first, then publish due |
| `--dry-run` | Preview what would publish without actually doing it |

**Examples:**

```bash
# Show queue status
npm run cli publish -- --status

# Process due items
npm run cli publish

# Preview without publishing
npm run cli publish -- --dry-run

# Queue all approved images, then publish
npm run cli publish -- --force
```

### `npm run cli help` / `npm run cli --help`

Show the full usage guide with all commands, flags, and examples.

```bash
npm run cli help
npm run cli --help
```

## Project Structure

```
quotes-social-media/
├── src/
│   ├── app/            → Next.js web UI + API routes
│   ├── cli/            → CLI entry points
│   │   ├── index.ts    → Command routing (generate, list, help)
│   │   ├── generate.ts → Batch generation logic
│   │   ├── list.ts     → Resource listing
│   │   └── publish.ts  → Publish queue processor
│   └── lib/
│       ├── gemini.ts   → Gemini API client (image generation)
│       ├── caption.ts  → AI caption generation (commentary + hashtags)
│       ├── mixer.ts    → Quote + template combos
│       ├── prompts.ts  → Prompt template loader
│       └── manifest.ts → JSON manifest read/write
├── prompts/            → Prompt templates (editable)
├── quotes/             → Quote text files
├── templates/          → Background images
├── output/             → Generated images + manifest
└── .env                → API keys
```

## Features

- **Image generation** — Gemini AI creates Instagram-ready 1080×1080px quote images
- **Caption pipeline** — Auto-generated commentary + hashtags for every post
- **Review UI** — Web dashboard to preview, approve/reject, and edit captions
- **CLI & Web triggers** — Generate from terminal or browser
- **Publish queue** — Approve images into a queue, publish on schedule

## Tech Stack

- **Framework**: Next.js 14 (App Router) + TypeScript
- **Image Engine**: Google Gemini API (prompt + background → finished asset)
- **Caption Engine**: Gemini text model (gemini-2.0-flash)
- **State**: File-based JSON manifest (no database)
- **Styling**: Tailwind CSS

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GEMINI_API_KEY` | — | **Required.** Gemini API key |
| `GEMINI_MODEL` | `gemini-2.0-flash-exp-image-generation` | Image generation model |
| `GEMINI_TEXT_MODEL` | `gemini-2.0-flash` | Caption generation model |
| `PUBLISH_TIME` | `09:00` | Daily publish queue processing time |

## Roadmap

- [x] MVP — generate, review, approve/reject, download
- [x] Caption pipeline — AI commentary + hashtags
- [x] CLI improvements — flags, subcommands, JSON output
- [x] Publish queue — schedule and auto-publish
- [ ] Instagram publishing (pending account age restriction)
- [ ] Quote scraping from existing pages
- [ ] Reel generation (text-over-video with music)
