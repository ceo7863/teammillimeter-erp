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

const id = config.alimtalk.contractTemplate;
const res = await fetch(`https://api.solapi.com/kakao/v2/templates/${id}`, {
  headers: { Authorization: authHeader() },
});
const tpl = await res.json();
console.log("name:", tpl.name);
console.log("emphasizeTitle:", tpl.emphasizeTitle);
console.log("emphasizeSubtitle:", tpl.emphasizeSubtitle);
console.log("content:", tpl.content);
console.log("name bytes:", Buffer.from(tpl.name || "", "utf8").toString("hex").slice(0, 80));
