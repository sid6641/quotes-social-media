import { NextRequest, NextResponse } from "next/server";
import path from "path";
import {
  invalidateCache,
} from "@/lib/manifest";
import { addToQueue, removeImageFromQueue } from "@/lib/queue";

/**
 * POST /api/status — update the approval status of an image.
 *
 * Body: { batchId, imageId, status, account? }
 *
 * When status is "approved", the image is automatically added to the publish queue.
 * When status is "rejected", it's removed from the publish queue if present.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { batchId, imageId, status, account: accountId } = body;
    const outputDir = accountId ? path.resolve(process.cwd(), "output", accountId) : undefined;

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

    // Use the raw manifest file for account-scoped updates
    const fs = await import("fs");
    const manifestPath = outputDir
      ? path.join(outputDir, "manifest.json")
      : path.join(process.cwd(), "output", "manifest.json");

    let manifests: any[] = [];
    if (fs.existsSync(manifestPath)) {
      const raw = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      manifests = Array.isArray(raw) ? raw : [raw];
    }

    let found = false;
    for (const manifest of manifests) {
      const img = (manifest.images || []).find((i: any) => i.id === imageId && manifest.batch?.id === batchId);
      if (img) {
        img.status = status;
        found = true;
        break;
      }
    }

    if (!found) {
      return NextResponse.json(
        { error: "Batch or image not found" },
        { status: 404 }
      );
    }

    fs.writeFileSync(manifestPath, JSON.stringify(manifests, null, 2), "utf-8");
    invalidateCache();

    // Auto-queue on approve, auto-remove on reject
    if (status === "approved") {
      const batch = manifests.find((m) => m.batch?.id === batchId);
      if (batch) {
        const image = batch.images.find((img: any) => img.id === imageId);
        if (image) {
          addToQueue({
            batchId,
            imageId,
            filename: image.filename,
            quote: image.quote,
            template: image.template,
            caption: image.caption,
          }, outputDir);
        }
      }
    } else if (status === "rejected") {
      removeImageFromQueue(batchId, imageId, outputDir);
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
