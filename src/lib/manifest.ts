import path from "path";
import type { CaptionData } from "./caption";
import { getAccountDir } from "./account";
import { createFileStore, type JsonStore } from "./json-store";

const OUTPUT_DIR = path.resolve(process.cwd(), "output");
const MANIFEST_PATH = path.join(OUTPUT_DIR, "manifest.json");

export type { CaptionData };

export interface BatchInfo {
  id: string;
  generatedAt: string;
  trigger: "cli" | "web";
}

export interface ImageEntry {
  id: string;
  filename: string;
  quote: string;
  template: string;
  promptTemplate: string;
  status: "pending" | "approved" | "rejected";
  /** All generated caption options (usually 5). */
  captions?: CaptionData[];
  /** The currently active/selected caption (picked from options or edited). */
  caption?: CaptionData;
  /** Index into captions[] that was picked, or -1 if custom-edited. */
  selectedCaptionIndex?: number;
}

export interface Manifest {
  batch: BatchInfo;
  images: ImageEntry[];
}

// ─── Store (replaces private read/write/cache pattern) ────────────────

const globalStore = createFileStore<Manifest[]>(MANIFEST_PATH, []);
const accountStores = new Map<string, JsonStore<Manifest[]>>();

/** Get the store for a given output directory — global or per-account. */
function getStore(dir?: string): JsonStore<Manifest[]> {
  if (!dir) return globalStore;
  let store = accountStores.get(dir);
  if (!store) {
    store = createFileStore<Manifest[]>(path.join(dir, "manifest.json"), []);
    accountStores.set(dir, store);
  }
  return store;
}

function readManifestFromDir(dir?: string): Manifest[] {
  return getStore(dir).get();
}

function writeManifestToDir(data: Manifest[], dir?: string): void {
  getStore(dir).set(data);
}

// Legacy wrappers for backward compat (now delegate to store)
function readManifest(): Manifest[] {
  return readManifestFromDir();
}

function writeManifest(data: Manifest[]): void {
  writeManifestToDir(data);
}

export function generateBatchId(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10); // YYYY-MM-DD
  // Find the next sequence number for today
  const existing = readManifest();
  const todayBatches = existing.filter((m) => m.batch.id.startsWith(date));
  const seq = todayBatches.length + 1;
  return `${date}-${String(seq).padStart(3, "0")}`;
}

/**
 * Create a new batch entry in the manifest.
 *
 * @param captions - Array of CaptionData[] — each element is an array of
 *                   options for that image (e.g. 5 options). The first option
 *                   is used as the default active caption.
 */
export function createBatch(
  images: Array<{ quote: string; template: string; filename: string }>,
  trigger: "cli" | "web",
  promptTemplate: string = "default.md",
  captions?: CaptionData[][],
  outputDir?: string
): Manifest {
  // Use account-specific dir if provided, otherwise global
  const targetDir = outputDir || OUTPUT_DIR;
  const manifests = readManifestFromDir(targetDir);
  const batchId = generateBatchId();

  const manifest: Manifest = {
    batch: {
      id: batchId,
      generatedAt: new Date().toISOString(),
      trigger,
    },
    images: images.map((img, index) => {
      const options = captions?.[index];
      return {
        id: `img-${String(index + 1).padStart(3, "0")}`,
        filename: img.filename,
        quote: img.quote,
        template: img.template,
        promptTemplate,
        status: "pending",
        captions: options && options.length > 0 ? options : undefined,
        caption: options?.[0],
        selectedCaptionIndex: options && options.length > 0 ? 0 : undefined,
      };
    }),
  };

  manifests.push(manifest);
  writeManifestToDir(manifests, targetDir);
  return manifest;
}

/**
 * Get the most recent batch, or null if none exist.
 */
export function getLatestBatch(accountId?: string): Manifest | null {
  const dir = accountId ? getAccountDir(accountId) : undefined;
  const manifests = readManifestFromDir(dir);
  return manifests.length > 0 ? manifests[manifests.length - 1] : null;
}

/**
 * Update the status of a specific image in a batch.
 */
export function updateImageStatus(
  batchId: string,
  imageId: string,
  status: "pending" | "approved" | "rejected",
  accountId?: string
): boolean {
  const dir = accountId ? getAccountDir(accountId) : undefined;
  const manifests = readManifestFromDir(dir);
  const batch = manifests.find((m) => m.batch.id === batchId);
  if (!batch) return false;

  const image = batch.images.find((img) => img.id === imageId);
  if (!image) return false;

  image.status = status;
  writeManifestToDir(manifests, dir);
  return true;
}

/**
 * Update the caption (commentary + hashtags) of a specific image in a batch.
 * Optionally records which option was selected from captions[].
 */
export function updateImageCaption(
  batchId: string,
  imageId: string,
  caption: CaptionData,
  selectedIndex: number = 0,
  accountId?: string
): boolean {
  const dir = accountId ? getAccountDir(accountId) : undefined;
  const manifests = readManifestFromDir(dir);
  const batch = manifests.find((m) => m.batch.id === batchId);
  if (!batch) return false;

  const image = batch.images.find((img) => img.id === imageId);
  if (!image) return false;

  image.caption = caption;
  image.selectedCaptionIndex = selectedIndex;
  writeManifestToDir(manifests, dir);
  return true;
}

/**
 * Update just the selected caption index (picking from existing options).
 */
export function updateSelectedCaptionIndex(
  batchId: string,
  imageId: string,
  selectedIndex: number,
  accountId?: string
): boolean {
  const dir = accountId ? getAccountDir(accountId) : undefined;
  const manifests = readManifestFromDir(dir);
  const batch = manifests.find((m) => m.batch.id === batchId);
  if (!batch) return false;

  const image = batch.images.find((img) => img.id === imageId);
  if (!image) return false;
  if (!image.captions || !image.captions[selectedIndex]) return false;

  image.selectedCaptionIndex = selectedIndex;
  image.caption = image.captions[selectedIndex];
  writeManifestToDir(manifests, dir);
  return true;
}

/**
 * Get all batches (summaries for history listing).
 */
export function getAllBatches(accountId?: string): Array<{
  id: string;
  generatedAt: string;
  trigger: "cli" | "web";
  imageCount: number;
  approvedCount: number;
}> {
  const dir = accountId ? getAccountDir(accountId) : undefined;
  return readManifestFromDir(dir).map((m) => ({
    id: m.batch.id,
    generatedAt: m.batch.generatedAt,
    trigger: m.batch.trigger,
    imageCount: m.images.length,
    approvedCount: m.images.filter((i) => i.status === "approved").length,
  }));
}

/**
 * Get a specific batch by ID.
 */
export function getBatchById(batchId: string, accountId?: string): Manifest | null {
  const dir = accountId ? getAccountDir(accountId) : undefined;
  const manifests = readManifestFromDir(dir);
  return manifests.find((m) => m.batch.id === batchId) || null;
}

/**
 * Get approved images from the latest batch (optionally scoped to account).
 */
export function getApprovedImages(accountId?: string): ImageEntry[] {
  const batch = getLatestBatch(accountId);
  if (!batch) return [];
  return batch.images.filter((img) => img.status === "approved");
}

/**
 * Get images from ALL batches, optionally filtered by status.
 * Each image includes its batch ID for reference.
 * Useful for the unified review view.
 */
export function getAllImages(
  accountId?: string,
  statusFilter?: "pending" | "approved" | "rejected"
): Array<{ batchId: string; image: ImageEntry }> {
  const dir = accountId ? getAccountDir(accountId) : undefined;
  const manifests = readManifestFromDir(dir);
  const results: Array<{ batchId: string; image: ImageEntry }> = [];

  for (const m of manifests) {
    for (const img of m.images) {
      if (statusFilter && img.status !== statusFilter) continue;
      results.push({ batchId: m.batch.id, image: img });
    }
  }

  // Most recent batches first
  return results.reverse();
}

/**
 * Invalidate the in-memory cache so the next read gets fresh data.
 */
export function invalidateCache(): void {
  globalStore.invalidate();
}
