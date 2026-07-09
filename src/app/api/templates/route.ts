import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getAccountTemplatesDir } from "@/lib/account";

const GLOBAL_TEMPLATES_DIR = path.resolve(process.cwd(), "templates");
const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

export const dynamic = "force-dynamic";

interface TemplateEntry {
  filename: string;
  sizeBytes: number;
  sizeKB: string;
}

/**
 * GET /api/templates — list available template images.
 * Query params:
 *   ?account=xxx  — scope to a specific account's templates/ dir
 */
export async function GET(request: NextRequest) {
  const accountId = request.nextUrl.searchParams.get("account");

  // Collect from account dir first, then global
  const seen = new Set<string>();
  const templates: TemplateEntry[] = [];

  function addFromDir(dir: string): void {
    if (!fs.existsSync(dir)) return;
    for (const f of fs.readdirSync(dir).sort()) {
      if (!IMAGE_EXTS.has(path.extname(f).toLowerCase())) continue;
      if (seen.has(f)) continue;
      seen.add(f);
      const stats = fs.statSync(path.join(dir, f));
      templates.push({
        filename: f,
        sizeBytes: stats.size,
        sizeKB: (stats.size / 1024).toFixed(1),
      });
    }
  }

  // Account templates take precedence
  if (accountId) {
    addFromDir(getAccountTemplatesDir(accountId));
  }

  // Global fallback
  addFromDir(GLOBAL_TEMPLATES_DIR);

  return NextResponse.json({ success: true, templates });
}
