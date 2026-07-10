/**
 * Shared types for tab components in the review page.
 * Extracted from the monolithic page.tsx.
 */

export interface CaptionData {
  commentary: string;
  hashtags: string[];
}

export interface ImageEntry {
  id: string;
  filename: string;
  quote: string;
  template: string;
  promptTemplate: string;
  status: "pending" | "approved" | "rejected";
  captions?: CaptionData[];
  caption?: CaptionData;
  selectedCaptionIndex?: number;
}

export interface BatchInfo {
  id: string;
  generatedAt: string;
  trigger: "cli" | "web";
}

export interface Manifest {
  batch: BatchInfo;
  images: ImageEntry[];
}

export type StatusFilter = "all" | "pending" | "approved" | "rejected";

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
