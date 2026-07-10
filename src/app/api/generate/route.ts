import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { runGenerate } from "@/lib/generate";
import { invalidateCache } from "@/lib/manifest";
import { getAccount, getAccountDir } from "@/lib/account";

const GLOBAL_OUTPUT = path.resolve(process.cwd(), "output");

/**
 * POST /api/generate — generate a batch of quote images.
 *
 * Thin HTTP adapter. Delegates all generation logic to lib/generate.ts.
 *
 * Body: { account?, count?, all? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const accountId: string | undefined = body.account;
    const generateAll: boolean = body.all === true;
    const generateCount: number = generateAll
      ? 0
      : Math.min(Math.max(body.count || 5, 1), 10);

    // Resolve progress file path
    const account = accountId ? getAccount(accountId) : undefined;
    const outputDir = account ? getAccountDir(accountId!) : GLOBAL_OUTPUT;
    const progressPath = path.join(outputDir, ".generation-progress.json");

    // Write initial progress
    const writeProgress = (completed: number, total: number, current: string) => {
      try {
        fs.writeFileSync(
          progressPath,
          JSON.stringify({ total, completed, current }),
          "utf-8"
        );
      } catch { /* non-fatal */ }
    };
    writeProgress(0, 0, "Starting...");

    const result = await runGenerate({
      count: generateCount,
      accountId,
      generateAll,
      trigger: "web",
      onProgress: (event) => {
        if (event.phase === "image") {
          writeProgress(event.completed, event.total, event.current || "");
        }
      },
    });

    // Invalidate cache so the review UI picks up the new batch
    invalidateCache();

    // Clean up progress file
    try { fs.unlinkSync(progressPath); } catch { /* ok */ }

    return NextResponse.json({
      success: true,
      batchId: result.batchId,
      imageCount: result.successCount,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 }
    );
  }
}

/**
 * GET /api/generate?account=xxx — check generation progress
 */
export async function GET(request: NextRequest) {
  const accountId = request.nextUrl.searchParams.get("account");
  const account = accountId ? getAccount(accountId) : undefined;
  const outputDir = account ? getAccountDir(accountId!) : GLOBAL_OUTPUT;
  const progressPath = path.join(outputDir, ".generation-progress.json");

  try {
    if (fs.existsSync(progressPath)) {
      const raw = fs.readFileSync(progressPath, "utf-8");
      const progress = JSON.parse(raw);
      return NextResponse.json({ success: true, ...progress });
    }
    return NextResponse.json({ success: true, total: 0, completed: 0, current: null });
  } catch {
    return NextResponse.json({ success: true, total: 0, completed: 0, current: null });
  }
}
