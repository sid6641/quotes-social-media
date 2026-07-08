import { NextRequest, NextResponse } from "next/server";
import {
  getQuotes,
  addQuote,
  deleteQuote,
  getAvailableQuotes,
  getPoolStats,
  expireCooldowns,
  importQuotes,
  importQuotesFromFile,
} from "@/lib/quote-pool";
import path from "path";

/**
 * GET /api/quotes — list quotes with filters.
 * Query params: status, theme, limit, offset, available=N (get N available)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  // Quick availability check
  const availableCount = searchParams.get("available");
  if (availableCount) {
    const theme = searchParams.get("theme") || undefined;
    const quotes = getAvailableQuotes(parseInt(availableCount, 10), theme);
    return NextResponse.json({ success: true, quotes });
  }

  // Stats
  if (searchParams.has("stats")) {
    const stats = getPoolStats();
    return NextResponse.json({ success: true, stats });
  }

  // List
  const status = searchParams.get("status") || undefined;
  const limit = searchParams.get("limit")
    ? parseInt(searchParams.get("limit")!, 10)
    : undefined;
  const offset = searchParams.get("offset")
    ? parseInt(searchParams.get("offset")!, 10)
    : undefined;

  const quotes = getQuotes({
    status: status as any,
    limit,
    offset,
  });

  return NextResponse.json({ success: true, quotes });
}

/**
 * POST /api/quotes — add quote(s) or import from file.
 *
 * Add single: { text, author? }
 * Batch:       { texts: string[], author? }
 * Import file: { filePath: string, author? }
 * Cooldowns:   { action: "expire-cooldowns" }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Expire cooldowns
    if (body.action === "expire-cooldowns") {
      const recycled = expireCooldowns();
      return NextResponse.json({ success: true, recycled });
    }

    // Import from file path
    if (body.filePath) {
      const result = importQuotesFromFile(
        path.resolve(body.filePath),
        { author: body.author, source: "imported" }
      );
      return NextResponse.json({ success: true, ...result });
    }

    // Batch import
    if (body.texts && Array.isArray(body.texts)) {
      const count = importQuotes(body.texts, {
        author: body.author,
        source: body.source || "imported",
      });
      return NextResponse.json({ success: true, imported: count });
    }

    // Single quote
    if (body.text) {
      const entry = addQuote(body.text, {
        author: body.author,
        source: body.source || "manual",
      });
      return NextResponse.json({ success: true, quote: entry });
    }

    return NextResponse.json(
      { error: "Missing required field: text, texts, or filePath" },
      { status: 400 }
    );
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }
}

/**
 * DELETE /api/quotes — delete a quote by ID.
 * Body: { id: string }
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Missing required field: id" },
        { status: 400 }
      );
    }

    const deleted = deleteQuote(id);
    if (!deleted) {
      return NextResponse.json(
        { error: "Quote not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }
}
