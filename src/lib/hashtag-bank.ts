/**
 * Hashtag bank — named sets of reusable hashtags.
 *
 * Users can create sets like "motivation", "philosophy", "life" and
 * apply them to any post's caption alongside the generated tags.
 */
import path from "path";
import { createFileStore } from "./json-store";

export interface HashtagSet {
  name: string;
  tags: string[];
}

interface HashtagStoreData {
  sets: HashtagSet[];
}

const STORE_PATH = path.resolve(process.cwd(), "output", "hashtag-bank.json");
const store = createFileStore<HashtagStoreData>(STORE_PATH, { sets: [] });

export function invalidateHashtagCache(): void {
  store.invalidate();
}

/** Get all hashtag sets. */
export function getHashtagSets(): HashtagSet[] {
  return store.get().sets;
}

/** Add or update a hashtag set by name. */
export function upsertHashtagSet(name: string, tags: string[]): HashtagSet {
  const data = store.get();
  const clean = tags
    .map((t) => (t.startsWith("#") ? t : `#${t}`))
    .filter((t) => t.length > 1);

  const existing = data.sets.find((s) => s.name === name);
  if (existing) {
    existing.tags = clean;
  } else {
    data.sets.push({ name, tags: clean });
  }
  store.set(data);
  return existing || data.sets[data.sets.length - 1];
}

/** Delete a hashtag set by name. */
export function deleteHashtagSet(name: string): boolean {
  const data = store.get();
  const idx = data.sets.findIndex((s) => s.name === name);
  if (idx === -1) return false;
  data.sets.splice(idx, 1);
  store.set(data);
  return true;
}

/** Merge the tags from named sets into a flat array (deduped). */
export function mergeHashtagSets(setNames: string[]): string[] {
  const data = store.get();
  const all: string[] = [];
  for (const name of setNames) {
    const set = data.sets.find((s) => s.name === name);
    if (set) all.push(...set.tags);
  }
  const unique: string[] = [];
  for (const t of all) {
    if (!unique.includes(t)) unique.push(t);
  }
  return unique;
}
