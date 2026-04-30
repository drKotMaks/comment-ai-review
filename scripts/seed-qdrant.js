import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import csvParser from "csv-parser";
import { createEmbedding, EMBEDDING_DIMENSIONS } from "../src/services/embedding.js";
import { ensureReviewsCollection, getExistingPointIds, upsertReviewPoints } from "../src/services/qdrant.js";

const sourceFile = process.argv[2] || "data/train.csv";
const BATCH_SIZE = 10;
const MAX_UPSERT_ATTEMPTS = 3;

await ensureReviewsCollection(EMBEDDING_DIMENSIONS);

let batch = [];
let seeded = 0;
let skipped = 0;

for await (const row of fs.createReadStream(sourceFile).pipe(csvParser())) {
  const text = row.review_text || row.content;

  if (!row.id || !text || row.recommended === undefined || !row.reviewer_segment) {
    continue;
  }

  const pointId = toPointId(row.id);
  const existingIds = await getExistingPointIds([pointId]);

  if (existingIds.has(pointId)) {
    skipped += 1;
    continue;
  }

  const vector = await createEmbedding(text);

  batch.push({
    id: pointId,
    vector,
    payload: {
      text,
      recommended: Number(row.recommended),
      category: row.reviewer_segment
    }
  });

  if (batch.length >= BATCH_SIZE) {
    await flushBatch(batch);
    seeded += batch.length;
    batch = [];
    console.log(`Seeded ${seeded} reviews, skipped ${skipped} existing`);
  }
}

if (batch.length > 0) {
  await flushBatch(batch);
  seeded += batch.length;
}

console.log(`Finished seeding ${seeded} new reviews into Qdrant, skipped ${skipped} existing`);

async function flushBatch(points) {
  for (let attempt = 1; attempt <= MAX_UPSERT_ATTEMPTS; attempt += 1) {
    try {
      await upsertReviewPoints(points);
      return;
    } catch (error) {
      if (attempt === MAX_UPSERT_ATTEMPTS) {
        throw error;
      }

      const delayMs = attempt * 1000;
      console.warn(
        `Qdrant upsert failed on attempt ${attempt}, retrying in ${delayMs}ms: ${error.message}`
      );
      await sleep(delayMs);
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function toPointId(id) {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return id;
  }

  const hash = crypto.createHash("sha256").update(id).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
