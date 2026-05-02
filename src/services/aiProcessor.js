import { classifyFromNeighbors } from "./classifier.js";
import { classifyWithLlm } from "./llmClassifier.js";
import { createEmbedding, EMBEDDING_DIMENSIONS } from "./embedding.js";
import { ensureReviewsCollection, searchSimilarReviews } from "./qdrant.js";

const AI_ROW_TIMEOUT_MS = Number(process.env.AI_ROW_TIMEOUT_MS || 30000);
const AI_NEIGHBOR_LIMIT = Number(process.env.AI_NEIGHBOR_LIMIT || 32);
const AI_USE_LLM = String(process.env.AI_USE_LLM ?? "true").toLowerCase() !== "false";

let collectionReadyPromise;

export async function processReviewWithAi(reviewText, options = {}) {
  return withTimeout(processReview(reviewText, options), AI_ROW_TIMEOUT_MS);
}

async function processReview(reviewText, { excludeIds } = {}) {
  await ensureCollectionReady();

  const embedding = await createEmbedding(reviewText);
  const neighbors = await searchSimilarReviews(embedding, AI_NEIGHBOR_LIMIT, { excludeIds });

  if (!AI_USE_LLM) {
    return classifyFromNeighbors(neighbors);
  }

  try {
    return await classifyWithLlm(reviewText, neighbors);
  } catch (error) {
    console.warn(`LLM classifier failed, falling back to kNN vote: ${error.message}`);
    return classifyFromNeighbors(neighbors);
  }
}

async function ensureCollectionReady() {
  collectionReadyPromise ||= ensureReviewsCollection(EMBEDDING_DIMENSIONS);

  try {
    await collectionReadyPromise;
  } catch (error) {
    collectionReadyPromise = undefined;
    throw error;
  }
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
