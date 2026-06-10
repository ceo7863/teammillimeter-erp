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

const id = config.alimtalk.scheduleTemplate;
const res = await fetch(`https://api.solapi.com/kakao/v2/templates/${id}`, {
  headers: { Authorization: authHeader() },
});
const data = await res.json();
console.log(JSON.stringify({ status: data.status, content: data.content }, null, 2));
