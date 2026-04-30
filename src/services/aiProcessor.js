import { classifyFromNeighbors } from "./classifier.js";
import { createEmbedding } from "./embedding.js";
import { searchSimilarReviews } from "./qdrant.js";

const AI_ROW_TIMEOUT_MS = Number(process.env.AI_ROW_TIMEOUT_MS || 30000);

export async function processReviewWithAi(reviewText) {
  return withTimeout(processReview(reviewText), AI_ROW_TIMEOUT_MS);
}

async function processReview(reviewText) {
  const embedding = await createEmbedding(reviewText);
  const neighbors = await searchSimilarReviews(embedding, 5);

  return classifyFromNeighbors(neighbors);
}

function withTimeout(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`AI processing timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    })
  ]);
}
