# Learning: Content Calendar Export (2026-07-08)

## Context
Instagram publishing blocked by Meta anti-spam restriction on new accounts. Needed a way to make the tool useful immediately.

## Solution
Export approved images as a day-by-day content calendar — image files + caption text files + JSON metadata — ready for manual copy-paste posting.

## Patterns Discovered

### Manifest API Limitation
The `manifest.ts` library functions (`getLatestBatch()`, `getApprovedImages()`) only support the global output directory. They don't accept an `outputDir` parameter like the queue functions do. The internal `readManifestFromDir(dir)` function exists but isn't exposed.

**Fix**: The exporter reads the manifest file directly via `fs` instead of using the exported manifest functions. If account-scoped manifest support is needed later, the manifest functions should be updated to accept an optional `dir` parameter (like queue functions do).

### Testing Flow
When testing:
1. Generate images: `npm run cli generate -- --count N --account <id>`
2. Approve images: modify manifest directly or use API
3. Export: `npm run cli export -- --account <id> --days N`
4. Output goes to `output/exports/`

### Export File Structure
```
output/exports/
  calendar-<account>-<date>.json    # Full calendar metadata (JSON)
  <account>-content/
    01-YYYY-MM-DD.png               # Copied image
    01-YYYY-MM-DD-caption.txt       # Quote + caption + hashtags
    02-YYYY-MM-DD.png
    02-YYYY-MM-DD-caption.txt
    ...
```

## Key Decision
V1 is filesystem-only — exports to `output/exports/`. No download-from-browser (the files are local). The UI button triggers the API and shows a confirmation with the file path.
