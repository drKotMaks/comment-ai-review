import "dotenv/config";
import express from "express";
import processCsvRouter from "./routes/processCsv.js";

const app = express();

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use(processCsvRouter);

app.use((err, _req, res, _next) => {
  console.error(err);

  if (res.headersSent) {
    return;
  }

  res.status(err.statusCode || 500).json({
    error: err.message || "Internal server error"
  });
});

export default app;
