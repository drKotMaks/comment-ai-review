export const REVIEWER_SEGMENTS = new Set([
  "fit_and_sizing",
  "material_and_quality",
  "style_and_appearance",
  "overall_wearability_and_value"
]);

const DEFAULT_RECOMMENDED_LIMIT = Number(process.env.AI_RECOMMENDED_NEIGHBORS || 7);
const DEFAULT_REVIEWER_SEGMENT_LIMIT = Number(process.env.AI_REVIEWER_SEGMENT_NEIGHBORS || 11);
const DEFAULT_SCORE_POWER = Number(process.env.AI_SCORE_POWER || 6);
const DEFAULT_MAX_SCORE_DISTANCE = Number(process.env.AI_MAX_SCORE_DISTANCE || 0.04);

export function classifyFromNeighbors(neighbors) {
  if (!Array.isArray(neighbors) || neighbors.length === 0) {
    throw new Error("No neighbors returned from Qdrant");
  }

  const rankedNeighbors = [...neighbors].sort((a, b) => {
    return (b.score || 0) - (a.score || 0);
  });
  const recommendedNeighbors = selectCloseNeighbors(rankedNeighbors, DEFAULT_RECOMMENDED_LIMIT);
  const reviewerSegmentNeighbors = selectCloseNeighbors(rankedNeighbors, DEFAULT_REVIEWER_SEGMENT_LIMIT);

  return {
    recommended: weightedVote(recommendedNeighbors, "recommended", 1, normalizeRecommended),
    reviewer_segment: weightedVote(
      reviewerSegmentNeighbors,
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

function selectCloseNeighbors(neighbors, limit) {
  const limitedNeighbors = neighbors.slice(0, limit);
  const bestScore = limitedNeighbors[0]?.score;

  if (typeof bestScore !== "number") {
    return limitedNeighbors;
  }

  const closeNeighbors = limitedNeighbors.filter((neighbor) => {
    return typeof neighbor.score === "number" && neighbor.score >= bestScore - DEFAULT_MAX_SCORE_DISTANCE;
  });

  return closeNeighbors.length > 0 ? closeNeighbors : limitedNeighbors.slice(0, 1);
}

function weightedVote(neighbors, payloadField, fallback, normalizeValue) {
  const counts = new Map();

  for (const neighbor of neighbors) {
    const value = normalizeValue(neighbor.payload?.[payloadField]);

    if (value === undefined) {
      continue;
    }

    const score = typeof neighbor.score === "number" ? Math.max(neighbor.score, 0.001) : 1;
    const weight = Math.pow(score, DEFAULT_SCORE_POWER);
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
