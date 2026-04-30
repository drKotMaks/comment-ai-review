import OpenAI from "openai";

const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS || 20000);
const OPENAI_MAX_RETRIES = Number(process.env.OPENAI_MAX_RETRIES || 1);

let client;

function getClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for AI mode");
  }

  if (!client) {
    client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: OPENAI_TIMEOUT_MS,
      maxRetries: OPENAI_MAX_RETRIES
    });
  }

  return client;
}

export async function createEmbedding(text) {
  const response = await getClient().embeddings.create({
    model: EMBEDDING_MODEL,
    input: text
  });

  return response.data[0].embedding;
}
