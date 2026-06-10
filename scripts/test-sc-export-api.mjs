import fs from "fs";

const envText = fs.readFileSync("/home/ubuntu/teammillimeter-erp/.env", "utf8");
const secret = envText.match(/^SC_SYNC_SECRET=(.+)$/m)?.[1]?.trim() || "";
console.log("secret_len", secret.length);

const url = "https://sc.teammillimeter.com/api/erp/schedule-export?start=2026-06-01&end=2026-06-30";
const res = await fetch(url, { headers: { Authorization: `Bearer ${secret}` } });
const text = await res.text();
console.log("http", res.status);
console.log(text.slice(0, 300));
