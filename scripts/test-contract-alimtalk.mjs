import crypto from "crypto";
import { loadEnv } from "../server/loadEnv.mjs";
import { config } from "../server/config.mjs";
import { sendContractAlimtalk } from "../server/alimtalkNotify.mjs";

loadEnv();

const phone = process.argv[2] || "01057977863";
const token = "test" + crypto.randomBytes(8).toString("hex");
const signUrl = `${config.alimtalk.erpBaseUrl.replace(/\/$/, "")}/sign/${token}`;

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

const templateId = config.alimtalk.contractTemplate;
console.log("template:", templateId);
console.log("phone:", phone);
console.log("signUrl:", signUrl);

const tplRes = await fetch(`https://api.solapi.com/kakao/v2/templates/${templateId}`, {
  headers: { Authorization: authHeader() },
});
const tpl = await tplRes.json();
console.log("\n--- template ---");
console.log("status:", tpl.status || tpl.codes?.[0]?.status);
console.log("name:", tpl.name);
console.log("content:\n", tpl.content);
console.log("buttons:", JSON.stringify(tpl.buttons, null, 2));

const result = await sendContractAlimtalk({
  phones: [phone],
  variables: {
    client: "\uD14C\uC2A4\uD2B8\uAC70\uB798\uCC98",
    title: "\uAC00\uAD6C\uC2DC\uACF5 \uB2E8\uAC00\uD611\uC57D\uC11C",
    token,
    url: signUrl,
  },
});

console.log("\n--- send result ---");
console.log(JSON.stringify(result, null, 2));
