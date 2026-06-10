import crypto from "crypto";
import { loadEnv } from "../server/loadEnv.mjs";
import { config } from "../server/config.mjs";
import { sendContractAlimtalk } from "../server/alimtalkNotify.mjs";

loadEnv();

const phone = process.argv[2] || "01057977863";
const client = "\uD300\uBC00\uB9AC\uBBF8\uD130";
const title = "\uAC00\uAD6C\uC2DC\uACF5 \uB2E8\uAC00\uD611\uC57D\uC11C";
const token = "debug" + crypto.randomBytes(6).toString("hex");
const url = `${config.alimtalk.erpBaseUrl.replace(/\/$/, "")}/sign/${token}`;

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

const result = await sendContractAlimtalk({
  phones: [phone],
  variables: { client, title, token, url },
});

console.log("client hex:", Buffer.from(client, "utf8").toString("hex"));
console.log("send ok:", result.ok, "group:", result.body?.groupInfo?.groupId);

await new Promise((r) => setTimeout(r, 2500));

const groupId = result.body?.groupInfo?.groupId;
if (!groupId) process.exit(1);

const listRes = await fetch(
  `https://api.solapi.com/messages/v4/list?groupId=${encodeURIComponent(groupId)}&limit=1`,
  { headers: { Authorization: authHeader() } },
);
const list = await listRes.json();
const msg = list.messageList?.[0];
console.log("status:", msg?.statusCode, msg?.reason);
console.log("kakao vars:", JSON.stringify(msg?.kakaoOptions?.variables, null, 2));

const tplRes = await fetch(`https://api.solapi.com/kakao/v2/templates/${config.alimtalk.contractTemplate}`, {
  headers: { Authorization: authHeader() },
});
const tpl = await tplRes.json();
console.log("template vars field:", JSON.stringify(tpl.variables || tpl.templateVariables || tpl.codes?.[0]?.variables || null));
