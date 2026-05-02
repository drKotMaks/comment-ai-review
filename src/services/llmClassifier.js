import OpenAI from "openai";
import { REVIEWER_SEGMENTS, normalizeReviewerSegment } from "./classifier.js";

const LLM_MODEL = process.env.OPENAI_LLM_MODEL || "gpt-4o-mini";
const LLM_TIMEOUT_MS = Number(process.env.OPENAI_LLM_TIMEOUT_MS || 30000);
const LLM_MAX_RETRIES = Number(process.env.OPENAI_LLM_MAX_RETRIES || 1);
const LLM_EXAMPLES = Number(process.env.AI_LLM_EXAMPLES || 12);
const LLM_EXAMPLE_CHARS = Number(process.env.AI_LLM_EXAMPLE_CHARS || 480);
const LLM_REVIEW_CHARS = Number(process.env.AI_LLM_REVIEW_CHARS || 1500);
const LLM_TEMPERATURE_RAW = process.env.OPENAI_LLM_TEMPERATURE;


const SYSTEM_PROMPT = [
  "You are a precise classifier for women's fashion product reviews written in English or Ukrainian.",
  "Return STRICT JSON only: {\"recommended\": 0 or 1, \"reviewer_segment\": one of fit_and_sizing | material_and_quality | style_and_appearance | overall_wearability_and_value}.",
  "",
  "Definitions of reviewer_segment (pick the SINGLE dominant topic the reviewer is arguing about):",
  "- fit_and_sizing: size, runs large/small, length, posadka, rozmir, talia, bedra, dovzhyna, plechi, hips, bust, shoulders, waist, sleeves.",
  "- material_and_quality: fabric, sewing, stitching, see-through, sheer, pilling, shrinking after wash, tkanyna, materialy, yakist, prozora, blyskavka, shvy, durability.",
  "- style_and_appearance: visual look, color, pattern, design, photo vs reality, vyglyad, koliv, dyzayn, vizerunok, flattering/unflattering look.",
  "- overall_wearability_and_value: comfort to wear, versatility, occasion fit, price/value, zruchnist, tsina, varta svoyih hroshey, day-to-day usability.",
  "",
  "Rules:",
  "1. recommended=1 if the reviewer ultimately keeps/loves it OR strongly recommends it.",
  "2. recommended=0 if returned, sent back, povernula, povertayu, regrets, would not buy again, disappointed enough to refund.",
  "3. Final action (kept vs returned) outweighs early praise. \"Beautiful but had to return\" => recommended=0.",
  "4. If the reviewer praises but mentions one flaw and does NOT return => recommended=1.",
  "5. For reviewer_segment pick the topic that takes the MOST space and drives the verdict. Mentions of color or fabric in passing do not override a length/sizing complaint.",
  "6. Compare with the labeled reference examples below. They were chosen to cover all four segments and both recommended values."
].join("\n");

let client;

function getClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for LLM classifier");
  }

  if (!client) {
    client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: LLM_TIMEOUT_MS,
      maxRetries: LLM_MAX_RETRIES
    });
  }

  return client;
}

function truncate(text, max) {
  if (typeof text !== "string") {
    return "";
  }

  if (text.length <= max) {
    return text;
  }

  return `${text.slice(0, max).trim()}…`;
}

function diversifyNeighbors(neighbors, totalLimit) {
  const valid = neighbors.filter((neighbor) => {
    const payload = neighbor?.payload;
    return (
      payload &&
      typeof payload.text === "string" &&
      REVIEWER_SEGMENTS.has(payload.category) &&
      (Number(payload.recommended) === 0 || Number(payload.recommended) === 1)
    );
  });

  if (valid.length === 0) {
    return [];
  }

  const ranked = [...valid].sort((a, b) => (b.score || 0) - (a.score || 0));
  const seen = new Set();
  const buckets = new Map();
  const order = [];

  for (const neighbor of ranked) {
    const key = `${neighbor.payload.category}|${Number(neighbor.payload.recommended)}`;

    if (!buckets.has(key)) {
      buckets.set(key, []);
      order.push(key);
    }

    buckets.get(key).push(neighbor);
  }

  const picked = [];

  for (let round = 0; round < 3 && picked.length < totalLimit; round += 1) {
    for (const key of order) {
      if (picked.length >= totalLimit) break;
      const bucket = buckets.get(key);
      const next = bucket.shift();
      if (next && !seen.has(next)) {
        picked.push(next);
        seen.add(next);
      }
    }
  }

  for (const neighbor of ranked) {
    if (picked.length >= totalLimit) break;
    if (!seen.has(neighbor)) {
      picked.push(neighbor);
      seen.add(neighbor);
    }
  }

  return picked.sort((a, b) => (b.score || 0) - (a.score || 0));
}

function buildExamplesBlock(neighbors) {
  const usable = diversifyNeighbors(neighbors, LLM_EXAMPLES);

  if (usable.length === 0) {
    return "(no similar examples available)";
  }

  return usable
    .map((neighbor, index) => {
      const score = typeof neighbor.score === "number" ? neighbor.score.toFixed(3) : "n/a";
      const text = truncate(neighbor.payload.text, LLM_EXAMPLE_CHARS);
      return [
        `Example ${index + 1} (similarity ${score}):`,
        `Review: """${text}"""`,
        `recommended: ${Number(neighbor.payload.recommended) === 0 ? 0 : 1}`,
        `reviewer_segment: ${neighbor.payload.category}`
      ].join("\n");
    })
    .join("\n\n");
}

function parseJsonResponse(rawContent) {
  if (typeof rawContent !== "string") {
    throw new Error("LLM returned empty content");
  }

  try {
    return JSON.parse(rawContent);
  } catch (error) {
    const match = rawContent.match(/\{[\s\S]*\}/);

    if (match) {
      return JSON.parse(match[0]);
    }

    throw new Error(`LLM returned non-JSON content: ${error.message}`);
  }
}

function normalizeRecommended(value) {
  const numeric = Number(value);

  if (numeric === 0 || numeric === 1) {
    return numeric;
  }

  return 1;
}

function shouldSendTemperature(model) {
  if (!model) return true;
  const lower = model.toLowerCase();
  if (lower.startsWith("o1") || lower.startsWith("o3") || lower.startsWith("o4")) return false;
  if (lower.startsWith("gpt-5")) return false;
  return true;
}

function buildRequest(messages) {
  const request = {
    model: LLM_MODEL,
    response_format: { type: "json_object" },
    messages
  };

  if (shouldSendTemperature(LLM_MODEL)) {
    const parsed = LLM_TEMPERATURE_RAW === undefined ? 0 : Number(LLM_TEMPERATURE_RAW);
    if (Number.isFinite(parsed)) {
      request.temperature = parsed;
    }
  }

  return request;
}

export async function classifyWithLlm(reviewText, neighbors) {
  const examplesBlock = buildExamplesBlock(neighbors);
  const userPrompt = [
    "Classify the review and return STRICT JSON.",
    "",
    "Labeled reference examples (diversified across segments and recommended values):",
    examplesBlock,
    "",
    "---",
    "Review to classify:",
    `"""${truncate(reviewText, LLM_REVIEW_CHARS)}"""`,
    "",
    "Respond with JSON only: {\"recommended\": 0 or 1, \"reviewer_segment\": fit_and_sizing|material_and_quality|style_and_appearance|overall_wearability_and_value}."
  ].join("\n");

  const response = await getClient().chat.completions.create(
    buildRequest([
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt }
    ])
  );

  const parsed = parseJsonResponse(response.choices?.[0]?.message?.content);

  return {
    recommended: normalizeRecommended(parsed.recommended),
    reviewer_segment: normalizeReviewerSegment(parsed.reviewer_segment)
  };
}
