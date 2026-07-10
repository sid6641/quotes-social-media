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
  toggleQuoteFavorite,
} from "@/lib/quote-pool";
import path from "path";

/**
 * GET /api/quotes — list quotes with filters.
 * Query params: account, status, theme, limit, offset, available=N (get N available)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const account = searchParams.get("account") || undefined;

  // Quick availability check
  const availableCount = searchParams.get("available");
  if (availableCount) {
    const quotes = getAvailableQuotes(parseInt(availableCount, 10), account);
    return NextResponse.json({ success: true, quotes });
  }

  // Stats
  if (searchParams.has("stats")) {
    const stats = getPoolStats(account);
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

  let quotes = getQuotes({
    status: status as any,
    limit,
    offset,
  }, account);

  // If status is "favorites", filter by isFavorite
  if (status === "favorites") {
    quotes = quotes.filter((q) => q.isFavorite);
  }

  return NextResponse.json({ success: true, quotes });
}

/**
 * POST /api/quotes — add quote(s), import from file, expire cooldowns, or toggle favorite.
 *
 * Add single: { text, author?, account? }
 * Batch:       { texts: string[], author?, account? }
 * Import file: { filePath: string, author?, account? }
 * Cooldowns:   { action: "expire-cooldowns", account? }
 * Favorite:    { action: "favorite" | "unfavorite", quoteId: string, account: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const account = body.account || undefined;

    // Toggle favorite
    if (body.action === "favorite" || body.action === "unfavorite") {
      if (!body.quoteId || !body.account) {
        return NextResponse.json(
          { error: "Missing required fields: quoteId, account" },
          { status: 400 }
        );
      }
      const result = toggleQuoteFavorite(body.quoteId, body.account);
      if (!result) {
        return NextResponse.json(
          { error: "Quote not found" },
          { status: 404 }
        );
      }
      return NextResponse.json({ success: true, isFavorite: body.action === "unfavorite" });
    }

    // Expire cooldowns
    if (body.action === "expire-cooldowns") {
      const recycled = expireCooldowns(account);
      return NextResponse.json({ success: true, recycled });
    }

    // Import from file path
    if (body.filePath) {
      const result = importQuotesFromFile(
        path.resolve(body.filePath),
        { author: body.author, source: "imported" },
        account
      );
      return NextResponse.json({ success: true, ...result });
    }

    // Batch import
    if (body.texts && Array.isArray(body.texts)) {
      const count = importQuotes(body.texts, {
        author: body.author,
        source: body.source || "imported",
      }, account);
      return NextResponse.json({ success: true, imported: count });
    }

    // Single quote
    if (body.text) {
      const entry = addQuote(body.text, {
        author: body.author,
        source: body.source || "manual",
      }, account);
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
 * Body: { id: string, account?: string }
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { id } = body;
    const account = body.account || undefined;

    if (!id) {
      return NextResponse.json(
        { error: "Missing required field: id" },
        { status: 400 }
      );
    }

    const deleted = deleteQuote(id, account);
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
