import { NextRequest, NextResponse } from "next/server";
import {
  getHashtagSets,
  upsertHashtagSet,
  deleteHashtagSet,
  invalidateHashtagCache,
} from "@/lib/hashtag-bank";

/**
 * GET /api/hashtags — list all hashtag sets.
 */
export async function GET() {
  const sets = getHashtagSets();
  return NextResponse.json({ success: true, sets });
}

/**
 * POST /api/hashtags — create or update a hashtag set.
 * Body: { name: string, tags: string[] }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, tags } = body;

    if (!name || !Array.isArray(tags)) {
      return NextResponse.json(
        { error: "Missing required fields: name (string), tags (string[])" },
        { status: 400 }
      );
    }

    const set = upsertHashtagSet(name, tags);
    invalidateHashtagCache();
    return NextResponse.json({ success: true, set });
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }
}

/**
 * DELETE /api/hashtags — delete a hashtag set.
 * Body: { name: string }
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { name } = body;

    if (!name) {
      return NextResponse.json(
        { error: "Missing required field: name" },
        { status: 400 }
      );
    }

    const deleted = deleteHashtagSet(name);
    if (!deleted) {
      return NextResponse.json(
        { error: "Hashtag set not found" },
        { status: 404 }
      );
    }

    invalidateHashtagCache();
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }
}
