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

const pfId = config.alimtalk.senderKey;
const res = await fetch(`https://api.solapi.com/kakao/v1/templates?pfId=${encodeURIComponent(pfId)}`, {
  headers: { Authorization: authHeader() },
});
const data = await res.json();
const current = config.alimtalk.contractTemplate;
console.log("current ALIMTALK_CONTRACT_TEMPLATE:", current);

for (const template of data.templateList || []) {
  const status = template.codes?.[0]?.status || "?";
  const name = template.name || "";
  const content = template.content || "";
  const isContract = /\uACC4\uC57D|\uC11C\uBA85|\uC804\uC790/i.test(name) || /\uACC4\uC57D|\uC11C\uBA85|\uC804\uC790/i.test(content);
  if (!isContract) continue;
  console.log(
    JSON.stringify({
      templateId: template.templateId,
      status,
      current: template.templateId === current,
      name,
      variables: (template.variables || []).map((row) => row.name),
      buttons: (template.buttons || []).map((row) => ({ name: row.buttonName, link: row.linkMo })),
    }),
  );
}
