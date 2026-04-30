import { format } from "@fast-csv/format";

export function createCsvWriter() {
  return format({
    headers: ["id", "review_text", "recommended", "reviewer_segment"],
    writeHeaders: true
  });
}
