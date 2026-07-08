/**
 * Publish queue management.
 *
 * When images are approved, they go into the publish queue and are
 * scheduled for the next daily publish slot. A CLI command processes
 * due items and publishes them.
 */
import fs from "fs";
import path from "path";
import type { CaptionData } from "./caption";

const OUTPUT_DIR = path.resolve(process.cwd(), "output");
const QUEUE_PATH = path.join(OUTPUT_DIR, "publish-queue.json");

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

let queueCache: QueueEntry[] | null = null;

function ensureOutputDir(): void {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
}

function readQueue(): QueueEntry[] {
  if (queueCache) return queueCache;
  ensureOutputDir();
  if (!fs.existsSync(QUEUE_PATH)) {
    queueCache = [];
    return queueCache;
  }
  try {
    const raw = fs.readFileSync(QUEUE_PATH, "utf-8");
    queueCache = JSON.parse(raw);
    return Array.isArray(queueCache) ? queueCache : [];
  } catch {
    queueCache = [];
    return queueCache;
  }
}

function writeQueue(data: QueueEntry[]): void {
  ensureOutputDir();
  fs.writeFileSync(QUEUE_PATH, JSON.stringify(data, null, 2), "utf-8");
}

export function invalidateQueueCache(): void {
  queueCache = null;
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
function generateQueueId(): string {
  const entries = readQueue();
  const seq = entries.length + 1;
  return `pub-${String(seq).padStart(3, "0")}`;
}

/**
 * Add an image to the publish queue.
 * Returns the created queue entry.
 */
export function addToQueue(params: {
  batchId: string;
  imageId: string;
  filename: string;
  quote: string;
  template: string;
  caption?: CaptionData;
}): QueueEntry {
  const queue = readQueue();

  // Avoid duplicates — if already queued, skip
  const existing = queue.find(
    (e) => e.batchId === params.batchId && e.imageId === params.imageId
  );
  if (existing) return existing;

  const entry: QueueEntry = {
    id: generateQueueId(),
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
  writeQueue(queue);
  queueCache = queue;
  return entry;
}

/**
 * Remove an entry from the publish queue.
 */
export function removeFromQueue(id: string): boolean {
  const queue = readQueue();
  const index = queue.findIndex((e) => e.id === id);
  if (index === -1) return false;

  queue.splice(index, 1);
  writeQueue(queue);
  queueCache = queue;
  return true;
}

/**
 * Remove all queue entries for a specific image (e.g., when rejected).
 */
export function removeImageFromQueue(
  batchId: string,
  imageId: string
): boolean {
  const queue = readQueue();
  const index = queue.findIndex(
    (e) => e.batchId === batchId && e.imageId === imageId
  );
  if (index === -1) return false;

  queue.splice(index, 1);
  writeQueue(queue);
  queueCache = queue;
  return true;
}

/**
 * Get all queue entries, optionally filtered by status.
 */
export function getQueue(
  status?: QueueEntry["status"]
): QueueEntry[] {
  const queue = readQueue();
  if (!status) return [...queue];
  return queue.filter((e) => e.status === status);
}

/**
 * Get queue entries that are due for publishing.
 */
export function getDueItems(): QueueEntry[] {
  const now = new Date();
  return readQueue().filter(
    (e) => e.status === "queued" && new Date(e.scheduledAt) <= now
  );
}

/**
 * Mark a queue entry as published.
 */
export function markPublished(id: string): boolean {
  const queue = readQueue();
  const entry = queue.find((e) => e.id === id);
  if (!entry) return false;

  entry.status = "published";
  entry.publishedAt = new Date().toISOString();
  writeQueue(queue);
  queueCache = queue;
  return true;
}

/**
 * Mark a queue entry as failed.
 */
export function markFailed(id: string, error: string): boolean {
  const queue = readQueue();
  const entry = queue.find((e) => e.id === id);
  if (!entry) return false;

  entry.status = "failed";
  entry.error = error;
  writeQueue(queue);
  queueCache = queue;
  return true;
}

/**
 * Update the caption of a queue entry (e.g., when user picks a different option
 * after the image was already approved and queued).
 */
export function updateQueueEntryCaption(
  batchId: string,
  imageId: string,
  caption: { commentary: string; hashtags: string[] }
): boolean {
  const queue = readQueue();
  const entry = queue.find(
    (e) => e.batchId === batchId && e.imageId === imageId && e.status === "queued"
  );
  if (!entry) return false;

  entry.caption = caption;
  writeQueue(queue);
  queueCache = queue;
  return true;
}

/**
 * Get queue statistics.
 */
export function getQueueStats(): {
  total: number;
  queued: number;
  published: number;
  failed: number;
  nextScheduledAt: string | null;
} {
  const queue = readQueue();
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
 * @returns Array of processed entry IDs with their result status
 */
export async function processQueue(): Promise<
  Array<{ id: string; status: "published" | "failed"; error?: string }>
> {
  const dueItems = getDueItems();
  const results: Array<{
    id: string;
    status: "published" | "failed";
    error?: string;
  }> = [];

  for (const item of dueItems) {
    try {
      // TODO: Replace with actual Instagram publish call when IG is unblocked
      // For now, simulate success
      const success = markPublished(item.id);
      if (success) {
        results.push({ id: item.id, status: "published" });
      } else {
        results.push({ id: item.id, status: "failed", error: "Queue entry not found" });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      markFailed(item.id, msg);
      results.push({ id: item.id, status: "failed", error: msg });
    }
  }

  invalidateQueueCache();
  return results;
}
