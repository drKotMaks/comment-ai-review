import { classifyFromNeighbors } from "./classifier.js";
import { createEmbedding, EMBEDDING_DIMENSIONS } from "./embedding.js";
import { ensureReviewsCollection, searchSimilarReviews } from "./qdrant.js";

const AI_ROW_TIMEOUT_MS = Number(process.env.AI_ROW_TIMEOUT_MS || 30000);
let collectionReadyPromise;

export async function processReviewWithAi(reviewText) {
  return withTimeout(processReview(reviewText), AI_ROW_TIMEOUT_MS);
}

async function processReview(reviewText) {
  collectionReadyPromise ||= ensureReviewsCollection(EMBEDDING_DIMENSIONS);
  await collectionReadyPromise;

  const embedding = await createEmbedding(reviewText);
  const neighbors = await searchSimilarReviews(embedding, 11);

  return classifyFromNeighbors(neighbors);
}

function withTimeout(promise, timeoutMs) {
  let timeoutId;

  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`AI processing timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    clearTimeout(timeoutId);
  });
}
