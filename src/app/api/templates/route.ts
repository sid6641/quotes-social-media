import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const TEMPLATES_DIR = path.resolve(process.cwd(), "templates");
const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

export const dynamic = "force-dynamic";

interface TemplateEntry {
  filename: string;
  sizeBytes: number;
  sizeKB: string;
}

/**
 * GET /api/templates — list available template images.
 */
export async function GET() {
  if (!fs.existsSync(TEMPLATES_DIR)) {
    return NextResponse.json({ success: true, templates: [] });
  }

  const files = fs.readdirSync(TEMPLATES_DIR).sort();
  const templates: TemplateEntry[] = files
    .filter((f) => IMAGE_EXTS.has(path.extname(f).toLowerCase()))
    .map((f) => {
      const stats = fs.statSync(path.join(TEMPLATES_DIR, f));
      return {
        filename: f,
        sizeBytes: stats.size,
        sizeKB: (stats.size / 1024).toFixed(1),
      };
    });

  return NextResponse.json({ success: true, templates });
}
