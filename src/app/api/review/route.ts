import { NextRequest, NextResponse } from "next/server";
import { markImagesAsReviewed, invalidateCache } from "@/lib/manifest";

/**
 * POST /api/review — mark images as reviewed (visually seen).
 *
 * Does NOT approve or reject. Just tracks that the user has looked at them
 * so they can be filtered out of the default "unreviewed" view.
 *
 * Body: {
 *   images: Array<{ batchId: string, imageId: string }>,
 *   account?: string
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { images, account: accountId } = body;

    if (!images || !Array.isArray(images) || images.length === 0) {
      return NextResponse.json(
        { error: "Missing required field: images (non-empty array of { batchId, imageId })" },
        { status: 400 }
      );
    }

    const count = markImagesAsReviewed(images, accountId || undefined);
    invalidateCache();

    return NextResponse.json({ success: true, reviewed: count });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
