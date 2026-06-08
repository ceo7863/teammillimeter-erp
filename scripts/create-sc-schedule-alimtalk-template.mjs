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

const scShareBase = String(config.sc.sharePublicUrl || config.sc.apiBaseUrl || "https://sc.teammillimeter.com").replace(
  /\/$/,
  "",
);

const template = {
  name: `${TM} SC \uB0B4\uC77C \uC77C\uC815 \uC548\uB0B4`,
  emphasizeTitle: "\uB0B4\uC77C \uC2DC\uACF5 \uC77C\uC815",
  emphasizeSubtitle: CO,
  content: `${TM} SC \uB0B4\uC77C \uC2DC\uACF5 \uC77C\uC815 \uC548\uB0B4\uC785\uB2C8\uB2E4.

\uAC70\uB798\uCC98: #{client}
\uD604\uC7A5: #{site}
\uC77C\uC815: #{dateTime}
\uC2DC\uACF5: #{workers}

\uC544\uB798 \uBC84\uD2BC\uC744 \uB20C\uB7EC \uC77C\uC815 \uC0C1\uC138 \uC815\uBCF4\uB97C \uD655\uC778\uD574 \uC8FC\uC138\uC694.`,
  buttonName: "\uC77C\uC815 \uC0C1\uC138 \uBCF4\uAE30",
  inspectionComment: `\uB0B4\uC77C SC \uC2DC\uACF5 \uC77C\uC815 \uC548\uB0B4 \uC54C\uB9BC\uC785\uB2C8\uB2E4. \uC218\uC2E0\uC790\uB294 ${CO} \uCC38\uC5EC \uC2DC\uACF5\uC790\uC774\uBA70, \uB2E4\uC74C \uB0A0 \uC608\uC815 \uD604\uC7A5 \uC815\uBCF4 \uD655\uC778\uC744 \uC694\uCCAD\uD569\uB2C8\uB2E4.`,
};

function buildButtons() {
  const shareLink = `${scShareBase}/share/schedules/#{shareToken}`;
  return [
    {
      buttonType: "WL",
      buttonName: template.buttonName,
      linkMo: shareLink,
      linkPc: shareLink,
    },
  ];
}

async function main() {
  const existingId = process.env.ALIMTALK_SCHEDULE_TEMPLATE || config.alimtalk.scheduleTemplate;
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
    console.log("Set ALIMTALK_SCHEDULE_TEMPLATE=" + (updated.templateId || existingId));
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
  console.log("Set ALIMTALK_SCHEDULE_TEMPLATE=" + created.templateId);
  const inspected = await api("PUT", `/kakao/v2/templates/${created.templateId}/inspection`, {
    comment: template.inspectionComment,
  });
  console.log("inspection:", inspected.status || inspected.codes?.[0]?.status || "requested");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
