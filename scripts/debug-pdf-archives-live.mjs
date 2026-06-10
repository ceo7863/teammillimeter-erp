import { getDb } from "../server/db.mjs";

const db = getDb();
try {
  const count = db.prepare("SELECT COUNT(*) AS c FROM pdf_archives").get().c;
  console.log("count", count);
  const rows = db.prepare("SELECT id, file_name, subject_name FROM pdf_archives ORDER BY created_at DESC LIMIT 5").all();
  console.log("sample", rows);
} catch (error) {
  console.error("query error", error.message);
}

try {
  const integrity = db.prepare("PRAGMA integrity_check").get();
  console.log("integrity", integrity);
} catch (error) {
  console.error("integrity error", error.message);
}
