Ок, зберу тобі **повний backend-only репозиторій**, який можна клонувати і запускати. Це вже не демка — це **чіткий skeleton під production**, але без зайвого шуму. 

---

# 🧠 📦 FINAL REPO STRUCTURE

```bash
ai-review-system/
│
├── backend/
│   ├── src/
│   │   ├── routes/
│   │   │   └── predict.js
│   │   ├── services/
│   │   │   ├── embedding.js
│   │   │   ├── qdrant.js
│   │   │   ├── rerank.js
│   │   │   ├── llm.js
│   │   │   └── agent.js
│   │   ├── utils/
│   │   │   └── logger.js
│   │   ├── app.js
│   │   └── server.js
│   ├── package.json
│   ├── Dockerfile
│   └── .env.example
│
├── data/
│   └── train.csv
│
├── scripts/
│   └── seed-qdrant.js
│
├── docker-compose.yml
└── README.md
```

---

# ⚙️ backend/package.json

```json
{
  "name": "ai-review-backend",
  "type": "module",
  "scripts": {
    "dev": "node src/server.js"
  },
  "dependencies": {
    "axios": "^1.6.0",
    "dotenv": "^16.4.0",
    "express": "^4.18.2",
    "@qdrant/js-client-rest": "^1.8.0",
    "openai": "^4.0.0",
    "csv-parser": "^3.0.0"
  }
}
```

---

# 🔌 server.js

```js
import app from "./app.js";

app.listen(3000, () => {
  console.log("🚀 API running on http://localhost:3000");
});
```

---

# ⚙️ app.js

```js
import express from "express";
import dotenv from "dotenv";
import predictRoute from "./routes/predict.js";

dotenv.config();

const app = express();
app.use(express.json());

app.use("/predict", predictRoute);

export default app;
```

---

# 🔮 routes/predict.js

```js
import express from "express";
import { runAgent } from "../services/agent.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { review_text } = req.body;

    const result = await runAgent(review_text);

    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
```

---

# 🧠 services/agent.js

```js
import { getEmbedding } from "./embedding.js";
import { searchSimilar } from "./qdrant.js";
import { rerank } from "./rerank.js";
import { llmDecision } from "./llm.js";

export async function runAgent(text) {
  const embedding = await getEmbedding(text);

  const candidates = await searchSimilar(embedding);

  const top = rerank(text, candidates);

  const result = await llmDecision(text, top);

  return result;
}
```

---

# 🔗 services/embedding.js

```js
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function getEmbedding(text) {
  const res = await client.embeddings.create({
    model: "text-embedding-3-small",
    input: text
  });

  return res.data[0].embedding;
}
```

---

# 🔎 services/qdrant.js

```js
import { QdrantClient } from "@qdrant/js-client-rest";

const client = new QdrantClient({
  url: "http://qdrant:6333"
});

export async function searchSimilar(vector) {
  const result = await client.search("reviews", {
    vector,
    limit: 10
  });

  return result;
}
```

---

# 🧠 services/rerank.js

```js
function keywordOverlap(a, b) {
  const setA = new Set(a.toLowerCase().split(" "));
  const setB = new Set(b.toLowerCase().split(" "));
  return [...setA].filter(x => setB.has(x)).length;
}

export function rerank(query, candidates) {
  return candidates
    .map(c => {
      const overlap = keywordOverlap(query, c.payload.text);

      return {
        ...c,
        finalScore: c.score * 0.7 + overlap * 0.3
      };
    })
    .sort((a, b) => b.finalScore - a.finalScore)
    .slice(0, 5);
}
```

---

# 🧠 services/llm.js

```js
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function llmDecision(text, examples) {
  const prompt = `
Review:
"${text}"

Similar:
${examples.map(e => `- ${e.payload.text} → ${e.payload.category}`).join("\n")}

Return JSON:
{
  "recommended": number,
  "reviewer_segment": string,
  "confidence": number,
  "explanation": string
}
`;

  const res = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    messages: [{ role: "user", content: prompt }]
  });

  return JSON.parse(res.choices[0].message.content);
}
```

---

# 📥 scripts/seed-qdrant.js

```js
import fs from "fs";
import csv from "csv-parser";
import { QdrantClient } from "@qdrant/js-client-rest";
import OpenAI from "openai";

const client = new QdrantClient({ url: "http://localhost:6333" });

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function embed(text) {
  const res = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text
  });

  return res.data[0].embedding;
}

async function run() {
  const points = [];

  await new Promise(resolve => {
    fs.createReadStream("./data/train.csv")
      .pipe(csv())
      .on("data", async row => {
        const vector = await embed(row.review_text);

        points.push({
          id: crypto.randomUUID(),
          vector,
          payload: {
            text: row.review_text,
            category: row.reviewer_segment,
            recommended: Number(row.recommended)
          }
        });
      })
      .on("end", resolve);
  });

  await client.upsert("reviews", { points });

  console.log("Seed complete");
}

run();
```

---

# 🐳 Dockerfile (backend)

```dockerfile
FROM node:20

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

CMD ["node", "src/server.js"]
```

---

# 🐳 docker-compose.yml

```yaml
version: "3.9"

services:
  backend:
    build: ./backend
    ports:
      - "3000:3000"
    depends_on:
      - qdrant

  qdrant:
    image: qdrant/qdrant
    ports:
      - "6333:6333"
```

---

# 🔐 .env.example

```env
OPENAI_API_KEY=your_key_here
```

---

# 🚀 README.md (коротко)

```md
# AI Review System

## Setup

cp backend/.env.example backend/.env

## Run

docker-compose up --build

## Seed data

node scripts/seed-qdrant.js

## Test

POST http://localhost:3000/predict

{
  "review_text": "Great material but too small"
}
```

