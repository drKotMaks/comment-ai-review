import fs from "node:fs";
import crypto from "node:crypto";
import { Transform } from "node:stream";
import multer from "multer";
import express from "express";
import { createCsvReader, getReviewText, validateCsvHeaders } from "../utils/csvReader.js";
import { createCsvWriter } from "../utils/csvWriter.js";
import { processReviewWithAi } from "../services/aiProcessor.js";
import { processReviewSimple } from "../services/simpleProcessor.js";

const router = express.Router();
const upload = multer({
  dest: "uploads/",
  limits: {
    fileSize: 10 * 1024 * 1024
  }
});

function isAiMode(req) {
  return req.query.mode === "ai";
}

function createProcessingTransform({ requestId, useAi }) {
  let processedRows = 0;

  return new Transform({
    objectMode: true,
    async transform(row, _encoding, callback) {
      const reviewText = getReviewText(row).trim();

      try {
        const processed = reviewText
          ? await processRow(reviewText, useAi)
          : { recommended: "", reviewer_segment: "missing_review_text" };

        processedRows += 1;

        if (processedRows === 1 || processedRows % 10 === 0) {
          console.info(`[${requestId}] processed ${processedRows} rows`);
        }

        callback(null, {
          id: row.id,
          recommended: processed.recommended,
          reviewer_segment: processed.reviewer_segment
        });
      } catch (error) {
        callback(error);
      }
    }
  });
}

async function processRow(reviewText, useAi) {
  if (!useAi) {
    return processReviewSimple(reviewText);
  }

  try {
    return await processReviewWithAi(reviewText);
  } catch (error) {
    console.warn(`AI mode failed, falling back to simple mode: ${error.message}`);
    return processReviewSimple(reviewText);
  }
}

router.post("/process-csv", upload.single("file"), (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({ error: "CSV file is required in form field 'file'" });
  }

  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  const mode = isAiMode(req) ? "ai" : "simple";

  console.info(
    `[${requestId}] /process-csv started mode=${mode} file=${req.file.originalname} size=${req.file.size}`
  );

  const inputStream = fs.createReadStream(req.file.path);
  const parser = createCsvReader();
  const processor = createProcessingTransform({ requestId, useAi: isAiMode(req) });
  const writer = createCsvWriter();

  const cleanup = () => {
    fs.promises.unlink(req.file.path).catch(() => {});
  };

  const failBeforeResponse = (error) => {
    cleanup();
    next(error);
  };

  parser.once("headers", (headers) => {
    try {
      validateCsvHeaders(headers);
    } catch (error) {
      inputStream.destroy();
      parser.destroy();
      failBeforeResponse(error);
      return;
    }

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="processed-reviews.csv"');
    writer.pipe(res);
  });

  inputStream.once("error", failBeforeResponse);
  parser.once("error", failBeforeResponse);
  processor.once("error", (error) => {
    cleanup();
    if (!res.headersSent) {
      next(error);
      return;
    }
    res.destroy(error);
  });
  writer.once("error", (error) => {
    cleanup();
    next(error);
  });
  writer.once("finish", cleanup);
  res.once("finish", () => {
    console.info(`[${requestId}] /process-csv finished in ${Date.now() - startedAt}ms`);
  });
  req.once("aborted", () => {
    console.warn(`[${requestId}] /process-csv request aborted by client`);
  });

  inputStream.pipe(parser).pipe(processor).pipe(writer);
});

export default router;
