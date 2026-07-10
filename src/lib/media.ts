/**
 * Shared media utilities — MIME type resolution and image helpers.
 *
 * Single source of truth for mapping file extensions to MIME types.
 * Used by gemini.ts and caption.ts (both formerly had private copies).
 */

/**
 * Resolve the MIME type for an image file based on its extension.
 * Defaults to "image/jpeg" for unknown extensions.
 */
export function getMimeType(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    default:
      return "image/jpeg";
  }
}
