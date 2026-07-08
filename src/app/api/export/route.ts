/**
 * POST /api/export — Export a content calendar
 *
 * Triggers a content calendar export for the given account (or global).
 * Returns the export result including file paths and scheduled entries.
 *
 * Body:
 *   { account?: string, days?: number }
 *
 * Response:
 *   { success: true, result: ExportResult }
 */

import { NextRequest, NextResponse } from "next/server";
import { exportContentCalendar } from "@/lib/exporter";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const accountId = typeof body.account === "string" ? body.account : undefined;
    const days = typeof body.days === "number" && body.days > 0 ? body.days : 7;

    const result = await exportContentCalendar({ accountId, days });

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Export failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
