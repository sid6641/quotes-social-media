import { describe, it, expect } from "vitest";
import { getMimeType } from "./media";

describe("getMimeType", () => {
  // ── Standard extensions ──────────────────────────────────────────

  it("returns image/jpeg for .jpg", () => {
    expect(getMimeType("photo.jpg")).toBe("image/jpeg");
  });

  it("returns image/jpeg for .jpeg", () => {
    expect(getMimeType("photo.jpeg")).toBe("image/jpeg");
  });

  it("returns image/png for .png", () => {
    expect(getMimeType("photo.png")).toBe("image/png");
  });

  it("returns image/webp for .webp", () => {
    expect(getMimeType("photo.webp")).toBe("image/webp");
  });

  // ── Case insensitivity ───────────────────────────────────────────

  it("handles uppercase .JPG", () => {
    expect(getMimeType("photo.JPG")).toBe("image/jpeg");
  });

  it("handles uppercase .PNG", () => {
    expect(getMimeType("photo.PNG")).toBe("image/png");
  });

  it("handles mixed case .WebP", () => {
    expect(getMimeType("photo.WebP")).toBe("image/webp");
  });

  it("handles uppercase .JPEG", () => {
    expect(getMimeType("photo.JPEG")).toBe("image/jpeg");
  });

  // ── Default fallback ─────────────────────────────────────────────

  it("defaults to image/jpeg for unknown extension (.gif)", () => {
    expect(getMimeType("photo.gif")).toBe("image/jpeg");
  });

  it("defaults to image/jpeg for unknown extension (.svg)", () => {
    expect(getMimeType("icon.svg")).toBe("image/jpeg");
  });

  it("defaults to image/jpeg for unknown extension (.bmp)", () => {
    expect(getMimeType("image.bmp")).toBe("image/jpeg");
  });

  // ── Edge cases ───────────────────────────────────────────────────

  it("defaults to image/jpeg for file with no extension", () => {
    expect(getMimeType("photo")).toBe("image/jpeg");
  });

  it("defaults to image/jpeg for empty string", () => {
    expect(getMimeType("")).toBe("image/jpeg");
  });

  it("uses the last segment after the final dot", () => {
    expect(getMimeType("photo.tar.gz")).toBe("image/jpeg");
  });

  it("handles file with leading dots", () => {
    expect(getMimeType(".hidden.png")).toBe("image/png");
  });
});
