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
import { getAccount, getAccountDir } from "../lib/account";
import { createLogger } from "../lib/logger";
const log = createLogger("publish");

export interface PublishOptions {
  force?: boolean;
  dryRun?: boolean;
  status?: boolean;
  accountId?: string;
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
  log.info(stats, "📊 Publish Queue Status");

  if (stats.queued > 0) {
    log.info({ queuedCount: stats.queued }, `📋 ${stats.queued} queued items`);
  }

  if (stats.failed > 0) {
    log.warn({ failedCount: stats.failed }, `❌ ${stats.failed} failed items`);
  }
}

/**
 * Run the publish pipeline.
 */
export async function runPublish(options: PublishOptions = {}): Promise<void> {
  const { force, dryRun, accountId } = options;
  const accountDir = accountId ? getAccountDir(accountId) : undefined;

  if (options.status) {
    const stats = getQueueStats(accountDir);
    log.info(stats, "📊 Publish Queue Status");
    return;
  }

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
        }, accountDir);
      }
    }
  }

  const dueItems = getDueItems(accountDir);

  if (dueItems.length === 0) {
    const queued = getQueue("queued", accountDir);
    if (queued.length > 0) {
      log.info({ queued: queued.length, nextAt: queued[0].scheduledAt }, "📭 No items due yet");
    } else {
      log.info("📭 Queue is empty. Approve images first.");
    }
    return;
  }

  log.info({ dueCount: dueItems.length }, `📤 ${dueItems.length} item(s) due`);

  if (dryRun) {
    log.info({ dryRun: true, items: dueItems.map(i => ({ quote: i.quote.substring(0, 40), file: i.filename })) }, "📋 Dry run preview");
    return;
  }

  const results = await processQueue(accountDir, accountId);

  const published = results.filter((r) => r.status === "published");
  const failed = results.filter((r) => r.status === "failed");

  log.info({ published: published.length, failed: failed.length }, `📊 ${published.length} published, ${failed.length} failed`);
}
