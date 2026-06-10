import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { DatabaseSync } from "node:sqlite";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const backupPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(root, "data/erp.sqlite.bak-202606010611");

const tmp = path.join(os.tmpdir(), `pdf-bak-${Date.now()}.sqlite`);
fs.copyFileSync(backupPath, tmp);
const db = new DatabaseSync(tmp, { readOnly: true });
const count = db.prepare("SELECT COUNT(*) AS c FROM pdf_archives").get().c;
const rows = db.prepare("SELECT id, file_name, subject_name, storage_path, created_at FROM pdf_archives ORDER BY created_at DESC").all();
db.close();
fs.unlinkSync(tmp);

const pdfDir = path.join(root, "data/pdf-archives");
const files = fs.existsSync(pdfDir)
  ? new Set(fs.readdirSync(pdfDir).filter((name) => name.endsWith(".pdf")))
  : new Set();

let missingFiles = 0;
for (const row of rows) {
  const name = path.basename(String(row.storage_path || `${row.id}.pdf`));
  if (!files.has(name)) missingFiles += 1;
}

console.log(
  JSON.stringify(
    {
      backupPath,
      backupMeta: count,
      pdfFilesOnDisk: files.size,
      backupRowsMissingFile: missingFiles,
      sample: rows.slice(0, 8).map((row) => ({
        id: row.id,
        subject: row.subject_name,
        file: path.basename(row.storage_path || ""),
        hasFile: files.has(path.basename(String(row.storage_path || `${row.id}.pdf`))),
      })),
    },
    null,
    2,
  ),
);
