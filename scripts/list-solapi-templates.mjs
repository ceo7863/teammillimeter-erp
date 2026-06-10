import crypto from "crypto";
import { loadEnv } from "../server/loadEnv.mjs";
import { config } from "../server/config.mjs";

loadEnv();

function authHeader() {
  const date = new Date()
    .toLocaleString("sv-SE", { timeZone: "Asia/Seoul", hour12: false })
    .replace("T", " ");
  const salt = crypto.randomBytes(8).toString("hex");
  const signature = crypto
    .createHmac("sha256", config.alimtalk.apiSecret)
    .update(date + salt)
    .digest("hex");
  return `HMAC-SHA256 apiKey=${config.alimtalk.apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Authorization: authHeader() } });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { ok: res.ok, status: res.status, body };
}

const pfId = config.alimtalk.senderKey;
const paths = [
  `https://api.solapi.com/kakao/v2/templates?pfId=${encodeURIComponent(pfId)}`,
  `https://api.solapi.com/kakao/v2/templates/sendable?pfId=${encodeURIComponent(pfId)}`,
  `https://api.solapi.com/kakao/v1/templates?pfId=${encodeURIComponent(pfId)}`,
];

for (const url of paths) {
  const result = await fetchJson(url);
  console.log("\n===", url, "status", result.status, "===");
  console.log(JSON.stringify(result.body, null, 2).slice(0, 4000));
}
