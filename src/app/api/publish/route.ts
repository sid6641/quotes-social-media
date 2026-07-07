import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { publishToInstagram } from "@/lib/instagram";
import { getLatestBatch, updateImageStatus } from "@/lib/manifest";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imageIds, caption } = body;

    if (!imageIds || !Array.isArray(imageIds) || imageIds.length === 0) {
      return NextResponse.json(
        { success: false, error: "No image IDs provided" },
        { status: 400 }
      );
    }

    // Get the latest batch to find the images
    const batch = getLatestBatch();
    if (!batch) {
      return NextResponse.json(
        { success: false, error: "No batch found" },
        { status: 404 }
      );
    }

    // Find the requested images
    const images = batch.images.filter((img) => imageIds.includes(img.id));
    if (images.length === 0) {
      return NextResponse.json(
        { success: false, error: "No matching images found" },
        { status: 404 }
      );
    }

    // Build publicly accessible URLs for the images
    // In local dev, the images are served via the /api/images/ endpoint
    const results: Array<{
      imageId: string;
      filename: string;
      success: boolean;
      mediaId?: string;
      error?: string;
    }> = [];

    for (const image of images) {
      const imageUrl = `${BASE_URL}/api/images/${image.filename}`;
      const imageCaption = caption || `"${image.quote}"`;

      try {
        const { mediaId } = await publishToInstagram(imageUrl, imageCaption);
        results.push({
          imageId: image.id,
          filename: image.filename,
          success: true,
          mediaId,
        });
        // Mark as published (we can use a convention — approved means published)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({
          imageId: image.id,
          filename: image.filename,
          success: false,
          error: msg,
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;

    return NextResponse.json({
      success: successCount > 0,
      published: successCount,
      failed: results.length - successCount,
      results,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 }
    );
  }
}
