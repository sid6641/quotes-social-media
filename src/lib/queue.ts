/**
 * Publish queue management.
 *
 * When images are approved, they go into the publish queue and are
 * scheduled for the next daily publish slot. A CLI command processes
 * due items and publishes them.
 *
 * Supports per-account queues via an optional accountDir parameter.
 * When accountDir is provided, the queue file lives at:
 *   <accountDir>/publish-queue.json
 */
import path from "path";
import type { CaptionData } from "./caption";
import { createFileStore, type JsonStore } from "./json-store";

const OUTPUT_DIR = path.resolve(process.cwd(), "output");
const GLOBAL_QUEUE_PATH = path.join(OUTPUT_DIR, "publish-queue.json");

export interface QueueEntry {
  id: string;
  batchId: string;
  imageId: string;
  filename: string;
  quote: string;
  template: string;
  caption: { commentary: string; hashtags: string[] };
  scheduledAt: string;
  status: "queued" | "publishing" | "published" | "failed";
  publishedAt?: string;
  error?: string;
}

// ─── Store (replaces private read/write/cache pattern) ────────────────

const globalStore = createFileStore<QueueEntry[]>(GLOBAL_QUEUE_PATH, []);
const accountStores = new Map<string, JsonStore<QueueEntry[]>>();

function getStore(accountDir?: string): JsonStore<QueueEntry[]> {
  if (!accountDir) return globalStore;
  let store = accountStores.get(accountDir);
  if (!store) {
    store = createFileStore<QueueEntry[]>(
      path.join(accountDir, "publish-queue.json"),
      []
    );
    accountStores.set(accountDir, store);
  }
  return store;
}

function readQueue(accountDir?: string): QueueEntry[] {
  return getStore(accountDir).get();
}

function writeQueue(data: QueueEntry[], accountDir?: string): void {
  getStore(accountDir).set(data);
}

export function invalidateQueueCache(): void {
  globalStore.invalidate();
}

/**
 * Parse daily publish time from env var or default to 09:00.
 */
function getPublishTime(): { hour: number; minute: number } {
  const raw = process.env.PUBLISH_TIME || "09:00";
  const parts = raw.split(":");
  return {
    hour: parseInt(parts[0], 10) || 9,
    minute: parseInt(parts[1], 10) || 0,
  };
}

/**
 * Calculate the next daily publish slot as an ISO string.
 * If current time is before today's publish time, returns today.
 * Otherwise returns tomorrow.
 */
export function getNextScheduledTime(): string {
  const now = new Date();
  const { hour, minute } = getPublishTime();

  const today = new Date(now);
  today.setHours(hour, minute, 0, 0);

  if (now < today) {
    return today.toISOString();
  }

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.toISOString();
}

/**
 * Generate a unique queue entry ID.
 */
function generateQueueId(accountDir?: string): string {
  const entries = readQueue(accountDir);
  const seq = entries.length + 1;
  return `pub-${String(seq).padStart(3, "0")}`;
}

/**
 * Add an image to the publish queue.
 * Returns the created queue entry.
 */
export function addToQueue(
  params: {
    batchId: string;
    imageId: string;
    filename: string;
    quote: string;
    template: string;
    caption?: CaptionData;
  },
  accountDir?: string
): QueueEntry {
  const queue = readQueue(accountDir);

  // Avoid duplicates — if already queued, skip
  const existing = queue.find(
    (e) => e.batchId === params.batchId && e.imageId === params.imageId
  );
  if (existing) return existing;

  const entry: QueueEntry = {
    id: generateQueueId(accountDir),
    batchId: params.batchId,
    imageId: params.imageId,
    filename: params.filename,
    quote: params.quote,
    template: params.template,
    caption: params.caption || { commentary: "", hashtags: [] },
    scheduledAt: getNextScheduledTime(),
    status: "queued",
  };

  queue.push(entry);
  writeQueue(queue, accountDir);
  return entry;
}

/**
 * Remove an entry from the publish queue.
 */
export function removeFromQueue(id: string, accountDir?: string): boolean {
  const queue = readQueue(accountDir);
  const index = queue.findIndex((e) => e.id === id);
  if (index === -1) return false;

  queue.splice(index, 1);
  writeQueue(queue, accountDir);
  return true;
}

/**
 * Remove all queue entries for a specific image (e.g., when rejected).
 */
export function removeImageFromQueue(
  batchId: string,
  imageId: string,
  accountDir?: string
): boolean {
  const queue = readQueue(accountDir);
  const index = queue.findIndex(
    (e) => e.batchId === batchId && e.imageId === imageId
  );
  if (index === -1) return false;

  queue.splice(index, 1);
  writeQueue(queue, accountDir);
  return true;
}

/**
 * Get all queue entries, optionally filtered by status.
 */
export function getQueue(
  status?: QueueEntry["status"],
  accountDir?: string
): QueueEntry[] {
  const queue = readQueue(accountDir);
  if (!status) return [...queue];
  return queue.filter((e) => e.status === status);
}

/**
 * Get queue entries that are due for publishing.
 */
export function getDueItems(accountDir?: string): QueueEntry[] {
  const now = new Date();
  return readQueue(accountDir).filter(
    (e) => e.status === "queued" && new Date(e.scheduledAt) <= now
  );
}

/**
 * Mark a queue entry as published.
 */
export function markPublished(id: string, accountDir?: string): boolean {
  const queue = readQueue(accountDir);
  const entry = queue.find((e) => e.id === id);
  if (!entry) return false;

  entry.status = "published";
  entry.publishedAt = new Date().toISOString();
  writeQueue(queue, accountDir);
  return true;
}

/**
 * Mark a queue entry as failed.
 */
export function markFailed(id: string, error: string, accountDir?: string): boolean {
  const queue = readQueue(accountDir);
  const entry = queue.find((e) => e.id === id);
  if (!entry) return false;

  entry.status = "failed";
  entry.error = error;
  writeQueue(queue, accountDir);
  return true;
}

/**
 * Update the caption of a queue entry (e.g., when user picks a different option
 * after the image was already approved and queued).
 */
export function updateQueueEntryCaption(
  batchId: string,
  imageId: string,
  caption: { commentary: string; hashtags: string[] },
  accountDir?: string
): boolean {
  const queue = readQueue(accountDir);
  const entry = queue.find(
    (e) => e.batchId === batchId && e.imageId === imageId && e.status === "queued"
  );
  if (!entry) return false;

  entry.caption = caption;
  writeQueue(queue, accountDir);
  return true;
}

/**
 * Get queue statistics.
 */
export function getQueueStats(accountDir?: string): {
  total: number;
  queued: number;
  published: number;
  failed: number;
  nextScheduledAt: string | null;
} {
  const queue = readQueue(accountDir);
  const nextDue = queue
    .filter((e) => e.status === "queued")
    .sort(
      (a, b) =>
        new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
    );

  return {
    total: queue.length,
    queued: queue.filter((e) => e.status === "queued").length,
    published: queue.filter((e) => e.status === "published").length,
    failed: queue.filter((e) => e.status === "failed").length,
    nextScheduledAt: nextDue.length > 0 ? nextDue[0].scheduledAt : null,
  };
}

/**
 * Process due items in the publish queue.
 * For now (Instagram restricted), this simulates publishing by marking
 * items as published. When IG is unblocked, the actual publish logic
 * plugs in here.
 *
 * @param accountDir Optional account directory for per-account queues
 * @returns Array of processed entry IDs with their result status
 */
export async function processQueue(
  accountDir?: string,
  accountId?: string
): Promise<
  Array<{ id: string; status: "published" | "failed"; error?: string }>
> {
  const dueItems = getDueItems(accountDir);
  const results: Array<{
    id: string;
    status: "published" | "failed";
    error?: string;
  }> = [];

  const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

  for (const item of dueItems) {
    try {
      // Build the publicly accessible image URL
      const imageUrl = `${BASE_URL}/api/images/${item.filename}`;

      // Build caption from the stored caption data
      const captionText = item.caption?.commentary || "";
      const hashtagStr = item.caption?.hashtags?.join(" ") || "";
      const fullCaption = hashtagStr ? `${captionText}\n\n${hashtagStr}` : captionText;

      // Attempt to publish to Instagram
      const { publishToInstagram } = await import("./instagram");
      const { mediaId } = await publishToInstagram(imageUrl, fullCaption, accountId);

      // Mark as published on success
      markPublished(item.id, accountDir);
      results.push({ id: item.id, status: "published" });

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);

      // If Instagram isn't configured, fall back to simulated publish
      if (msg.includes("not configured")) {
        const success = markPublished(item.id, accountDir);
        if (success) {
          results.push({ id: item.id, status: "published" });
          continue;
        }
      }

      markFailed(item.id, msg, accountDir);
      results.push({ id: item.id, status: "failed", error: msg });
    }
  }

  return results;
}
