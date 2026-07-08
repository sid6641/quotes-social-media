import fs from "fs";
import path from "path";
import type { CaptionData } from "./caption";

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

let manifestCache: Manifest[] | null = null;

function ensureOutputDir(dir?: string): void {
  const target = dir || OUTPUT_DIR;
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }
}

/** Resolve manifest path for a given output directory. */
function getManifestPath(dir?: string): string {
  return path.join(dir || OUTPUT_DIR, "manifest.json");
}

function readManifestFromDir(dir?: string): Manifest[] {
  const targetDir = dir || OUTPUT_DIR;
  const manifestPath = getManifestPath(targetDir);

  // Use cache only for global manifest
  if (!dir && manifestCache) return manifestCache;

  ensureOutputDir(targetDir);
  if (!fs.existsSync(manifestPath)) {
    if (!dir) manifestCache = [];
    return [];
  }
  try {
    const raw = fs.readFileSync(manifestPath, "utf-8");
    const data = JSON.parse(raw);
    const result = Array.isArray(data) ? data : [data];
    if (!dir) manifestCache = result;
    return result;
  } catch {
    if (!dir) manifestCache = [];
    return [];
  }
}

function writeManifestToDir(data: Manifest[], dir?: string): void {
  const targetDir = dir || OUTPUT_DIR;
  const manifestPath = getManifestPath(targetDir);
  ensureOutputDir(targetDir);
  fs.writeFileSync(manifestPath, JSON.stringify(data, null, 2), "utf-8");
  if (!dir) manifestCache = data;
}

// Legacy wrappers for backward compat
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
  const dir = accountId
    ? path.resolve(process.cwd(), "output", accountId)
    : undefined;
  const manifests = readManifestFromDir(dir);
  return manifests.length > 0 ? manifests[manifests.length - 1] : null;
}

/**
 * Update the status of a specific image in a batch.
 */
export function updateImageStatus(
  batchId: string,
  imageId: string,
  status: "pending" | "approved" | "rejected"
): boolean {
  const manifests = readManifest();
  const batch = manifests.find((m) => m.batch.id === batchId);
  if (!batch) return false;

  const image = batch.images.find((img) => img.id === imageId);
  if (!image) return false;

  image.status = status;
  writeManifest(manifests);
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
  selectedIndex: number = 0
): boolean {
  const manifests = readManifest();
  const batch = manifests.find((m) => m.batch.id === batchId);
  if (!batch) return false;

  const image = batch.images.find((img) => img.id === imageId);
  if (!image) return false;

  image.caption = caption;
  image.selectedCaptionIndex = selectedIndex;
  writeManifest(manifests);
  return true;
}

/**
 * Update just the selected caption index (picking from existing options).
 */
export function updateSelectedCaptionIndex(
  batchId: string,
  imageId: string,
  selectedIndex: number
): boolean {
  const manifests = readManifest();
  const batch = manifests.find((m) => m.batch.id === batchId);
  if (!batch) return false;

  const image = batch.images.find((img) => img.id === imageId);
  if (!image) return false;
  if (!image.captions || !image.captions[selectedIndex]) return false;

  image.selectedCaptionIndex = selectedIndex;
  image.caption = image.captions[selectedIndex];
  writeManifest(manifests);
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
  const dir = accountId ? path.resolve(process.cwd(), "output", accountId) : undefined;
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
  const dir = accountId ? path.resolve(process.cwd(), "output", accountId) : undefined;
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
 * Invalidate the in-memory cache so the next read gets fresh data.
 */
export function invalidateCache(): void {
  manifestCache = null;
}
