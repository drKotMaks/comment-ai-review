import csvParser from "csv-parser";

const REVIEW_TEXT_FIELDS = ["review_text", "content"];

export function createCsvReader() {
  return csvParser({
    strict: true,
    mapHeaders: ({ header }) => header?.trim()
  });
}

export function validateCsvHeaders(headers = []) {
  const normalized = new Set(headers);
  const hasReviewText = REVIEW_TEXT_FIELDS.some((field) => normalized.has(field));

  if (!normalized.has("id")) {
    throw Object.assign(new Error("Invalid CSV: missing required 'id' column"), {
      statusCode: 400
    });
  }

  if (!hasReviewText) {
    throw Object.assign(
      new Error("Invalid CSV: missing required 'review_text' column"),
      { statusCode: 400 }
    );
  }
}

export function getReviewText(row) {
  for (const field of REVIEW_TEXT_FIELDS) {
    if (typeof row[field] === "string") {
      return row[field];
    }
  }

  return "";
}
