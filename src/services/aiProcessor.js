import { classifyFromNeighbors } from "./classifier.js";
import { createEmbedding } from "./embedding.js";
import { searchSimilarReviews } from "./qdrant.js";

export async function processReviewWithAi(reviewText) {
  const embedding = await createEmbedding(reviewText);
  const neighbors = await searchSimilarReviews(embedding, 5);

  return classifyFromNeighbors(neighbors);
}
