import { DatabaseSync } from "node:sqlite";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dbPath = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, "data/erp.sqlite");

const db = new DatabaseSync(dbPath, { readOnly: true });
const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table'")
  .all()
  .map((row) => row.name);
const hasPdf = tables.includes("pdf_archives");
const count = hasPdf ? db.prepare("SELECT COUNT(*) AS c FROM pdf_archives").get().c : 0;
console.log("db", dbPath);
console.log("pdf_archives", count);

if (hasPdf && count > 0) {
  const sample = db
    .prepare(
      "SELECT id, file_name, subject_name, period_start, period_end, storage_path FROM pdf_archives ORDER BY created_at DESC LIMIT 5",
    )
    .all();
  console.log("sample", sample);
}

const dir = path.join(root, "data/pdf-archives");
if (fs.existsSync(dir)) {
  const files = fs.readdirSync(dir).filter((name) => name.endsWith(".pdf"));
  console.log("pdf files", files.length);
}
