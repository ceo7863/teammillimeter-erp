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
  name: `${TM} ERP \uC218\uC2B5 \uC2DC\uACF5\uC790 \uD3C9\uAC00`,
  emphasizeTitle: "\uC218\uC2B5 \uC77C\uC77C \uD3C9\uAC00",
  emphasizeSubtitle: CO,
  content: `${TM} \uC218\uC2B5 \uC2DC\uACF5\uC790 \uC77C\uC77C \uD3C9\uAC00 \uC694\uCCAD\uC785\uB2C8\uB2E4.

\uADDC\uC5F4\uC77C: #{date}
\uD604\uC7A5: #{siteName}
\uC218\uC2B5\uC790: #{probationWorkerName}

\uC544\uB798 \uBC84\uD2BC\uC744 \uB20C\uB7EC \uD3C9\uAC00 \uC124\uBB38\uC744 \uC791\uC131\uD574 \uC8FC\uC138\uC694.`,
  buttonName: "\uD3C9\uAC00 \uC124\uBB38 \uC791\uC131",
  inspectionComment: `\uC218\uC2B5 \uAE30\uAC04 \uC2DC\uACF5\uC790 \uC77C\uC77C \uD3C9\uAC00 \uC694\uCCAD \uC548\uB0B4\uC785\uB2C8\uB2E4. \uC218\uC2E0\uC790\uB294 ${CO} \uC77C\uC815 \uCC38\uC5EC \uC2DC\uACF5\uC790\uC785\uB2C8\uB2E4.`,
};

const surveyLinkBase = "#{surveyUrl}";

function buildButtons() {
  return [
    {
      buttonType: "WL",
      buttonName: template.buttonName,
      linkMo: surveyLinkBase,
      linkPc: surveyLinkBase,
    },
  ];
}

async function main() {
  const existingId = process.env.ALIMTALK_PROBATION_EVAL_TEMPLATE || config.alimtalk.probationEvalTemplate;
  if (existingId) {
    console.log(`Updating existing template ${existingId}`);
    const current = await api("GET", `/kakao/v2/templates/${existingId}`);
    const status = current.status || current.codes?.[0]?.status;
    if (status === "INSPECTING") {
      await api("PUT", `/kakao/v2/templates/${existingId}/inspection/cancel`);
      console.log("inspection cancelled");
    }
    const updated = await api("PUT", `/kakao/v2/templates/${existingId}`, {
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
    console.log("Set ALIMTALK_PROBATION_EVAL_TEMPLATE=" + (updated.templateId || existingId));
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
  console.log("Set ALIMTALK_PROBATION_EVAL_TEMPLATE=" + created.templateId);
  const inspected = await api("PUT", `/kakao/v2/templates/${created.templateId}/inspection`, {
    comment: template.inspectionComment,
  });
  console.log("inspection:", inspected.status || inspected.codes?.[0]?.status || "requested");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
