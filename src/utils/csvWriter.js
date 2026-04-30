import { format } from "@fast-csv/format";

export function createCsvWriter() {
  return format({
    headers: ["id", "recommended", "reviewer_segment"],
    writeHeaders: true
  });
}
