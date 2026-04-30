export const REVIEWER_SEGMENTS = new Set([
  "fit_and_sizing",
  "material_and_quality",
  "style_and_appearance",
  "overall_wearability_and_value"
]);

export function classifyFromNeighbors(neighbors) {
  if (!Array.isArray(neighbors) || neighbors.length === 0) {
    throw new Error("No neighbors returned from Qdrant");
  }

  return {
    recommended: weightedVote(neighbors, "recommended", 1, normalizeRecommended),
    reviewer_segment: weightedVote(
      neighbors,
      "category",
      "overall_wearability_and_value",
      normalizeReviewerSegment
    )
  };
}

export function normalizeReviewerSegment(value) {
  if (REVIEWER_SEGMENTS.has(value)) {
    return value;
  }

  return "overall_wearability_and_value";
}

function normalizeRecommended(value) {
  const numericValue = Number(value);

  if (numericValue === 0 || numericValue === 1) {
    return numericValue;
  }

  return undefined;
}

function weightedVote(neighbors, payloadField, fallback, normalizeValue) {
  const counts = new Map();

  for (const neighbor of neighbors) {
    const value = normalizeValue(neighbor.payload?.[payloadField]);

    if (value === undefined) {
      continue;
    }

    const weight = typeof neighbor.score === "number" ? Math.max(neighbor.score, 0.001) : 1;
    counts.set(value, (counts.get(value) || 0) + weight);
  }

  return highestCount(counts, fallback);
}

function highestCount(counts, fallback) {
  let winner = fallback;
  let bestCount = 0;

  for (const [value, count] of counts.entries()) {
    if (count > bestCount) {
      winner = value;
      bestCount = count;
    }
  }

  return winner;
}
