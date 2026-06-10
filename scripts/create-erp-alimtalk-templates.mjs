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

async function api(method, path, body) {
  const res = await fetch(`https://api.solapi.com${path}`, {
    method,
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    throw new Error(`${method} ${path} ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

const channelId = config.alimtalk.senderKey;
const erpUrl = config.alimtalk.erpBaseUrl;

const templates = [
  {
    key: "daily",
    name: "????? ERP ??????",
    messageType: "BA",
    emphasizeType: "TEXT",
    emphasizeTitle: "?? ????",
    emphasizeSubtitle: "(?)?????",
    content: `?????. ????? ERP ?? ?? ?????.

? ???: #{reportDate}

? ?????(??)
� ?? #{salesTaxCount}? #{salesTaxAmount}
� ?? #{purchaseTaxCount}? #{purchaseTaxAmount}

? ??(??)
� ?? #{bankDeposit}
� ?? #{bankWithdrawal}
� ?? #{bankBalance}

? ????(??)
� #{voucherCount}?
� ?? #{voucherBill}
� ?? #{voucherMargin}`,
    buttons: [
      {
        buttonType: "WL",
        buttonName: "ERP ??",
        linkMo: erpUrl,
        linkPc: erpUrl,
      },
    ],
    inspectionComment:
      "?? ERP ?? ???? ?????. ???? (?)????? ?????, ?? ??�??�??�?? ??? ?????.",
  },
  {
    key: "comment",
    name: "????? ERP ??????",
    messageType: "BA",
    emphasizeType: "TEXT",
    emphasizeTitle: "?? ? ??",
    emphasizeSubtitle: "(?)?????",
    content: `????? ERP? ?? ??? ???????.

???: #{client}
??: #{site}
???: #{author}

#{body}`,
    buttons: [
      {
        buttonType: "WL",
        buttonName: "ERP?? ??",
        linkMo: erpUrl,
        linkPc: erpUrl,
      },
    ],
    inspectionComment:
      "?? ERP ?? ??? ?? ?????. ???? (?)????? ?????, ?? ??? ??? ?? ??? ?????.",
  },
];

let categoryCode = "999999";
try {
  const categories = await api("GET", "/kakao/v2/templates/categories");
  const list = categories?.categoryList || categories?.categories || [];
  const hit =
    list.find((c) => String(c.name || "").includes("??")) ||
    list.find((c) => String(c.code || "") === "999999") ||
    list[0];
  if (hit?.code) categoryCode = hit.code;
  console.log("categoryCode:", categoryCode, hit?.name || "");
} catch (error) {
  console.warn("category fetch failed, using 999999:", error.message);
}

const created = {};

for (const tpl of templates) {
  const payload = {
    channelId,
    name: tpl.name,
    content: tpl.content,
    categoryCode,
    messageType: tpl.messageType,
    emphasizeType: tpl.emphasizeType,
    emphasizeTitle: tpl.emphasizeTitle,
    emphasizeSubtitle: tpl.emphasizeSubtitle,
    buttons: tpl.buttons,
  };
  const result = await api("POST", "/kakao/v2/templates", payload);
  console.log("\nCreated:", tpl.key, result.templateId, result.status);
  created[tpl.key] = result.templateId;

  const inspected = await api("PUT", `/kakao/v2/templates/${result.templateId}/inspection`, {
    comment: tpl.inspectionComment,
  });
  console.log("Inspection:", tpl.key, inspected.status || inspected.codes?.[0]?.status || "requested");
}

console.log("\n=== RESULT ===");
console.log(JSON.stringify(created, null, 2));
console.log("\nAdd to .env:");
console.log(`ALIMTALK_DAILY_REPORT_TEMPLATE=${created.daily || ""}`);
console.log(`ALIMTALK_COMMENT_TEMPLATE=${created.comment || ""}`);
