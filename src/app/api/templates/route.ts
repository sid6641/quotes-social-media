import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getAccountTemplatesDir, getAccountFavoritesDir } from "@/lib/account";

const GLOBAL_TEMPLATES_DIR = path.resolve(process.cwd(), "templates");
const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

export const dynamic = "force-dynamic";

interface TemplateEntry {
  filename: string;
  sizeBytes: number;
  sizeKB: string;
  filePath: string;
  isFavorite: boolean;
}

/**
 * GET /api/templates — list available template images.
 * Query params:
 *   ?account=xxx  — scope to a specific account's templates/ dir
 */
export async function GET(request: NextRequest) {
  const accountId = request.nextUrl.searchParams.get("account");

  // Load favorites set for this account — stored at accounts/<id>/favorites/
  const favoritesDir = accountId
    ? getAccountFavoritesDir(accountId)
    : null;
  const favorites = new Set<string>();
  if (favoritesDir && fs.existsSync(favoritesDir)) {
    for (const f of fs.readdirSync(favoritesDir)) {
      if (IMAGE_EXTS.has(path.extname(f).toLowerCase())) {
        favorites.add(f);
      }
    }
  }

  // Collect templates: if account has any, show ONLY account templates
  // Otherwise fall back to global templates
  const templates: TemplateEntry[] = [];
  let foundAny = false;

  if (accountId) {
    const accountTemplatesDir = getAccountTemplatesDir(accountId);
    if (fs.existsSync(accountTemplatesDir)) {
      const files = fs.readdirSync(accountTemplatesDir).sort();
      for (const f of files) {
        if (!IMAGE_EXTS.has(path.extname(f).toLowerCase())) continue;
        foundAny = true;
        const stats = fs.statSync(path.join(accountTemplatesDir, f));
        templates.push({
          filename: f,
          sizeBytes: stats.size,
          sizeKB: (stats.size / 1024).toFixed(1),
          filePath: `accounts/${accountId}/templates/${f}`,
          isFavorite: favorites.has(f),
        });
      }
    }
  }

  // Only fall back to global if account had no templates
  if (!foundAny) {
    if (fs.existsSync(GLOBAL_TEMPLATES_DIR)) {
      for (const f of fs.readdirSync(GLOBAL_TEMPLATES_DIR).sort()) {
        if (!IMAGE_EXTS.has(path.extname(f).toLowerCase())) continue;
        const stats = fs.statSync(path.join(GLOBAL_TEMPLATES_DIR, f));
        templates.push({
          filename: f,
          sizeBytes: stats.size,
          sizeKB: (stats.size / 1024).toFixed(1),
          filePath: `templates/${f}`,
          isFavorite: false,
        });
      }
    }
  }

  return NextResponse.json({ success: true, templates });
}

/**
 * POST /api/templates — favorite or unfavorite a template.
 *
 * Body:
 *   { action: "favorite", filename: string, account: string }
 *   { action: "unfavorite", filename: string, account: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, filename, account: accountId } = body;

    if (!action || !filename || !accountId) {
      return NextResponse.json(
        { error: "Missing required fields: action, filename, account" },
        { status: 400 }
      );
    }

    if (action !== "favorite" && action !== "unfavorite") {
      return NextResponse.json(
        { error: "Action must be 'favorite' or 'unfavorite'" },
        { status: 400 }
      );
    }

    // Basic security: prevent directory traversal
    if (filename.includes("..") || filename.includes("/")) {
      return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
    }

    const templatesDir = getAccountTemplatesDir(accountId);
    const favoritesDir = getAccountFavoritesDir(accountId);

    if (action === "favorite") {
      // Find the source file — check account templates first, then global
      let sourcePath = path.join(templatesDir, filename);
      if (!fs.existsSync(sourcePath)) {
        sourcePath = path.join(GLOBAL_TEMPLATES_DIR, filename);
      }
      if (!fs.existsSync(sourcePath)) {
        return NextResponse.json(
          { error: `Template "${filename}" not found` },
          { status: 404 }
        );
      }

      // Create favorites dir and copy
      if (!fs.existsSync(favoritesDir)) {
        fs.mkdirSync(favoritesDir, { recursive: true });
      }
      fs.copyFileSync(sourcePath, path.join(favoritesDir, filename));

      return NextResponse.json({ success: true, favorited: true, filename });
    } else {
      // Unfavorite — remove from favorites dir
      const favoritePath = path.join(favoritesDir, filename);
      if (fs.existsSync(favoritePath)) {
        fs.unlinkSync(favoritePath);
      }
      // Clean up empty favorites dir
      if (fs.existsSync(favoritesDir) && fs.readdirSync(favoritesDir).length === 0) {
        fs.rmdirSync(favoritesDir);
      }

      return NextResponse.json({ success: true, favorited: false, filename });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, error: msg },
      { status: 500 }
    );
  }
}
