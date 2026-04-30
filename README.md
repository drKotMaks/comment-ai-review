# CSV Review Processor

Simple Node.js backend that accepts a CSV of user reviews and returns a processed CSV with:

- `recommended`
- `reviewer_segment`

The default mode is keyword-based. AI mode uses OpenAI embeddings plus nearest-neighbor lookup in Qdrant.

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

## API

```bash
curl -X POST http://localhost:3000/process-csv \
  -F "file=@data/test.csv" \
  -o processed.csv
```

AI mode:

```bash
curl -X POST "http://localhost:3000/process-csv?mode=ai" \
  -F "file=@data/test.csv" \
  -o processed.csv
```

Input CSV columns:

- `id`
- `review_text`

The service also accepts `content` as an alias for `review_text`, which matches the included sample files.

Output CSV columns:

- `id`
- `review_text`
- `recommended`
- `reviewer_segment`

## Qdrant

Start Qdrant:

```bash
docker compose up -d qdrant
```

Seed the `reviews` collection from the included training file:

```bash
OPENAI_API_KEY=... npm run seed:qdrant -- data/train.csv
```

The collection uses vectors with size `1536`, matching `text-embedding-3-small`.

## Error Handling

- Missing upload: `400`
- Missing required CSV headers: `400`
- Missing row review text: row is returned with `reviewer_segment=missing_review_text`
- AI mode external failure: row falls back to simple mode
