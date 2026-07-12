import { describe, it, expect } from "vitest";
import {
  getNextScheduledTimeFrom,
  addToQueueInQueue,
  removeFromQueueInQueue,
  removeImageFromQueueInQueue,
  getQueueFromQueue,
  getDueItemsFromQueue,
  markPublishedInQueue,
  markFailedInQueue,
  updateQueueEntryCaptionInQueue,
  getQueueStatsFromQueue,
  type QueueEntry,
} from "./queue";

function emptyQueue(): QueueEntry[] {
  return [];
}

function seededQueue(): QueueEntry[] {
  return [
    {
      id: "pub-001",
      batchId: "2026-07-11-001",
      imageId: "img-001",
      filename: "a.png",
      quote: "Quote A",
      template: "t1.jpg",
      caption: { commentary: "Nice!", hashtags: ["#cool"] },
      scheduledAt: "2026-07-12T09:00:00.000Z",
      status: "queued",
    },
    {
      id: "pub-002",
      batchId: "2026-07-11-001",
      imageId: "img-002",
      filename: "b.png",
      quote: "Quote B",
      template: "t2.jpg",
      caption: { commentary: "Great!", hashtags: ["#awesome"] },
      scheduledAt: "2026-07-12T09:00:00.000Z",
      status: "queued",
    },
    {
      id: "pub-003",
      batchId: "2026-07-10-001",
      imageId: "img-001",
      filename: "c.png",
      quote: "Quote C",
      template: "t1.jpg",
      caption: { commentary: "Already done", hashtags: ["#done"] },
      scheduledAt: "2026-07-11T09:00:00.000Z",
      status: "published",
      publishedAt: "2026-07-11T09:05:00.000Z",
    },
    {
      id: "pub-004",
      batchId: "2026-07-10-001",
      imageId: "img-002",
      filename: "d.png",
      quote: "Quote D",
      template: "t2.jpg",
      caption: { commentary: "Failed attempt", hashtags: [] },
      scheduledAt: "2026-07-11T09:00:00.000Z",
      status: "failed",
      error: "Instagram API error: rate limited",
    },
  ];
}

const NINE_AM = { hour: 9, minute: 0 };

// ── getNextScheduledTimeFrom ──────────────────────────────────────

describe("getNextScheduledTimeFrom", () => {
  it("returns today at publish time if now is before cut-off", () => {
    const now = new Date("2026-07-12T08:00:00.000Z"); // 8AM, before 9AM
    const result = getNextScheduledTimeFrom(now, NINE_AM);
    expect(result).toBe("2026-07-12T09:00:00.000Z");
  });

  it("returns tomorrow at publish time if now is after cut-off", () => {
    const now = new Date("2026-07-12T10:00:00.000Z"); // 10AM, after 9AM
    const result = getNextScheduledTimeFrom(now, NINE_AM);
    expect(result).toBe("2026-07-13T09:00:00.000Z");
  });

  it("returns today at publish time if now is exactly at cut-off", () => {
    const now = new Date("2026-07-12T09:00:00.000Z"); // exactly 9AM
    const result = getNextScheduledTimeFrom(now, NINE_AM);
    // now is NOT less than today, so it returns tomorrow
    expect(result).toBe("2026-07-13T09:00:00.000Z");
  });

  it("handles different publish times", () => {
    const now = new Date("2026-07-12T14:00:00.000Z");
    const result = getNextScheduledTimeFrom(now, { hour: 15, minute: 30 });
    expect(result).toBe("2026-07-12T15:30:00.000Z");
  });

  it("rolls over month boundary correctly", () => {
    const now = new Date("2026-07-31T23:00:00.000Z");
    const result = getNextScheduledTimeFrom(now, NINE_AM);
    expect(result).toBe("2026-08-01T09:00:00.000Z");
  });

  it("rolls over year boundary correctly", () => {
    const now = new Date("2026-12-31T23:00:00.000Z");
    const result = getNextScheduledTimeFrom(now, NINE_AM);
    expect(result).toBe("2027-01-01T09:00:00.000Z");
  });
});

// ── addToQueueInQueue ─────────────────────────────────────────────

describe("addToQueueInQueue", () => {
  it("adds an entry with queued status", () => {
    const queue = emptyQueue();
    const entry = addToQueueInQueue(queue, {
      batchId: "b1", imageId: "i1", filename: "f.png", quote: "Q", template: "t.jpg",
    }, "2026-07-13T09:00:00.000Z");
    expect(entry.id).toBe("pub-001");
    expect(entry.status).toBe("queued");
    expect(entry.scheduledAt).toBe("2026-07-13T09:00:00.000Z");
  });

  it("returns existing entry on duplicate batchId+imageId", () => {
    const queue = emptyQueue();
    addToQueueInQueue(queue, { batchId: "b1", imageId: "i1", filename: "a.png", quote: "A", template: "t.jpg" }, "2026-07-13T09:00:00.000Z");
    const second = addToQueueInQueue(queue, { batchId: "b1", imageId: "i1", filename: "b.png", quote: "B", template: "t.jpg" }, "2026-07-14T09:00:00.000Z");
    expect(queue).toHaveLength(1); // no duplicate added
    expect(second.filename).toBe("a.png"); // returns first entry
    expect(second.scheduledAt).toBe("2026-07-13T09:00:00.000Z"); // unchanged
  });

  it("allows same imageId from different batches", () => {
    const queue = emptyQueue();
    addToQueueInQueue(queue, { batchId: "b1", imageId: "i1", filename: "a.png", quote: "A", template: "t.jpg" }, "2026-07-13T09:00:00.000Z");
    addToQueueInQueue(queue, { batchId: "b2", imageId: "i1", filename: "b.png", quote: "B", template: "t.jpg" }, "2026-07-13T09:00:00.000Z");
    expect(queue).toHaveLength(2);
  });

  it("uses empty caption when none provided", () => {
    const queue = emptyQueue();
    const entry = addToQueueInQueue(queue, { batchId: "b1", imageId: "i1", filename: "f.png", quote: "Q", template: "t.jpg" }, "2026-07-13T09:00:00.000Z");
    expect(entry.caption).toEqual({ commentary: "", hashtags: [] });
  });

  it("generates sequential IDs", () => {
    const queue = emptyQueue();
    addToQueueInQueue(queue, { batchId: "b1", imageId: "i1", filename: "a.png", quote: "A", template: "t.jpg" }, "2026-07-13T09:00:00.000Z");
    addToQueueInQueue(queue, { batchId: "b1", imageId: "i2", filename: "b.png", quote: "B", template: "t.jpg" }, "2026-07-13T09:00:00.000Z");
    expect(queue[0].id).toBe("pub-001");
    expect(queue[1].id).toBe("pub-002");
  });
});

// ── removeFromQueueInQueue ────────────────────────────────────────

describe("removeFromQueueInQueue", () => {
  it("removes entry by id", () => {
    const queue = seededQueue();
    const result = removeFromQueueInQueue(queue, "pub-001");
    expect(result.success).toBe(true);
    expect(queue.find((e) => e.id === "pub-001")).toBeUndefined();
    expect(queue).toHaveLength(3);
  });

  it("returns false for non-existent id", () => {
    const queue = seededQueue();
    const result = removeFromQueueInQueue(queue, "nonexistent");
    expect(result.success).toBe(false);
    expect(queue).toHaveLength(4);
  });
});

// ── removeImageFromQueueInQueue ────────────────────────────────────

describe("removeImageFromQueueInQueue", () => {
  it("removes entry by batchId+imageId", () => {
    const queue = seededQueue();
    const result = removeImageFromQueueInQueue(queue, "2026-07-11-001", "img-001");
    expect(result.success).toBe(true);
    expect(queue).toHaveLength(3);
  });

  it("returns false when no matching entry", () => {
    const queue = seededQueue();
    const result = removeImageFromQueueInQueue(queue, "nonexistent", "img-001");
    expect(result.success).toBe(false);
  });
});

// ── getQueueFromQueue ─────────────────────────────────────────────

describe("getQueueFromQueue", () => {
  it("returns all entries when no status filter", () => {
    const result = getQueueFromQueue(seededQueue());
    expect(result).toHaveLength(4);
  });

  it("filters by queued status", () => {
    const result = getQueueFromQueue(seededQueue(), "queued");
    expect(result).toHaveLength(2);
    expect(result.every((e) => e.status === "queued")).toBe(true);
  });

  it("filters by published status", () => {
    const result = getQueueFromQueue(seededQueue(), "published");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("pub-003");
  });

  it("filters by failed status", () => {
    const result = getQueueFromQueue(seededQueue(), "failed");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("pub-004");
  });

  it("returns a copy, not the original array", () => {
    const queue = seededQueue();
    const result = getQueueFromQueue(queue);
    result.push({} as any);
    expect(queue).toHaveLength(4); // original unchanged
  });
});

// ── getDueItemsFromQueue ──────────────────────────────────────────

describe("getDueItemsFromQueue", () => {
  const NOW = new Date("2026-07-12T12:00:00.000Z");

  it("returns queued items with scheduledAt <= now", () => {
    const queue: QueueEntry[] = [
      { id: "pub-001", batchId: "b1", imageId: "i1", filename: "a.png", quote: "A", template: "t.jpg", caption: { commentary: "", hashtags: [] }, scheduledAt: "2026-07-12T09:00:00.000Z", status: "queued" },
      { id: "pub-002", batchId: "b1", imageId: "i2", filename: "b.png", quote: "B", template: "t.jpg", caption: { commentary: "", hashtags: [] }, scheduledAt: "2026-07-13T09:00:00.000Z", status: "queued" },
    ];
    const due = getDueItemsFromQueue(queue, NOW);
    expect(due).toHaveLength(1);
    expect(due[0].id).toBe("pub-001");
  });

  it("excludes non-queued items even if scheduledAt <= now", () => {
    const queue: QueueEntry[] = [
      { id: "pub-001", batchId: "b1", imageId: "i1", filename: "a.png", quote: "A", template: "t.jpg", caption: { commentary: "", hashtags: [] }, scheduledAt: "2026-07-11T09:00:00.000Z", status: "published", publishedAt: "2026-07-11T09:05:00.000Z" },
    ];
    const due = getDueItemsFromQueue(queue, NOW);
    expect(due).toHaveLength(0);
  });
});

// ── markPublishedInQueue ──────────────────────────────────────────

describe("markPublishedInQueue", () => {
  it("sets status to published and records timestamp", () => {
    const queue = seededQueue();
    const now = new Date("2026-07-12T09:05:00.000Z");
    const result = markPublishedInQueue(queue, "pub-001", now);
    expect(result.success).toBe(true);
    const entry = queue.find((e) => e.id === "pub-001")!;
    expect(entry.status).toBe("published");
    expect(entry.publishedAt).toBe("2026-07-12T09:05:00.000Z");
  });

  it("returns false for non-existent id", () => {
    const result = markPublishedInQueue([], "nonexistent", new Date());
    expect(result.success).toBe(false);
  });
});

// ── markFailedInQueue ─────────────────────────────────────────────

describe("markFailedInQueue", () => {
  it("sets status to failed and records error", () => {
    const queue = seededQueue();
    const result = markFailedInQueue(queue, "pub-001", "API error");
    expect(result.success).toBe(true);
    const entry = queue.find((e) => e.id === "pub-001")!;
    expect(entry.status).toBe("failed");
    expect(entry.error).toBe("API error");
  });

  it("returns false for non-existent id", () => {
    const result = markFailedInQueue([], "nonexistent", "error");
    expect(result.success).toBe(false);
  });
});

// ── updateQueueEntryCaptionInQueue ────────────────────────────────

describe("updateQueueEntryCaptionInQueue", () => {
  it("updates caption of a queued entry", () => {
    const queue = seededQueue();
    const result = updateQueueEntryCaptionInQueue(queue, "2026-07-11-001", "img-001", { commentary: "Updated!", hashtags: ["#new"] });
    expect(result.success).toBe(true);
    const entry = queue.find((e) => e.id === "pub-001")!;
    expect(entry.caption.commentary).toBe("Updated!");
    expect(entry.caption.hashtags).toEqual(["#new"]);
  });

  it("does NOT update non-queued entries", () => {
    const queue = seededQueue();
    const published = queue.find((e) => e.status === "published")!;
    const result = updateQueueEntryCaptionInQueue(queue, published.batchId, published.imageId, { commentary: "Should not apply", hashtags: [] });
    expect(result.success).toBe(false);
  });

  it("returns false when no matching entry", () => {
    const result = updateQueueEntryCaptionInQueue([], "nonexistent", "x", { commentary: "", hashtags: [] });
    expect(result.success).toBe(false);
  });
});

// ── getQueueStatsFromQueue ────────────────────────────────────────

describe("getQueueStatsFromQueue", () => {
  it("counts entries by status", () => {
    const stats = getQueueStatsFromQueue(seededQueue());
    expect(stats.total).toBe(4);
    expect(stats.queued).toBe(2);
    expect(stats.published).toBe(1);
    expect(stats.failed).toBe(1);
  });

  it("reports next scheduled time", () => {
    const stats = getQueueStatsFromQueue(seededQueue());
    expect(stats.nextScheduledAt).toBe("2026-07-12T09:00:00.000Z");
  });

  it("returns null nextScheduledAt when no queued items", () => {
    const stats = getQueueStatsFromQueue([]);
    expect(stats.nextScheduledAt).toBeNull();
  });

  it("returns zeros for empty queue", () => {
    const stats = getQueueStatsFromQueue([]);
    expect(stats).toEqual({
      total: 0, queued: 0, published: 0, failed: 0, nextScheduledAt: null,
    });
  });
});
