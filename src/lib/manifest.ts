import fs from "fs";
import path from "path";

const OUTPUT_DIR = path.resolve(process.cwd(), "output");
const MANIFEST_PATH = path.join(OUTPUT_DIR, "manifest.json");

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
}

export interface Manifest {
  batch: BatchInfo;
  images: ImageEntry[];
}

let manifestCache: Manifest[] | null = null;

function ensureOutputDir(): void {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
}

function readManifest(): Manifest[] {
  if (manifestCache) return manifestCache;
  ensureOutputDir();
  if (!fs.existsSync(MANIFEST_PATH)) {
    manifestCache = [];
    return manifestCache;
  }
  try {
    const raw = fs.readFileSync(MANIFEST_PATH, "utf-8");
    const data = JSON.parse(raw);
    manifestCache = Array.isArray(data) ? data : [data];
    return manifestCache;
  } catch {
    manifestCache = [];
    return manifestCache;
  }
}

function writeManifest(data: Manifest[]): void {
  ensureOutputDir();
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(data, null, 2), "utf-8");
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
 */
export function createBatch(
  images: Array<{ quote: string; template: string; filename: string }>,
  trigger: "cli" | "web",
  promptTemplate: string = "default.md"
): Manifest {
  const manifests = readManifest();
  const batchId = generateBatchId();

  const manifest: Manifest = {
    batch: {
      id: batchId,
      generatedAt: new Date().toISOString(),
      trigger,
    },
    images: images.map((img, index) => ({
      id: `img-${String(index + 1).padStart(3, "0")}`,
      filename: img.filename,
      quote: img.quote,
      template: img.template,
      promptTemplate,
      status: "pending",
    })),
  };

  manifests.push(manifest);
  writeManifest(manifests);
  return manifest;
}

/**
 * Get the most recent batch, or null if none exist.
 */
export function getLatestBatch(): Manifest | null {
  const manifests = readManifest();
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
 * Get approved images from the latest batch.
 */
export function getApprovedImages(): ImageEntry[] {
  const batch = getLatestBatch();
  if (!batch) return [];
  return batch.images.filter((img) => img.status === "approved");
}

/**
 * Invalidate the in-memory cache so the next read gets fresh data.
 */
export function invalidateCache(): void {
  manifestCache = null;
}
