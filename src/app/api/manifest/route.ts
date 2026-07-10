import { NextRequest, NextResponse } from "next/server";
import path from "path";
import {
  getLatestBatch,
  getAllBatches,
  getBatchById,
  getAllImages,
  invalidateCache,
} from "@/lib/manifest";

// Must be dynamic — reads from filesystem on each request
export const dynamic = "force-dynamic";

/**
 * GET /api/manifest
 *
 * Query params:
 *   ?all          — list all batches (summary)
 *   ?batchId=xxx  — fetch a specific batch
 *   ?pending      — all pending images across all batches
 *   ?allImages    — all images across all batches (with optional &status= filter)
 *   ?status=xxx   — filter by status (used with ?allImages)
 *   ?account=xxx  — scope to a specific account
 *   (none)        — returns the latest batch
 */
export async function GET(request: NextRequest) {
  invalidateCache();

  const { searchParams } = new URL(request.url);
  const accountId = searchParams.get("account") || undefined;

  // All pending images across all batches
  if (searchParams.has("pending")) {
    const images = getAllImages(accountId, "pending");
    return NextResponse.json({ success: true, images });
  }

  // All images across all batches (optionally filtered by status)
  if (searchParams.has("allImages")) {
    const status = searchParams.get("status") as "pending" | "approved" | "rejected" | undefined;
    const images = getAllImages(accountId, status);
    return NextResponse.json({ success: true, images });
  }

  // List all batches
  if (searchParams.has("all")) {
    const batches = getAllBatches(accountId);
    return NextResponse.json({ success: true, batches });
  }

  // Fetch specific batch
  const batchId = searchParams.get("batchId");
  if (batchId) {
    const batch = getBatchById(batchId, accountId);
    if (!batch) {
      return NextResponse.json(
        { success: false, error: "Batch not found" },
        { status: 404 }
      );
    }
    return NextResponse.json(batch);
  }

  // Default: latest batch (scoped to account if specified)
  const batch = getLatestBatch(accountId);
  if (!batch) {
    return NextResponse.json(
      { error: "No batches found" },
      { status: 404 }
    );
  }
  return NextResponse.json(batch);
}
