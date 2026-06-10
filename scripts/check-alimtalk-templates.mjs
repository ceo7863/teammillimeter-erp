import crypto from "crypto";
import { loadEnv } from "../server/loadEnv.mjs";
import { config } from "../server/config.mjs";
import { getAlimtalkStatus } from "../server/alimtalkNotify.mjs";

loadEnv();

const ids = {
  daily: config.alimtalk.dailyReportTemplate,
  comment: config.alimtalk.commentTemplate,
  contract: config.alimtalk.contractTemplate,
  schedule: config.alimtalk.scheduleTemplate,
  weeklyBriefing: config.alimtalk.weeklyBriefingTemplate,
};

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

const headers = { Authorization: authHeader() };
for (const [label, id] of Object.entries(ids)) {
  if (!id) {
    console.log(`${label}: (not set)`);
    continue;
  }
  const response = await fetch(`https://api.solapi.com/kakao/v2/templates/${id}`, { headers });
  const data = await response.json();
  const status = data.status || data.codes?.[0]?.status || "unknown";
  console.log(`${label}: ${status} | ${data.name || id}`);
}
console.log("status:", JSON.stringify(getAlimtalkStatus()));
