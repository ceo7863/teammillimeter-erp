import crypto from "crypto";
import { loadEnv } from "../server/loadEnv.mjs";
import { config } from "../server/config.mjs";

loadEnv();

const TM = "\uD300\uBC00\uB9AC\uBBF8\uD130";
const CO = "(\uC8FC)\uD300\uBC00\uB9AC\uBBF8\uD130";

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

const template = {
  name: `${TM} ERP \uAC70\uB798\uCC98\uACC4\uC57D\uC11C\uBA85`,
  emphasizeTitle: "\uACC4\uC57D \uC804\uC790\uC11C\uBA85",
  emphasizeSubtitle: CO,
  content: `${TM} \uAC70\uB798\uCC98 \uACC4\uC57D \uC804\uC790\uC11C\uBA85 \uC548\uB0B4\uC785\uB2C8\uB2E4.

\uAC70\uB798\uCC98: #{client}
\uACC4\uC57D: #{title}

\uC544\uB798 \uBC84\uD2BC\uC744 \uB20C\uB7EC \uACC4\uC57D\uC11C\uB97C \uD655\uC778\uD558\uC2DC\uACE0 \uC804\uC790\uC11C\uBA85\uC744 \uC9C4\uD589\uD574 \uC8FC\uC138\uC694.

\uC11C\uBA85 \uB9C1\uD06C\uB294 24\uC2DC\uAC04 \uC720\uD6A8\uD569\uB2C8\uB2E4.`,
  buttonName: "\uACC4\uC57D\uC11C \uC11C\uBA85\uD558\uAE30",
  inspectionComment: `\uAC70\uB798\uCC98 \uACC4\uC57D \uC804\uC790\uC11C\uBA85 \uC548\uB0B4 \uC54C\uB9BC\uC785\uB2C8\uB2E4. \uC218\uC2E0\uC790\uB294 ${CO} \uAC70\uB798\uCC98 \uB2F4\uB2F9\uC790\uC774\uBA70, \uACC4\uC57D\uC11C \uD655\uC778 \uBC0F \uC804\uC790\uC11C\uBA85\uC744 \uC694\uCCAD\uD569\uB2C8\uB2E4.`,
};

const signLinkBase = `${config.alimtalk.erpBaseUrl.replace(/\/$/, "")}/sign/#{token}`;

function buildButtons() {
  return [
    {
      buttonType: "WL",
      buttonName: template.buttonName,
      linkMo: signLinkBase,
      linkPc: signLinkBase,
    },
  ];
}

async function main() {
  const existingId = process.env.ALIMTALK_CONTRACT_TEMPLATE || config.alimtalk.contractTemplate;
  if (existingId) {
    console.log(`Updating existing template ${existingId}`);
    const current = await api("GET", `/kakao/v2/templates/${existingId}`);
    const status = current.status || current.codes?.[0]?.status;
    if (status === "INSPECTING") {
      await api("PUT", `/kakao/v2/templates/${existingId}/inspection/cancel`);
      console.log("inspection cancelled");
    }
    const updated = await api("PUT", `/kakao/v2/templates/${existingId}`, {
      channelId: config.alimtalk.senderKey,
      name: template.name,
      content: template.content,
      categoryCode: current.categoryCode || "999999",
      messageType: "BA",
      emphasizeType: "TEXT",
      emphasizeTitle: template.emphasizeTitle,
      emphasizeSubtitle: template.emphasizeSubtitle,
      buttons: buildButtons(),
    });
    console.log("updated:", updated.templateId || existingId);
    console.log("Set ALIMTALK_CONTRACT_TEMPLATE=" + (updated.templateId || existingId));
    const inspected = await api("PUT", `/kakao/v2/templates/${existingId}/inspection`, {
      comment: template.inspectionComment,
    });
    console.log("inspection:", inspected.status || inspected.codes?.[0]?.status || "requested");
    return;
  }

  const created = await api("POST", "/kakao/v2/templates", {
    channelId: config.alimtalk.senderKey,
    name: template.name,
    content: template.content,
    categoryCode: "999999",
    messageType: "BA",
    emphasizeType: "TEXT",
    emphasizeTitle: template.emphasizeTitle,
    emphasizeSubtitle: template.emphasizeSubtitle,
    buttons: buildButtons(),
  });
  console.log("created:", created.templateId);
  console.log("Set ALIMTALK_CONTRACT_TEMPLATE=" + created.templateId);
  const inspected = await api("PUT", `/kakao/v2/templates/${created.templateId}/inspection`, {
    comment: template.inspectionComment,
  });
  console.log("inspection:", inspected.status || inspected.codes?.[0]?.status || "requested");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
