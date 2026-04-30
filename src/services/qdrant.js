import { QdrantClient } from "@qdrant/js-client-rest";

const COLLECTION_NAME = process.env.QDRANT_COLLECTION || "reviews";

let client;

function getClient() {
  if (!client) {
    client = new QdrantClient({
      url: process.env.QDRANT_URL || "http://localhost:6333",
      apiKey: process.env.QDRANT_API_KEY || undefined
    });
  }

  return client;
}

export async function searchSimilarReviews(vector, limit = 5) {
  return getClient().search(COLLECTION_NAME, {
    vector,
    limit,
    with_payload: true
  });
}

export async function ensureReviewsCollection(vectorSize = 1536) {
  const qdrant = getClient();
  const collections = await qdrant.getCollections();
  const exists = collections.collections.some((collection) => collection.name === COLLECTION_NAME);

  if (exists) {
    const collection = await qdrant.getCollection(COLLECTION_NAME);
    const existingSize = collection.config?.params?.vectors?.size;

    if (existingSize && existingSize !== vectorSize) {
      throw new Error(
        `Qdrant collection "${COLLECTION_NAME}" has vector size ${existingSize}, expected ${vectorSize}`
      );
    }

    return;
  }

  await qdrant.createCollection(COLLECTION_NAME, {
    vectors: {
      size: vectorSize,
      distance: "Cosine"
    }
  });
}

export async function upsertReviewPoints(points) {
  return getClient().upsert(COLLECTION_NAME, {
    wait: true,
    points
  });
}

export async function getExistingPointIds(ids) {
  const points = await getClient().retrieve(COLLECTION_NAME, {
    ids,
    with_payload: false,
    with_vector: false
  });

  return new Set(points.map((point) => point.id));
}
