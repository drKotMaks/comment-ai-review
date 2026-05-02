import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import csvParser from "csv-parser";
import { processReviewWithAi } from "../src/services/aiProcessor.js";
import { REVIEWER_SEGMENTS } from "../src/services/classifier.js";

const argv = parseArgs(process.argv.slice(2));
const sourceFile = argv.file || "data/train.csv";
const sampleSize = Number(argv.sample || 80);
const seed = Number(argv.seed || 42);
const concurrency = Math.max(1, Number(argv.concurrency || 4));

const allRows = await readRows(sourceFile);
const labeledRows = allRows.filter((row) => {
  const text = row.review_text || row.content;
  return text && row.recommended !== undefined && row.reviewer_segment;
});

if (labeledRows.length === 0) {
  console.error(`No labeled rows in ${sourceFile}`);
  process.exit(1);
}

const sample = stratifiedSample(labeledRows, sampleSize, seed);

console.log(
  `Evaluating ${sample.length} rows from ${sourceFile} (concurrency=${concurrency}, AI_USE_LLM=${process.env.AI_USE_LLM ?? "true"})`
);

const startedAt = Date.now();
const predictions = await runWithConcurrency(sample, concurrency, async (row, index) => {
  const text = row.review_text || row.content;
  const excludeIds = [toPointId(row.id)];

  try {
    const predicted = await processReviewWithAi(text, { excludeIds });
    return {
      id: row.id,
      true_recommended: Number(row.recommended),
      true_segment: row.reviewer_segment,
      pred_recommended: Number(predicted.recommended),
      pred_segment: predicted.reviewer_segment
    };
  } catch (error) {
    console.warn(`[${index + 1}/${sample.length}] failed for ${row.id}: ${error.message}`);
    return null;
  }
});

const finished = predictions.filter(Boolean);
const elapsedMs = Date.now() - startedAt;

const macroRecommended = macroF1(
  finished.map((p) => p.true_recommended),
  finished.map((p) => p.pred_recommended),
  [0, 1]
);
const macroSegment = macroF1(
  finished.map((p) => p.true_segment),
  finished.map((p) => p.pred_segment),
  [...REVIEWER_SEGMENTS]
);

const finalScore = 0.5 * macroRecommended.macro + 0.5 * macroSegment.macro;

console.log("\n=== Macro-F1: recommended (0/1) ===");
printPerClass(macroRecommended);
console.log("\n=== Macro-F1: reviewer_segment (4 classes) ===");
printPerClass(macroSegment);

console.log("\n=== Score ===");
console.log(`Macro-F1 recommended:       ${macroRecommended.macro.toFixed(4)}`);
console.log(`Macro-F1 reviewer_segment: ${macroSegment.macro.toFixed(4)}`);
console.log(`Final score (0.5 + 0.5):    ${finalScore.toFixed(4)}`);
console.log(`\nProcessed ${finished.length}/${sample.length} rows in ${(elapsedMs / 1000).toFixed(1)}s`);

if (argv.errors) {
  const wrong = finished.filter(
    (p) => p.pred_recommended !== p.true_recommended || p.pred_segment !== p.true_segment
  );
  console.log(`\n=== Misclassifications (${wrong.length}) ===`);
  for (const row of wrong) {
    console.log(
      `${row.id} | recommended ${row.true_recommended}->${row.pred_recommended} | segment ${row.true_segment}->${row.pred_segment}`
    );
  }
}

function parseArgs(args) {
  const out = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = args[i + 1];
    if (next && !next.startsWith("--")) {
      out[key] = next;
      i += 1;
    } else {
      out[key] = true;
    }
  }
  return out;
}

async function readRows(path) {
  const rows = [];
  for await (const row of fs.createReadStream(path).pipe(csvParser())) {
    rows.push(row);
  }
  return rows;
}

function stratifiedSample(rows, size, seedValue) {
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.recommended}|${row.reviewer_segment}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const rng = mulberry32(seedValue);
  for (const list of groups.values()) {
    shuffle(list, rng);
  }

  const totalGroups = groups.size;
  const perGroup = Math.max(1, Math.floor(size / totalGroups));

  const picked = [];
  for (const list of groups.values()) {
    picked.push(...list.slice(0, perGroup));
  }

  if (picked.length < size) {
    const remaining = rows.filter((row) => !picked.includes(row));
    shuffle(remaining, rng);
    picked.push(...remaining.slice(0, size - picked.length));
  }

  return picked.slice(0, size);
}

function shuffle(list, rng) {
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
}

function mulberry32(seedValue) {
  let a = seedValue >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function runWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  let completed = 0;

  async function next() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
      completed += 1;

      if (completed === 1 || completed % 10 === 0 || completed === items.length) {
        console.log(`  progress: ${completed}/${items.length}`);
      }
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => next());
  await Promise.all(workers);
  return results;
}

function macroF1(trueLabels, predLabels, classes) {
  const perClass = classes.map((cls) => {
    let tp = 0;
    let fp = 0;
    let fn = 0;
    for (let i = 0; i < trueLabels.length; i += 1) {
      const t = trueLabels[i];
      const p = predLabels[i];
      if (p === cls && t === cls) tp += 1;
      else if (p === cls && t !== cls) fp += 1;
      else if (p !== cls && t === cls) fn += 1;
    }
    const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
    const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
    const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
    const support = tp + fn;
    return { cls, precision, recall, f1, support };
  });

  const macro = perClass.reduce((sum, item) => sum + item.f1, 0) / perClass.length;
  return { perClass, macro };
}

function printPerClass(report) {
  for (const item of report.perClass) {
    console.log(
      `  ${String(item.cls).padEnd(34)} P=${item.precision.toFixed(3)} R=${item.recall.toFixed(3)} F1=${item.f1.toFixed(3)} support=${item.support}`
    );
  }
}

function toPointId(id) {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return id;
  }
  const hash = crypto.createHash("sha256").update(id).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
