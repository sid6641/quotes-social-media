/**
 * Publish CLI command — process the publish queue.
 *
 * Usage:
 *   npm run cli publish              # Process due items only
 *   npm run cli publish -- --force   # Publish all queued items regardless of schedule
 *   npm run cli publish -- --dry-run # Show what would be published without doing it
 *   npm run cli publish -- --status  # Show queue status
 */
import {
  getQueue,
  getDueItems,
  processQueue,
  getQueueStats,
  addToQueue,
} from "../lib/queue";
import { getLatestBatch } from "../lib/manifest";

export interface PublishOptions {
  force?: boolean;
  dryRun?: boolean;
  status?: boolean;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Show the current publish queue status.
 */
function showStatus(): void {
  const stats = getQueueStats();

  console.log("📊 Publish Queue Status\n");
  console.log(`   Total entries: ${stats.total}`);
  console.log(`   ⏳ Queued:      ${stats.queued}`);
  console.log(`   ✅ Published:   ${stats.published}`);
  console.log(`   ❌ Failed:      ${stats.failed}`);

  if (stats.nextScheduledAt) {
    console.log(`   📅 Next publish: ${formatDate(stats.nextScheduledAt)}`);
  }

  if (stats.queued > 0) {
    const queued = getQueue("queued");
    console.log(`\n📋 Queued Items:`);
    for (const item of queued) {
      console.log(
        `   • "${item.quote.substring(0, 50)}..." → ${formatDate(item.scheduledAt)}`
      );
    }
  }

  if (stats.failed > 0) {
    const failed = getQueue("failed");
    console.log(`\n❌ Failed Items:`);
    for (const item of failed) {
      console.log(
        `   • "${item.quote.substring(0, 50)}..." — ${item.error || "Unknown error"}`
      );
    }
  }
}

/**
 * Run the publish pipeline.
 */
export async function runPublish(options: PublishOptions = {}): Promise<void> {
  if (options.status) {
    showStatus();
    return;
  }

  const { force, dryRun } = options;

  // If --force, queue all pending items from the latest approved batch
  if (force) {
    const latestBatch = await getLatestBatch();
    if (latestBatch) {
      const approved = latestBatch.images.filter(
        (img) => img.status === "approved"
      );
      for (const img of approved) {
        addToQueue({
          batchId: latestBatch.batch.id,
          imageId: img.id,
          filename: img.filename,
          quote: img.quote,
          template: img.template,
          caption: img.caption,
        });
      }
    }
  }

  const dueItems = getDueItems();

  if (dueItems.length === 0) {
    console.log("📭 No items due for publishing.");
    const queued = getQueue("queued");
    if (queued.length > 0) {
      console.log(`   ${queued.length} item(s) queued but not yet due.`);
      console.log(
        `   First scheduled: ${formatDate(queued[0].scheduledAt)}`
      );
    } else {
      console.log("   Queue is empty. Approve some images first.");
    }
    return;
  }

  console.log(`📤 Publishing ${dueItems.length} item(s)...\n`);

  if (dryRun) {
    for (const item of dueItems) {
      console.log(`   [DRY RUN] Would publish:`);
      console.log(`      Quote: "${item.quote}"`);
      console.log(`      Caption: ${item.caption.commentary}`);
      console.log(`      Hashtags: ${item.caption.hashtags.join(" ")}`);
      console.log(`      File: ${item.filename}`);
      console.log();
    }
    console.log(`✅ Dry run complete. ${dueItems.length} item(s) ready to publish.`);
    return;
  }

  const results = await processQueue();

  const published = results.filter((r) => r.status === "published");
  const failed = results.filter((r) => r.status === "failed");

  for (const r of results) {
    if (r.status === "published") {
      console.log(`   ✅ Published: ${r.id}`);
    } else {
      console.log(`   ❌ Failed: ${r.id} — ${r.error || "Unknown error"}`);
    }
  }

  console.log(`\n📊 Results: ${published.length} published, ${failed.length} failed`);
}
