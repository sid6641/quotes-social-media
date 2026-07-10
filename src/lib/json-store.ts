/**
 * Generic file-backed JSON store — a single deep module replacing
 * the duplicated read/write/cache/ensureDir pattern across 5 modules.
 *
 * Interface: get(), set(data), invalidate()
 *
 * Tests can swap in a memory-backed adapter without touching the filesystem.
 * Two adapters justify the seam: FileStore in production, MemoryStore in tests.
 */

import fs from "fs";
import path from "path";

// ─── Types ─────────────────────────────────────────────────────────────

export interface JsonStore<T> {
  /** Read the current data. Returns defaultData on first call or file error. */
  get(): T;
  /** Replace all data and persist to disk. */
  set(data: T): void;
  /** Clear the in-memory cache — next get() re-reads from disk. */
  invalidate(): void;
}

// ─── File-backed adapter ──────────────────────────────────────────────

/**
 * Create a JSON store backed by a file on disk.
 *
 * @param filePath  Absolute path to the JSON file
 * @param defaultData  Value returned when the file doesn't exist or is corrupt
 */
export function createFileStore<T>(
  filePath: string,
  defaultData: T
): JsonStore<T> {
  let cache: T | null = null;

  function ensureDir(): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  return {
    get(): T {
      if (cache !== null) return cache;
      ensureDir();
      if (!fs.existsSync(filePath)) {
        cache = defaultData;
        return cache as T;
      }
      try {
        const raw = fs.readFileSync(filePath, "utf-8");
        cache = JSON.parse(raw) as T;
        return cache as T;
      } catch {
        cache = defaultData;
        return cache as T;
      }
    },

    set(data: T): void {
      ensureDir();
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
      cache = data;
    },

    invalidate(): void {
      cache = null;
    },
  };
}

// ─── In-memory adapter (for tests) ────────────────────────────────────

/**
 * Create an in-memory JSON store. Identical interface, no filesystem.
 * Use in tests to avoid temp directories and real I/O.
 */
export function createMemoryStore<T>(defaultData: T): JsonStore<T> {
  let data: T = defaultData;
  return {
    get(): T {
      return data;
    },
    set(newData: T): void {
      data = newData;
    },
    invalidate(): void {
      // no-op — memory store doesn't cache separately from data
    },
  };
}
