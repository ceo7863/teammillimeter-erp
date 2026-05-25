import bcrypt from "bcryptjs";
import { DatabaseSync } from "node:sqlite";

const loginId = process.argv[2] || "admin";
const password = process.argv[3] || "1234";

const db = new DatabaseSync("data/erp.sqlite");
const hash = bcrypt.hashSync(password, 10);
const result = db
  .prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE login_id = ?")
  .run(hash, loginId);

if (!result.changes) {
  console.error(`User not found: ${loginId}`);
  process.exit(1);
}

console.log(`Password reset for ${loginId}`);
