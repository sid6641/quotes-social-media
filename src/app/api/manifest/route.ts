import { NextResponse } from "next/server";
import { getLatestBatch, invalidateCache } from "@/lib/manifest";

// Must be dynamic — reads from filesystem on each request
export const dynamic = "force-dynamic";

/**
 * GET /api/manifest — returns the latest batch manifest.
 * Returns 404 if no batches exist yet.
 */
export async function GET() {
  invalidateCache();
  const batch = getLatestBatch();
  if (!batch) {
    return NextResponse.json(
      { error: "No batches found" },
      { status: 404 }
    );
  }
  return NextResponse.json(batch);
}
