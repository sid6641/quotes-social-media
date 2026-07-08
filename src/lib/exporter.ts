/**
 * Content calendar exporter.
 *
 * Takes approved images from the manifest and produces a day-by-day
 * content calendar ready for manual posting. Each day gets:
 *   - A copied image file
 *   - A caption text file with hashtags
 *   - JSON metadata for the full calendar
 *
 * This bypasses the Instagram API restriction — you get a folder of
 * ready-to-post content you can manually upload.
 */

import fs from "fs";
import path from "path";
import { createLogger } from "./logger";
import { getAccount, getAccountDir, getAccountImagesDir } from "./account";
import { getQueue } from "./queue";
import type { ImageEntry, Manifest } from "./manifest";

const log = createLogger("exporter");

/** One day in the exported content calendar. */
export interface CalendarEntry {
  /** 1-indexed day number (1 = first day) */
  day: number;
  /** ISO date string like "2026-07-09" */
  date: string;
  /** Quote text that was used */
  quote: string;
  /** Full caption text (commentary + hashtags) */
  captionText: string;
  /** Hashtags as a space-joined string ready to copy-paste */
  hashtagsString: string;
  /** Original image filename in the manifest */
  imageFilename: string;
  /** Path to the exported image (relative to export dir) */
  exportedImagePath: string;
  /** Path to the exported caption text file (relative to export dir) */
  exportedCaptionPath: string;
  /** Source batch ID */
  batchId: string;
  /** Source image ID in the manifest */
  imageId: string;
}

/** Full export result. */
export interface ExportResult {
  /** Account ID, or "default" */
  account: string;
  /** ISO date the export was generated */
  exportDate: string;
  /** First day of the calendar */
  startDate: string;
  /** Last day of the calendar */
  endDate: string;
  /** Total days covered */
  totalDays: number;
  /** Total images exported */
  totalImages: number;
  /** Calendar entries sorted by day */
  entries: CalendarEntry[];
  /** Path to the exported JSON calendar file */
  calendarFilePath: string;
  /** Directory containing the exported content files */
  contentDir: string;
}

export interface ExportOptions {
  /** Account ID to export for. Uses global dir if not set. */
  accountId?: string;
  /** Number of days to schedule content for (default: 7) */
  days?: number;
  /** Override the output root (default: output/exports/) */
  outputDir?: string;
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Format a date as YYYY-MM-DD.
 */
function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Build caption text from a caption data object.
 */
function buildCaptionText(caption: { commentary: string; hashtags: string[] }): {
  captionText: string;
  hashtagsString: string;
} {
  const hashtagsString = caption.hashtags.join(" ");
  const captionText = caption.hashtags.length > 0
    ? `${caption.commentary}\n\n${hashtagsString}`
    : caption.commentary;
  return { captionText, hashtagsString };
}

/**
 * Read the manifest file directly for a given directory (supports account scoping).
 */
function readManifestFromDir(dir: string): Manifest[] {
  const manifestPath = path.join(dir, "manifest.json");
  if (!fs.existsSync(manifestPath)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    if (Array.isArray(data)) return data;
    return [data];
  } catch {
    return [];
  }
}

/**
 * Collect approved images from the manifest, optionally scoped to an account.
 *
 * This looks through ALL batches (not just the latest) to find approved images
 * that aren't already published.
 */
function collectApprovedImages(accountId?: string): Array<{
  image: ImageEntry;
  batch: Manifest;
}> {
  const accountDir = accountId ? getAccountDir(accountId) : undefined;
  const outputDir = accountDir || path.resolve(process.cwd(), "output");

  // Read manifest from the appropriate directory (supports account scoping)
  const allManifests = readManifestFromDir(outputDir);
  if (allManifests.length === 0) return [];

  // Get already-published image IDs from the queue
  const queueDir = accountDir || undefined;
  const queueEntries = getQueue(undefined, queueDir);
  const publishedIds = new Set(
    queueEntries
      .filter((e) => e.status === "published")
      .map((e) => `${e.batchId}:${e.imageId}`)
  );

  const results: Array<{ image: ImageEntry; batch: Manifest }> = [];

  for (const manifest of allManifests) {
    for (const image of manifest.images) {
      if (image.status !== "approved") continue;
      const key = `${manifest.batch.id}:${image.id}`;
      // Skip already-published images
      if (publishedIds.has(key)) continue;
      results.push({ image, batch: manifest });
    }
  }

  return results;
}

/**
 * Export a content calendar.
 *
 * Reads approved images, schedules them over the next N days, copies
 * image files and writes caption files to an export directory, and
 * returns a full calendar JSON.
 */
export async function exportContentCalendar(
  options: ExportOptions = {}
): Promise<ExportResult> {
  const { accountId, days = 7 } = options;
  const exportRoot = options.outputDir || path.resolve(process.cwd(), "output", "exports");

  // Resolve account info
  let accountLabel = "default";
  let accountSlug = "default";
  if (accountId) {
    const account = getAccount(accountId);
    if (!account) {
      throw new Error(`Account "${accountId}" not found`);
    }
    accountLabel = account.name || accountId;
    accountSlug = accountId;
  }

  // Resolve image source directory
  const imagesDir = accountId ? getAccountImagesDir(accountId) : path.resolve(process.cwd(), "output", "images");

  // Collect approved images
  const approved = collectApprovedImages(accountId);

  if (approved.length === 0) {
    log.warn({ account: accountSlug }, "No approved images found to export");
    return {
      account: accountSlug,
      exportDate: formatDate(new Date()),
      startDate: formatDate(new Date()),
      endDate: formatDate(new Date()),
      totalDays: 0,
      totalImages: 0,
      entries: [],
      calendarFilePath: "",
      contentDir: "",
    };
  }

  // Build the content directory
  const contentDir = path.join(exportRoot, `${accountSlug}-content`);
  ensureDir(contentDir);

  // Schedule images over days
  const today = new Date();
  const entries: CalendarEntry[] = [];
  const maxDays = Math.min(days, approved.length);

  for (let i = 0; i < maxDays; i++) {
    const { image, batch } = approved[i];
    const postDate = new Date(today);
    postDate.setDate(postDate.getDate() + (i + 1)); // Start tomorrow
    const dateStr = formatDate(postDate);

    // Determine the primary caption to use
    const primaryCaption = image.caption || (image.captions && image.captions[0]);
    if (!primaryCaption) {
      log.warn({ imageId: image.id }, "Skipping image with no caption");
      continue;
    }

    const { captionText, hashtagsString } = buildCaptionText(primaryCaption);

    // Build file paths
    const dayPrefix = String(i + 1).padStart(2, "0");
    const imgExt = path.extname(image.filename) || ".jpg";
    const exportedImageName = `${dayPrefix}-${dateStr}${imgExt}`;
    const exportedCaptionName = `${dayPrefix}-${dateStr}-caption.txt`;

    const exportedImagePath = path.join(contentDir, exportedImageName);
    const exportedCaptionPath = path.join(contentDir, exportedCaptionName);

    // Copy image file
    const sourceImagePath = path.join(imagesDir, image.filename);
    if (fs.existsSync(sourceImagePath)) {
      fs.copyFileSync(sourceImagePath, exportedImagePath);
    } else {
      log.warn({ sourceImagePath }, "Source image not found, skipping copy");
    }

    // Write caption text file
    const captionFileContent = [
      `📅 ${dateStr}`,
      `📝 "${image.quote}"`,
      `---`,
      captionText,
      ``,
      `---`,
      `Tags: ${hashtagsString}`,
    ].join("\n");
    fs.writeFileSync(exportedCaptionPath, captionFileContent, "utf-8");

    entries.push({
      day: i + 1,
      date: dateStr,
      quote: image.quote,
      captionText,
      hashtagsString,
      imageFilename: image.filename,
      exportedImagePath: exportedImageName,
      exportedCaptionPath: exportedCaptionName,
      batchId: batch.batch.id,
      imageId: image.id,
    });
  }

  // Write the calendar JSON
  const startDate = entries.length > 0 ? entries[0].date : formatDate(today);
  const endDate = entries.length > 0 ? entries[entries.length - 1].date : formatDate(today);

  const result: ExportResult = {
    account: accountSlug,
    exportDate: formatDate(today),
    startDate,
    endDate,
    totalDays: maxDays,
    totalImages: entries.length,
    entries,
    calendarFilePath: path.join(exportRoot, `calendar-${accountSlug}-${formatDate(today)}.json`),
    contentDir,
  };

  // Write the calendar JSON
  ensureDir(exportRoot);
  fs.writeFileSync(result.calendarFilePath, JSON.stringify(result, null, 2), "utf-8");

  log.info(
    { account: accountSlug, days: maxDays, entries: entries.length, path: result.calendarFilePath },
    "Content calendar exported"
  );

  return result;
}
