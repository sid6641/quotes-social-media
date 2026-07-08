/**
 * Hashtag bank — named sets of reusable hashtags.
 *
 * Users can create sets like "motivation", "philosophy", "life" and
 * apply them to any post's caption alongside the generated tags.
 */
import fs from "fs";
import path from "path";

export interface HashtagSet {
  name: string;
  tags: string[];
}

interface HashtagStore {
  sets: HashtagSet[];
}

const STORE_PATH = path.resolve(process.cwd(), "output", "hashtag-bank.json");

let storeCache: HashtagStore | null = null;

function ensureDir(): void {
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readStore(): HashtagStore {
  if (storeCache) return storeCache;
  ensureDir();
  if (!fs.existsSync(STORE_PATH)) {
    storeCache = { sets: [] };
    return storeCache;
  }
  try {
    const raw = fs.readFileSync(STORE_PATH, "utf-8");
    storeCache = JSON.parse(raw) as HashtagStore;
    return storeCache;
  } catch {
    storeCache = { sets: [] };
    return storeCache;
  }
}

function writeStore(store: HashtagStore): void {
  ensureDir();
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), "utf-8");
  storeCache = store;
}

export function invalidateHashtagCache(): void {
  storeCache = null;
}

/** Get all hashtag sets. */
export function getHashtagSets(): HashtagSet[] {
  return readStore().sets;
}

/** Add or update a hashtag set by name. */
export function upsertHashtagSet(name: string, tags: string[]): HashtagSet {
  const store = readStore();
  const clean = tags
    .map((t) => (t.startsWith("#") ? t : `#${t}`))
    .filter((t) => t.length > 1);

  const existing = store.sets.find((s) => s.name === name);
  if (existing) {
    existing.tags = clean;
  } else {
    store.sets.push({ name, tags: clean });
  }
  writeStore(store);
  return existing || store.sets[store.sets.length - 1];
}

/** Delete a hashtag set by name. */
export function deleteHashtagSet(name: string): boolean {
  const store = readStore();
  const idx = store.sets.findIndex((s) => s.name === name);
  if (idx === -1) return false;
  store.sets.splice(idx, 1);
  writeStore(store);
  return true;
}

/** Merge the tags from named sets into a flat array (deduped). */
export function mergeHashtagSets(setNames: string[]): string[] {
  const store = readStore();
  const all: string[] = [];
  for (const name of setNames) {
    const set = store.sets.find((s) => s.name === name);
    if (set) all.push(...set.tags);
  }
  const unique: string[] = [];
  for (const t of all) {
    if (!unique.includes(t)) unique.push(t);
  }
  return unique;
}
