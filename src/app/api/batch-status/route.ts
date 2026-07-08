import { NextRequest, NextResponse } from "next/server";
import {
  updateImageStatus,
  invalidateCache,
  getLatestBatch,
} from "@/lib/manifest";
import { addToQueue, removeImageFromQueue } from "@/lib/queue";

/**
 * POST /api/batch-status — approve or reject multiple images at once.
 *
 * Body: {
 *   batchId: string,
 *   imageIds: string[],     // array of image IDs
 *   status: "approved" | "rejected"
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { batchId, imageIds, status } = body;

    if (!batchId || !imageIds || !Array.isArray(imageIds) || imageIds.length === 0) {
      return NextResponse.json(
        { error: "Missing required fields: batchId, imageIds (non-empty array)" },
        { status: 400 }
      );
    }

    if (!["approved", "rejected"].includes(status)) {
      return NextResponse.json(
        { error: "Status must be 'approved' or 'rejected'" },
        { status: 400 }
      );
    }

    const results: Array<{ imageId: string; success: boolean; error?: string }> = [];
    const batch = getLatestBatch();

    for (const imageId of imageIds) {
      const ok = updateImageStatus(batchId, imageId, status);
      if (ok) {
        // Auto-queue on approve, auto-remove on reject
        if (status === "approved" && batch && batch.batch.id === batchId) {
          const image = batch.images.find((img) => img.id === imageId);
          if (image) {
            addToQueue({
              batchId,
              imageId,
              filename: image.filename,
              quote: image.quote,
              template: image.template,
              caption: image.caption,
            });
          }
        } else if (status === "rejected") {
          removeImageFromQueue(batchId, imageId);
        }
        results.push({ imageId, success: true });
      } else {
        results.push({ imageId, success: false, error: "Image not found" });
      }
    }

    invalidateCache();
    return NextResponse.json({
      success: true,
      updated: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      results,
    });
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }
}
