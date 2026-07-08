import { NextRequest, NextResponse } from "next/server";
import { updateImageStatus, invalidateCache, getLatestBatch } from "@/lib/manifest";
import { addToQueue, removeImageFromQueue } from "@/lib/queue";

/**
 * POST /api/status — update the approval status of an image.
 *
 * Body: { batchId: string, imageId: string, status: "approved" | "rejected" }
 *
 * When status is "approved", the image is automatically added to the publish queue.
 * When status is "rejected", it's removed from the publish queue if present.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { batchId, imageId, status } = body;

    if (!batchId || !imageId || !status) {
      return NextResponse.json(
        { error: "Missing required fields: batchId, imageId, status" },
        { status: 400 }
      );
    }

    if (!["approved", "rejected"].includes(status)) {
      return NextResponse.json(
        { error: "Status must be 'approved' or 'rejected'" },
        { status: 400 }
      );
    }

    const success = updateImageStatus(batchId, imageId, status);
    if (!success) {
      return NextResponse.json(
        { error: "Batch or image not found" },
        { status: 404 }
      );
    }

    // Auto-queue on approve, auto-remove on reject
    if (status === "approved") {
      const batch = getLatestBatch();
      if (batch && batch.batch.id === batchId) {
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
      }
    } else if (status === "rejected") {
      removeImageFromQueue(batchId, imageId);
    }

    invalidateCache();
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }
}
