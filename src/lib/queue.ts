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
import fs from "fs";
import path from "path";
import type { CaptionData } from "./caption";

const OUTPUT_DIR = path.resolve(process.cwd(), "output");
const GLOBAL_QUEUE_PATH = path.join(OUTPUT_DIR, "publish-queue.json");

/** Resolve the queue file path for a given account directory. */
function getQueuePath(accountDir?: string): string {
  return accountDir
    ? path.join(accountDir, "publish-queue.json")
    : GLOBAL_QUEUE_PATH;
}

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

function ensureOutputDir(dir?: string): void {
  const target = dir || OUTPUT_DIR;
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }
}

function readQueue(accountDir?: string): QueueEntry[] {
  if (!accountDir && queueCache) return queueCache;
  const qPath = getQueuePath(accountDir);
  ensureOutputDir(accountDir);
  if (!fs.existsSync(qPath)) {
    if (!accountDir) queueCache = [];
    return [];
  }
  try {
    const raw = fs.readFileSync(qPath, "utf-8");
    const data = JSON.parse(raw);
    const entries = Array.isArray(data) ? data : [];
    if (!accountDir) queueCache = entries;
    return entries;
  } catch {
    if (!accountDir) queueCache = [];
    return [];
  }
}

function writeQueue(data: QueueEntry[], accountDir?: string): void {
  const qPath = getQueuePath(accountDir);
  ensureOutputDir(accountDir);
  fs.writeFileSync(qPath, JSON.stringify(data, null, 2), "utf-8");
  if (!accountDir) queueCache = data;
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
  accountDir?: string
): Promise<
  Array<{ id: string; status: "published" | "failed"; error?: string }>
> {
  const dueItems = getDueItems(accountDir);
  const results: Array<{
    id: string;
    status: "published" | "failed";
    error?: string;
  }> = [];

  for (const item of dueItems) {
    try {
      const success = markPublished(item.id, accountDir);
      if (success) {
        results.push({ id: item.id, status: "published" });
      } else {
        results.push({ id: item.id, status: "failed", error: "Queue entry not found" });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      markFailed(item.id, msg, accountDir);
      results.push({ id: item.id, status: "failed", error: msg });
    }
  }

  return results;
}
