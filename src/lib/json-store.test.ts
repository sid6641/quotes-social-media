import { describe, it, expect } from "vitest";
import { createMemoryStore } from "./json-store";

describe("createMemoryStore", () => {
  // ── Basic get/set ────────────────────────────────────────────────

  it("returns default data on first get()", () => {
    const store = createMemoryStore<number[]>([]);
    expect(store.get()).toEqual([]);
  });

  it("returns data that was set", () => {
    const store = createMemoryStore<number[]>([]);
    store.set([1, 2, 3]);
    expect(store.get()).toEqual([1, 2, 3]);
  });

  it("overwrites data on subsequent set() calls", () => {
    const store = createMemoryStore<number[]>([]);
    store.set([1, 2]);
    store.set([3, 4]);
    expect(store.get()).toEqual([3, 4]);
  });

  // ── Isolation from mutation ──────────────────────────────────────

  it("protects internal state from mutation via get() (structuredClone)", () => {
    const store = createMemoryStore<number[]>([1, 2, 3]);
    const data = store.get();
    data.push(4);
    expect(store.get()).toEqual([1, 2, 3]);
  });

  it("protects internal state from mutation via set() (structuredClone)", () => {
    const original = [1, 2, 3];
    const store = createMemoryStore<number[]>([]);
    store.set(original);
    original.push(4);
    expect(store.get()).toEqual([1, 2, 3]);
  });

  it("protects default data from mutation", () => {
    const defaultData = [1, 2, 3];
    const store = createMemoryStore<number[]>(defaultData);
    defaultData.push(4);
    expect(store.get()).toEqual([1, 2, 3]);
  });

  // ── Complex data types ───────────────────────────────────────────

  it("handles nested objects", () => {
    interface User {
      name: string;
      tags: string[];
    }
    const store = createMemoryStore<User[]>([]);
    store.set([{ name: "Alice", tags: ["admin"] }]);
    const data = store.get();
    data[0].tags.push("editor");
    expect(store.get()).toEqual([{ name: "Alice", tags: ["admin"] }]);
  });

  it("handles objects with Date values", () => {
    const date = new Date("2026-07-12");
    const store = createMemoryStore<{ createdAt: Date }[]>([{ createdAt: date }]);
    const data = store.get();
    expect(data[0].createdAt).toEqual(date);
  });

  // ── invalidate() ────────────────────────────────────────────────

  it("invalidate() is a no-op — data unchanged after set()", () => {
    const store = createMemoryStore<number[]>([]);
    store.set([42]);
    store.invalidate();
    expect(store.get()).toEqual([42]);
  });

  it("invalidate() returns default if nothing was set", () => {
    const store = createMemoryStore<number[]>([0]);
    store.invalidate();
    // Memory store: invalidate doesn't reset to default
    expect(store.get()).toEqual([0]);
  });

  // ── Generic type flexibility ─────────────────────────────────────

  it("works with string data", () => {
    const store = createMemoryStore<string>("hello");
    expect(store.get()).toBe("hello");
    store.set("world");
    expect(store.get()).toBe("world");
  });

  it("works with number data", () => {
    const store = createMemoryStore<number>(0);
    store.set(42);
    expect(store.get()).toBe(42);
  });

  it("works with null default", () => {
    const store = createMemoryStore<null>(null);
    expect(store.get()).toBeNull();
  });

  it("works with Record types", () => {
    const store = createMemoryStore<Record<string, number>>({ a: 1 });
    expect(store.get()).toEqual({ a: 1 });
    store.set({ b: 2 });
    expect(store.get()).toEqual({ b: 2 });
  });
});
