import { describe, it, expect } from "vitest";
import {
  generateBatchIdFromManifests,
  createBatchInManifests,
  getAllBatchesFromManifests,
  getAllImagesFromManifests,
  markImagesAsReviewedInManifests,
  type Manifest,
} from "./manifest";

function emptyManifests(): Manifest[] {
  return [];
}

function seededManifests(): Manifest[] {
  return [
    {
      batch: { id: "2026-07-10-001", generatedAt: "2026-07-10T08:00:00.000Z", trigger: "cli" },
      images: [
        { id: "img-001", filename: "a.png", quote: "Quote A", template: "t1.jpg", promptTemplate: "default.md", status: "approved" },
        { id: "img-002", filename: "b.png", quote: "Quote B", template: "t2.jpg", promptTemplate: "default.md", status: "pending" },
      ],
    },
    {
      batch: { id: "2026-07-11-001", generatedAt: "2026-07-11T08:00:00.000Z", trigger: "web" },
      images: [
        { id: "img-001", filename: "c.png", quote: "Quote C", template: "t1.jpg", promptTemplate: "default.md", status: "approved" },
        { id: "img-002", filename: "d.png", quote: "Quote D", template: "t2.jpg", promptTemplate: "default.md", status: "rejected" },
        { id: "img-003", filename: "e.png", quote: "Quote E", template: "t3.jpg", promptTemplate: "default.md", status: "pending" },
      ],
    },
  ];
}

const NOW = new Date("2026-07-12T12:00:00.000Z");

// ── generateBatchIdFromManifests ───────────────────────────────────

describe("generateBatchIdFromManifests", () => {
  it("returns 001 for first batch of the day", () => {
    const result = generateBatchIdFromManifests(emptyManifests(), NOW);
    expect(result).toBe("2026-07-12-001");
  });

  it("increments sequence for existing batches on same day", () => {
    const manifests: Manifest[] = [
      { batch: { id: "2026-07-12-001", generatedAt: "2026-07-12T00:00:00.000Z", trigger: "cli" }, images: [] },
      { batch: { id: "2026-07-12-002", generatedAt: "2026-07-12T01:00:00.000Z", trigger: "cli" }, images: [] },
    ];
    const result = generateBatchIdFromManifests(manifests, NOW);
    expect(result).toBe("2026-07-12-003");
  });

  it("ignores batches from other days", () => {
    const manifests: Manifest[] = [
      { batch: { id: "2026-07-10-005", generatedAt: "2026-07-10T00:00:00.000Z", trigger: "cli" }, images: [] },
      { batch: { id: "2026-07-11-003", generatedAt: "2026-07-11T00:00:00.000Z", trigger: "cli" }, images: [] },
    ];
    const result = generateBatchIdFromManifests(manifests, NOW);
    expect(result).toBe("2026-07-12-001");
  });
});

// ── createBatchInManifests ─────────────────────────────────────────

describe("createBatchInManifests", () => {
  it("appends a new batch to the manifests array", () => {
    const manifests = emptyManifests();
    const manifest = createBatchInManifests(
      manifests,
      [{ quote: "Test", template: "bg.jpg", filename: "test.png" }],
      "cli",
      "default.md",
      undefined,
      NOW,
    );
    expect(manifests).toHaveLength(1);
    expect(manifest.batch.id).toBe("2026-07-12-001");
    expect(manifest.batch.trigger).toBe("cli");
  });

  it("generates image entries with sequential IDs", () => {
    const manifests = emptyManifests();
    const manifest = createBatchInManifests(
      manifests,
      [
        { quote: "Q1", template: "t1.jpg", filename: "1.png" },
        { quote: "Q2", template: "t2.jpg", filename: "2.png" },
      ],
      "web",
      "default.md",
      undefined,
      NOW,
    );
    expect(manifest.images).toHaveLength(2);
    expect(manifest.images[0].id).toBe("img-001");
    expect(manifest.images[1].id).toBe("img-002");
  });

  it("sets status to pending by default", () => {
    const manifests = emptyManifests();
    const manifest = createBatchInManifests(
      manifests,
      [{ quote: "Test", template: "bg.jpg", filename: "test.png" }],
      "cli",
      "default.md",
      undefined,
      NOW,
    );
    expect(manifest.images[0].status).toBe("pending");
  });

  it("attaches captions when provided", () => {
    const manifests = emptyManifests();
    const captions = [
      [{ commentary: "Nice!", hashtags: ["#cool"] }, { commentary: "Great!", hashtags: ["#awesome"] }],
    ];
    const manifest = createBatchInManifests(
      manifests,
      [{ quote: "Test", template: "bg.jpg", filename: "test.png" }],
      "cli",
      "default.md",
      captions,
      NOW,
    );
    expect(manifest.images[0].captions).toHaveLength(2);
    expect(manifest.images[0].captions![0].commentary).toBe("Nice!");
  });

  it("selects first caption option as default", () => {
    const manifests = emptyManifests();
    const captions = [
      [{ commentary: "First", hashtags: [] }, { commentary: "Second", hashtags: [] }],
    ];
    const manifest = createBatchInManifests(
      manifests,
      [{ quote: "Test", template: "bg.jpg", filename: "test.png" }],
      "cli",
      "default.md",
      captions,
      NOW,
    );
    expect(manifest.images[0].caption?.commentary).toBe("First");
    expect(manifest.images[0].selectedCaptionIndex).toBe(0);
  });

  it("sets caption and selectedCaptionIndex as undefined when no captions", () => {
    const manifests = emptyManifests();
    const manifest = createBatchInManifests(
      manifests,
      [{ quote: "Test", template: "bg.jpg", filename: "test.png" }],
      "cli",
      "default.md",
      undefined,
      NOW,
    );
    expect(manifest.images[0].caption).toBeUndefined();
    expect(manifest.images[0].selectedCaptionIndex).toBeUndefined();
  });

  it("sets promptTemplate on each image", () => {
    const manifests = emptyManifests();
    const manifest = createBatchInManifests(
      manifests,
      [{ quote: "Test", template: "bg.jpg", filename: "test.png" }],
      "cli",
      "my-template.md",
      undefined,
      NOW,
    );
    expect(manifest.images[0].promptTemplate).toBe("my-template.md");
  });
});

// ── getAllBatchesFromManifests ─────────────────────────────────────

describe("getAllBatchesFromManifests", () => {
  it("returns batch summaries with image and approved counts", () => {
    const result = getAllBatchesFromManifests(seededManifests());
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("2026-07-10-001");
    expect(result[0].imageCount).toBe(2);
    expect(result[0].approvedCount).toBe(1);
    expect(result[1].id).toBe("2026-07-11-001");
    expect(result[1].imageCount).toBe(3);
    expect(result[1].approvedCount).toBe(1);
  });

  it("returns empty array for empty manifests", () => {
    expect(getAllBatchesFromManifests([])).toEqual([]);
  });
});

// ── getAllImagesFromManifests ──────────────────────────────────────

describe("getAllImagesFromManifests", () => {
  it("returns all images from all batches (most recent first)", () => {
    const result = getAllImagesFromManifests(seededManifests());
    expect(result).toHaveLength(5);
    // Most recent batch first, images reversed within batch
    expect(result[0].batchId).toBe("2026-07-11-001");
    expect(result[0].image.id).toBe("img-003");
    expect(result[3].batchId).toBe("2026-07-10-001");
  });

  it("filters by status", () => {
    const result = getAllImagesFromManifests(seededManifests(), "approved");
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.image.status === "approved")).toBe(true);
  });

  it("returns empty array for empty manifests", () => {
    expect(getAllImagesFromManifests([])).toEqual([]);
  });
});

// ── markImagesAsReviewedInManifests ────────────────────────────────

describe("markImagesAsReviewedInManifests", () => {
  it("sets reviewed=true on matching images", () => {
    const manifests = seededManifests();
    const result = markImagesAsReviewedInManifests(manifests, [
      { batchId: "2026-07-11-001", imageId: "img-001" },
    ]);
    expect(result.count).toBe(1);
    const img = manifests.find((m) => m.batch.id === "2026-07-11-001")!.images[0];
    expect(img.reviewed).toBe(true);
  });

  it("returns count of reviewed images", () => {
    const manifests = seededManifests();
    const result = markImagesAsReviewedInManifests(manifests, [
      { batchId: "2026-07-11-001", imageId: "img-001" },
      { batchId: "2026-07-11-001", imageId: "img-002" },
      { batchId: "2026-07-10-001", imageId: "img-001" },
    ]);
    expect(result.count).toBe(3);
  });

  it("skips non-existent batch IDs", () => {
    const manifests = seededManifests();
    const result = markImagesAsReviewedInManifests(manifests, [
      { batchId: "nonexistent", imageId: "img-001" },
    ]);
    expect(result.count).toBe(0);
  });

  it("skips non-existent image IDs", () => {
    const manifests = seededManifests();
    const result = markImagesAsReviewedInManifests(manifests, [
      { batchId: "2026-07-11-001", imageId: "nonexistent" },
    ]);
    expect(result.count).toBe(0);
  });

  it("does not duplicate reviewed flag on re-marking", () => {
    const manifests = seededManifests();
    markImagesAsReviewedInManifests(manifests, [
      { batchId: "2026-07-11-001", imageId: "img-001" },
    ]);
    const result = markImagesAsReviewedInManifests(manifests, [
      { batchId: "2026-07-11-001", imageId: "img-001" },
    ]);
    // Still counts as 1 — the image was already reviewed
    expect(result.count).toBe(1);
  });
});
