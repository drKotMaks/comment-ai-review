export function classifyFromNeighbors(neighbors) {
  if (!Array.isArray(neighbors) || neighbors.length === 0) {
    throw new Error("No neighbors returned from Qdrant");
  }

  return {
    recommended: majorityVote(neighbors, "recommended"),
    reviewer_segment: mostFrequent(neighbors, "category")
  };
}

function majorityVote(neighbors, payloadField) {
  const counts = new Map();

  for (const neighbor of neighbors) {
    const value = Number(neighbor.payload?.[payloadField]);

    if (Number.isNaN(value)) {
      continue;
    }

    counts.set(value, (counts.get(value) || 0) + 1);
  }

  return highestCount(counts, 1);
}

function mostFrequent(neighbors, payloadField) {
  const counts = new Map();

  for (const neighbor of neighbors) {
    const value = neighbor.payload?.[payloadField];

    if (!value) {
      continue;
    }

    counts.set(value, (counts.get(value) || 0) + 1);
  }

  return highestCount(counts, "overall_wearability_and_value");
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
