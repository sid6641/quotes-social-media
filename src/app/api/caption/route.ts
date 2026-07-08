import { NextRequest, NextResponse } from "next/server";
import {
  updateImageCaption,
  updateSelectedCaptionIndex,
  invalidateCache,
  getLatestBatch,
} from "@/lib/manifest";
import { recordCaptionPick } from "@/lib/caption-learning";

/**
 * POST /api/caption — pick a caption option or save an edited caption.
 *
 * Body (pick option): {
 *   batchId, imageId,
 *   selectedOption: number  // index into captions[] (0-4)
 * }
 *
 * Body (save edited): {
 *   batchId, imageId,
 *   caption: { commentary, hashtags },
 *   selectedOption?: -1     // -1 or omitted = custom edit
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { batchId, imageId, caption, selectedOption } = body;

    if (!batchId || !imageId) {
      return NextResponse.json(
        { error: "Missing required fields: batchId, imageId" },
        { status: 400 }
      );
    }

    // Case 1: Picking an existing option (just store the index)
    if (typeof selectedOption === "number" && selectedOption >= 0 && !caption) {
      const success = updateSelectedCaptionIndex(batchId, imageId, selectedOption);
      if (!success) {
        return NextResponse.json(
          { error: "Batch or image not found" },
          { status: 404 }
        );
      }

      // Record this pick for self-learning
      const batch = getLatestBatch();
      if (batch && batch.batch.id === batchId) {
        const image = batch.images.find((img) => img.id === imageId);
        if (image?.captions?.[selectedOption]) {
          recordCaptionPick({
            quote: image.quote,
            template: image.template,
            allOptions: image.captions,
            chosenIndex: selectedOption,
            chosenCaption: image.captions[selectedOption],
            wasEdited: false,
          });
        }
      }

      invalidateCache();
      return NextResponse.json({ success: true });
    }

    // Case 2: Saving an edited caption
    if (!caption) {
      return NextResponse.json(
        { error: "Missing caption data" },
        { status: 400 }
      );
    }

    if (typeof caption.commentary !== "string" || !Array.isArray(caption.hashtags)) {
      return NextResponse.json(
        { error: "caption must have commentary (string) and hashtags (string[])" },
        { status: 400 }
      );
    }

    const success = updateImageCaption(batchId, imageId, caption, selectedOption ?? -1);
    if (!success) {
      return NextResponse.json(
        { error: "Batch or image not found" },
        { status: 404 }
      );
    }

    // Record custom-edit for self-learning
    const batch = getLatestBatch();
    if (batch && batch.batch.id === batchId) {
      const image = batch.images.find((img) => img.id === imageId);
      if (image?.captions) {
        recordCaptionPick({
          quote: image.quote,
          template: image.template,
          allOptions: image.captions,
          chosenIndex: -1,
          chosenCaption: caption,
          wasEdited: true,
        });
      }
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
