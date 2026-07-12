# Quotes Social Media — CLI Cheatsheet

## Account Management

```bash
# Create a new account
npm run cli account create --id dailygrind --name "Daily Grind" --cooldown 30

# List all accounts
npm run cli account list
npm run cli account list --json              # pipeable JSON output

# Get account details
npm run cli account get testplay

# Update account config
npm run cli account update testplay --name "New Name"

# Delete an account
npm run cli account delete testplay
```

## Quote Pool

```bash
# Add a quote
npm run cli quotes add "The only way to do great work is to love what you do."
npm run cli quotes add "Be yourself." --author Oscar Wilde
npm run cli quotes add "My quote" --account testplay   # scoped to account

# List quotes
npm run cli quotes list
npm run cli quotes list --account testplay
npm run cli quotes list --json              # pipeable

# Import quotes from text file
npm run cli quotes import quotes/sample.txt
npm run cli quotes import accounts/testplay/quotes/mine.txt --account testplay

# Pool statistics
npm run cli quotes stats
npm run cli quotes stats --account testplay

# Recycle expired cooldown quotes
npm run cli quotes expire
npm run cli quotes expire --account testplay
```

## Image Generation

```bash
# Generate images (default: 10)
npm run cli generate
npm run cli generate --count 3
npm run cli generate --count 5 --account testplay
npm run cli generate --count 2 --template default.md --account testplay

# Generate all quote × template combinations
npm run cli generate --all --account testplay

# JSON output (pipeable)
npm run cli generate --count 3 --json | jq '.batchId'

# Backward-compatible (default account, 10 images)
npm run generate
```

## Review & Queue

```bash
# Start the review UI (dev server)
npm run dev
# Then open http://localhost:3000

# Via API:
# Approve an image
curl -X POST http://localhost:3000/api/status \
  -H "Content-Type: application/json" \
  -d '{"batchId":"2026-07-11-001","imageId":"img-001","status":"approved","account":"testplay"}'

# Reject an image
curl -X POST http://localhost:3000/api/status \
  -H "Content-Type: application/json" \
  -d '{"batchId":"2026-07-11-001","imageId":"img-002","status":"rejected","account":"testplay"}'

# Check queue
curl http://localhost:3000/api/queue?account=testplay | jq
```

## Publishing

```bash
# Show queue status
npm run cli publish --status
npm run cli publish --status --account testplay

# Process due items (publish)
npm run cli publish --account testplay

# Force publish even if not yet scheduled
npm run cli publish --force --account testplay

# Dry run (show what would happen)
npm run cli publish --dry-run --account testplay
```

## Export Calendar

```bash
# Export 7-day content calendar
npm run cli export --days 7
npm run cli export --days 7 --account testplay

# Via API
curl -X POST http://localhost:3000/api/export \
  -H "Content-Type: application/json" \
  -d '{"days":7,"account":"testplay"}' | jq

# Output: accounts/<id>/output/calendar/ with images + caption files
```

## Autopilot (Scheduled Generation)

```bash
# Run autopilot once (generate images for tomorrow)
npm run cli autopilot
npm run cli autopilot --account testplay --count 5

# Install daily cron at 08:00
npm run cli autopilot --setup-cron

# Check cron status
npm run cli autopilot --cron-status

# Dry run (show what would happen)
npm run cli autopilot --dry-run --account testplay
```

## Reset

```bash
# Wipe ALL generated data (prompts for confirmation)
npm run cli reset

# Force reset (no prompt)
npm run cli reset --force

# JSON output for scripting
npm run cli reset --force --json
```

## Running Tests

```bash
# Run all tests
npm test

# Watch mode (TDD)
npm run test:watch

# Run specific test file
npx vitest run src/lib/mixer.test.ts

# Run tests with coverage
npx vitest run --coverage
```
