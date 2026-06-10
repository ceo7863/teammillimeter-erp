import crypto from "crypto";
import { loadEnv } from "../server/loadEnv.mjs";
import { config } from "../server/config.mjs";

loadEnv();

const TM = "\uD300\uBC00\uB9AC\uBBF8\uD130";
const CO = "(\uC8FC)\uD300\uBC00\uB9AC\uBBF8\uD130";

const TEMPLATE_IDS = {
  daily: process.env.ALIMTALK_DAILY_REPORT_TEMPLATE || "KA01TP260606074004148ktEbajtSr2C",
  comment: process.env.ALIMTALK_COMMENT_TEMPLATE || "KA01TP260606074005105XGoglTzkUur",
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

async function api(method, path, body) {
  const res = await fetch(`https://api.solapi.com${path}`, {
    method,
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json; charset=utf-8",
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

const erpUrl = config.alimtalk.erpBaseUrl;

const templates = {
  daily: {
    name: `${TM} ERP \uC77C\uC77C\uACBD\uC601\uBCF4\uACE0`,
    emphasizeTitle: "\uC77C\uC77C \uACBD\uC601\uBCF4\uACE0",
    emphasizeSubtitle: CO,
    content: `\uC548\uB155\uD558\uC138\uC694. ${TM} ERP \uC77C\uC77C \uACBD\uC601 \uBCF4\uACE0\uC785\uB2C8\uB2E4.

\u25A0 \uAE30\uC900\uC77C: #{reportDate}

\u25A0 \uC138\uAE08\uACC4\uC0B0\uC11C(\uC804\uC77C)
\u00B7 \uB9E4\uCD9C #{salesTaxCount}\uAC74 #{salesTaxAmount}
\u00B7 \uB9E4\uC785 #{purchaseTaxCount}\uAC74 #{purchaseTaxAmount}

\u25A0 \uD1B5\uC7A5(\uC804\uC77C)
\u00B7 \uC785\uAE08 #{bankDeposit}
\u00B7 \uCD9C\uAE08 #{bankWithdrawal}
\u00B7 \uC794\uC561 #{bankBalance}

\u25A0 \uB9E4\uCD9C\uC804\uD45C(\uC804\uC77C)
\u00B7 #{voucherCount}\uAC74
\u00B7 \uCCAD\uAD6C #{voucherBill}
\u00B7 \uB9C8\uC9C4 #{voucherMargin}`,
    buttonName: "ERP \uC5F4\uAE30",
    inspectionComment: `\uC0AC\uB0B4 ERP \uACBD\uC601 \uC77C\uC77C\uBCF4\uACE0 \uC54C\uB9BC\uC785\uB2C8\uB2E4. \uC218\uC2E0\uC790\uB294 ${CO} \uC784\uC9C1\uC6D0\uC774\uBA70, \uC804\uC77C \uB9E4\uCD9C\u00B7\uB9E4\uC785\u00B7\uD1B5\uC7A5\u00B7\uC804\uD45C \uC694\uC57D\uC744 \uC548\uB0B4\uD569\uB2C8\uB2E4.`,
  },
  comment: {
    name: `${TM} ERP \uC804\uD45C\uB313\uAE00\uC54C\uB9BC`,
    emphasizeTitle: "\uC804\uD45C \uC0C8 \uB313\uAE00",
    emphasizeSubtitle: CO,
    content: `${TM} ERP\uC5D0 \uC804\uD45C \uB313\uAE00\uC774 \uB4F1\uB85D\uB418\uC5C88\uC2B5\uB2C8\uB2E4.

\uAC70\uB798\uCC98: #{client}
\uD604\uC7A5: #{site}
\uC791\uC131\uC790: #{author}

#{body}`,
    buttonName: "ERP\uC5D0\uC11C \uD655\uC778",
    inspectionComment: `\uC0AC\uB0B4 ERP \uC804\uD45C \uCF54\uBA58\uD2B8 \uB4F1\uB85D \uC54C\uB9BC\uC785\uB2C8\uB2E4. \uC218\uC2E0\uC790\uB294 ${CO} \uC784\uC9C1\uC6D0\uC774\uBA70, \uB9E4\uCD9C \uC804\uD45C\uC5D0 \uD300\uC6D0\uC774 \uB0A8\uAE34 \uB313\uAE00\uC744 \uC548\uB0B4\uD569\uB2C8\uB2E4.`,
  },
};

async function fixTemplate(key, templateId, tpl) {
  const current = await api("GET", `/kakao/v2/templates/${templateId}`);
  const status = current.status || current.codes?.[0]?.status;
  console.log(`\n[${key}] ${templateId} status=${status}`);
  console.log("before name:", current.name);

  if (status === "INSPECTING") {
    await api("PUT", `/kakao/v2/templates/${templateId}/inspection/cancel`);
    console.log("inspection cancelled");
  }

  const updated = await api("PUT", `/kakao/v2/templates/${templateId}`, {
    name: tpl.name,
    content: tpl.content,
    categoryCode: current.categoryCode || "999999",
    messageType: "BA",
    emphasizeType: "TEXT",
    emphasizeTitle: tpl.emphasizeTitle,
    emphasizeSubtitle: tpl.emphasizeSubtitle,
    buttons: [
      {
        buttonType: "WL",
        buttonName: tpl.buttonName,
        linkMo: erpUrl,
        linkPc: erpUrl,
      },
    ],
  });
  console.log("after name:", updated.name);
  console.log("after content preview:", String(updated.content || "").slice(0, 80));

  await api("PUT", `/kakao/v2/templates/${templateId}/inspection`, {
    comment: tpl.inspectionComment,
  });
  console.log("re-inspection requested");
}

for (const [key, templateId] of Object.entries(TEMPLATE_IDS)) {
  await fixTemplate(key, templateId, templates[key]);
}

console.log("\nDone. Check Solapi console for Korean text.");
