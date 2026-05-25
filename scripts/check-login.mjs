import bcrypt from "bcryptjs";
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("data/erp.sqlite");
const users = db.prepare("SELECT login_id, password_hash FROM users").all();

for (const user of users) {
  const ok = bcrypt.compareSync("1234", user.password_hash);
  console.log(`${user.login_id}: password 1234 => ${ok}`);
}

const response = await fetch("http://127.0.0.1:8080/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ loginId: "admin", password: "1234" }),
});
const text = await response.text();
console.log("login status", response.status, text);
