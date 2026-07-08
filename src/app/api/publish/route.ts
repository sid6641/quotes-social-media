import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { publishToInstagram, resolvePublishConfig } from "@/lib/instagram";
import { getLatestBatch } from "@/lib/manifest";
import { getAccount, getAccountDir } from "@/lib/account";
import { markPublished, markFailed } from "@/lib/queue";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imageIds, caption, account: accountId } = body;

    if (!imageIds || !Array.isArray(imageIds) || imageIds.length === 0) {
      return NextResponse.json(
        { success: false, error: "No image IDs provided" },
        { status: 400 }
      );
    }

    // Determine where to read the manifest from
    const outputDir = accountId ? getAccountDir(accountId) : undefined;
    const manifestPath = outputDir
      ? path.join(outputDir, "manifest.json")
      : path.join(process.cwd(), "output", "manifest.json");

    // Read manifest from the correct scope
    const fs = await import("fs");
    let manifests: any[] = [];
    if (fs.existsSync(manifestPath)) {
      const raw = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      manifests = Array.isArray(raw) ? raw : [raw];
    }

    // Collect images across all batches
    const images: Array<{ id: string; filename: string; quote: string; batchId: string }> = [];
    for (const manifest of manifests) {
      for (const img of manifest.images || []) {
        if (imageIds.includes(img.id)) {
          images.push({ id: img.id, filename: img.filename, quote: img.quote, batchId: manifest.batch?.id || "" });
        }
      }
    }

    if (images.length === 0) {
      return NextResponse.json(
        { success: false, error: "No matching images found" },
        { status: 404 }
      );
    }

    // Validate Instagram auth
    try {
      resolvePublishConfig(accountId);
    } catch {
      return NextResponse.json(
        { success: false, error: "Instagram API not configured. Use the Accounts tab to set up IG User ID and Access Token, or configure INSTAGRAM_ACCESS_TOKEN + INSTAGRAM_IG_USER_ID in .env" },
        { status: 400 }
      );
    }

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
        const { mediaId } = await publishToInstagram(imageUrl, imageCaption, accountId);
        results.push({
          imageId: image.id,
          filename: image.filename,
          success: true,
          mediaId,
        });
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
