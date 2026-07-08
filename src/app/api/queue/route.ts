import { NextRequest, NextResponse } from "next/server";
import {
  getQueue,
  addToQueue,
  removeFromQueue,
  getQueueStats,
  processQueue,
  invalidateQueueCache,
} from "@/lib/queue";
import { getLatestBatch } from "@/lib/manifest";

/**
 * GET /api/queue — list queue entries or get stats.
 * Query params:
 *   ?status=queued|published|failed  — filter by status
 *   ?stats=true                       — return stats instead of full list
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") as
      | "queued"
      | "published"
      | "failed"
      | null;
    const statsOnly = searchParams.get("stats") === "true";

    if (statsOnly) {
      const stats = getQueueStats();
      return NextResponse.json({ success: true, stats });
    }

    const queue = getQueue(status || undefined);
    return NextResponse.json({ success: true, queue });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 }
    );
  }
}

/**
 * POST /api/queue — add an image to the queue or process due items.
 *
 * To add:    { batchId, imageId, filename, quote, template, caption? }
 * To process: { action: "process" }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Process due items
    if (body.action === "process") {
      const results = await processQueue();
      invalidateQueueCache();
      return NextResponse.json({ success: true, results });
    }

    // Add to queue
    const { batchId, imageId } = body;

    // If only batchId + imageId provided, look up details from manifest
    if (batchId && imageId && !body.filename) {
      const batch = getLatestBatch();
      if (!batch || batch.batch.id !== batchId) {
        return NextResponse.json(
          { error: "Batch not found. Provide full details or use current batch." },
          { status: 404 }
        );
      }

      const image = batch.images.find((img) => img.id === imageId);
      if (!image) {
        return NextResponse.json(
          { error: "Image not found in batch" },
          { status: 404 }
        );
      }

      const entry = addToQueue({
        batchId,
        imageId,
        filename: image.filename,
        quote: image.quote,
        template: image.template,
        caption: image.caption,
      });

      invalidateQueueCache();
      return NextResponse.json({ success: true, entry });
    }

    // Full details provided
    const entry = addToQueue({
      batchId,
      imageId,
      filename: body.filename,
      quote: body.quote,
      template: body.template,
      caption: body.caption,
    });

    invalidateQueueCache();
    return NextResponse.json({ success: true, entry });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/queue — remove an entry from the queue.
 * Body: { id: string }
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Missing required field: id" },
        { status: 400 }
      );
    }

    const success = removeFromQueue(id);
    if (!success) {
      return NextResponse.json(
        { error: "Queue entry not found" },
        { status: 404 }
      );
    }

    invalidateQueueCache();
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }
}
