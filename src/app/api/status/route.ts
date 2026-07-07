import { NextRequest, NextResponse } from "next/server";
import { updateImageStatus, invalidateCache } from "@/lib/manifest";

/**
 * POST /api/status — update the approval status of an image.
 *
 * Body: { batchId: string, imageId: string, status: "approved" | "rejected" }
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

    invalidateCache();
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }
}
