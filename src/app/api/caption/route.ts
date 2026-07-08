import { NextRequest, NextResponse } from "next/server";
import { updateImageCaption, invalidateCache } from "@/lib/manifest";

/**
 * POST /api/caption — update the caption of a specific image.
 *
 * Body: {
 *   batchId: string,
 *   imageId: string,
 *   caption: { commentary: string, hashtags: string[] }
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { batchId, imageId, caption } = body;

    if (!batchId || !imageId || !caption) {
      return NextResponse.json(
        { error: "Missing required fields: batchId, imageId, caption" },
        { status: 400 }
      );
    }

    if (typeof caption.commentary !== "string" || !Array.isArray(caption.hashtags)) {
      return NextResponse.json(
        { error: "caption must have commentary (string) and hashtags (string[])" },
        { status: 400 }
      );
    }

    const success = updateImageCaption(batchId, imageId, caption);
    if (!success) {
      return NextResponse.json(
        { error: "Batch or image not found" },
        { status: 404 }
      );
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
