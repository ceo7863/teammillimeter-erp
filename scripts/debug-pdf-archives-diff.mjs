import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { DatabaseSync } from "node:sqlite";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const currentPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(root, "data/erp.sqlite");
const backupPath = process.argv[3]
  ? path.resolve(process.argv[3])
  : path.join(root, "data/erp.sqlite.bak-202606010611");

function readPdfMeta(dbPath) {
  const tmp = path.join(os.tmpdir(), `pdf-check-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`);
  fs.copyFileSync(dbPath, tmp);
  const db = new DatabaseSync(tmp, { readOnly: true });
  const count = db.prepare("SELECT COUNT(*) AS c FROM pdf_archives").get().c;
  const rows = db.prepare("SELECT * FROM pdf_archives").all();
  db.close();
  fs.unlinkSync(tmp);
  return { count, rows };
}

const cur = readPdfMeta(currentPath);
const bak = readPdfMeta(backupPath);
const curIds = new Set(cur.rows.map((row) => row.id));
const bakOnly = bak.rows.filter((row) => !curIds.has(row.id));

const pdfDir = path.join(root, "data/pdf-archives");
const files = fs.existsSync(pdfDir)
  ? new Set(fs.readdirSync(pdfDir).filter((name) => name.endsWith(".pdf")))
  : new Set();

function rowFileName(row) {
  return path.basename(String(row.storage_path || `${row.id}.pdf`));
}

const bakOnlyMissingFile = bakOnly.filter((row) => !files.has(rowFileName(row)));
const orphanFiles = [...files].filter(
  (name) => !cur.rows.some((row) => rowFileName(row) === name) && !bakOnly.some((row) => rowFileName(row) === name),
);

console.log(
  JSON.stringify(
    {
      currentPath,
      backupPath,
      currentMeta: cur.count,
      backupMeta: bak.count,
      backupOnlyMeta: bakOnly.length,
      pdfFilesOnDisk: files.size,
      backupOnlyMissingFile: bakOnlyMissingFile.length,
      orphanPdfFiles: orphanFiles.length,
      sampleBackupOnly: bakOnly.slice(0, 5).map((row) => ({
        id: row.id,
        subject: row.subject_name,
        file: rowFileName(row),
        hasFile: files.has(rowFileName(row)),
      })),
    },
    null,
    2,
  ),
);
