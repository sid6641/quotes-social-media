import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const OUTPUT_DIR = path.resolve(process.cwd(), "output");
const TEMPLATES_DIR = path.resolve(process.cwd(), "templates");

/**
 * Serve generated images from output/ or template images from templates/.
 * Supports ?account=xxx to scope to a specific account's images/ dir.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { filename: string } }
) {
  const { filename } = params;
  const accountId = request.nextUrl.searchParams.get("account");

  // Basic security: prevent directory traversal
  if (filename.includes("..") || filename.includes("/")) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }

  // Try account-specific dir first, then global output/, then templates/
  let filePath: string | null = null;
  if (accountId) {
    const accountImagePath = path.join(OUTPUT_DIR, accountId, "images", filename);
    if (fs.existsSync(accountImagePath)) {
      filePath = accountImagePath;
    }
  }
  if (!filePath) {
    const globalPath = path.join(OUTPUT_DIR, filename);
    if (fs.existsSync(globalPath)) {
      filePath = globalPath;
    }
  }
  if (!filePath) {
    const templatePath = path.join(TEMPLATES_DIR, filename);
    if (fs.existsSync(templatePath)) {
      filePath = templatePath;
    }
  }

  if (!filePath) {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }

  const buffer = fs.readFileSync(filePath);
  const ext = path.extname(filename).toLowerCase();
  const mimeTypes: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
  };
  const contentType = mimeTypes[ext] || "application/octet-stream";

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
