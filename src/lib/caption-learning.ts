/**
 * Caption learning store.
 *
 * Records which caption options users pick (or how they edit them).
 * Over time, the best examples are used as few-shot prompts to improve
 * future caption generation.
 */
import fs from "fs";
import path from "path";
import type { CaptionData } from "./caption";

export interface CaptionExample {
  quote: string;
  template: string;
  chosenCaption: CaptionData;
  chosenIndex: number; // -1 = custom edited
  wasEdited: boolean;
  pickCount: number;
  lastPickedAt: string;
}

interface LearningStore {
  examples: CaptionExample[];
}

const STORE_PATH =
  process.env.CAPTION_LEARNING_STORE ||
  path.resolve(process.cwd(), "output", "caption-examples.json");

function readStore(): LearningStore {
  try {
    if (!fs.existsSync(STORE_PATH)) {
      return { examples: [] };
    }
    const raw = fs.readFileSync(STORE_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return { examples: [] };
  }
}

function writeStore(store: LearningStore): void {
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), "utf-8");
}

/**
 * Record that a user picked a caption option (or edited one).
 *
 * - If an identical caption was picked before, increment its pickCount.
 * - If it's new, add it as a fresh example.
 */
export function recordCaptionPick(params: {
  quote: string;
  template: string;
  allOptions: CaptionData[];
  chosenIndex: number;
  chosenCaption: CaptionData;
  wasEdited: boolean;
}): void {
  const store = readStore();

  // Normalize the chosen caption to a stable key for dedup
  const key = JSON.stringify(params.chosenCaption);

  const existing = store.examples.find(
    (e) => JSON.stringify(e.chosenCaption) === key
  );

  if (existing) {
    existing.pickCount += 1;
    existing.lastPickedAt = new Date().toISOString();
  } else {
    store.examples.push({
      quote: params.quote,
      template: params.template,
      chosenCaption: params.chosenCaption,
      chosenIndex: params.chosenIndex,
      wasEdited: params.wasEdited,
      pickCount: 1,
      lastPickedAt: new Date().toISOString(),
    });
  }

  // Keep only top 50 examples to prevent unbounded growth
  store.examples.sort((a, b) => b.pickCount - a.pickCount);
  if (store.examples.length > 50) {
    store.examples = store.examples.slice(0, 50);
  }

  writeStore(store);
}

/**
 * Get the top N caption examples for few-shot prompting,
 * sorted by pickCount (most popular first).
 */
export function getTopExamples(count: number = 3): CaptionExample[] {
  const store = readStore();
  return store.examples
    .filter((e) => e.chosenCaption?.commentary)
    .sort((a, b) => b.pickCount - a.pickCount)
    .slice(0, count);
}

/**
 * Get learning store stats for display/debugging.
 */
export function getLearningStats(): {
  totalExamples: number;
  topPicks: Array<{ preview: string; picks: number }>;
} {
  const top = getTopExamples(5);
  return {
    totalExamples: readStore().examples.length,
    topPicks: top.map((e) => ({
      preview: e.chosenCaption.commentary.substring(0, 60),
      picks: e.pickCount,
    })),
  };
}
