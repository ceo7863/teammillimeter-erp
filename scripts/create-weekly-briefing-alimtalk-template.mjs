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
  name: `${TM} \uC774\uBC88 \uC8FC \uC2DC\uACF5 \uD604\uC7A5 \uBE0C\uB9AC\uD551`,
  emphasizeTitle: "\uC774\uBC88 \uC8FC \uC2DC\uACF5 \uD604\uC7A5",
  emphasizeSubtitle: CO,
  content: `${TM} \uC774\uBC88 \uC8FC \uC2DC\uACF5 \uD604\uC7A5 \uBE0C\uB9AC\uD551\uC785\uB2C8\uB2E4.

\uAC70\uB798\uCC98: #{client}
\uB2F4\uB2F9\uC790: #{clientManager}

#{siteDetail}

\uD655\uC778 \uBD80\uD0C1\uB4DC\uB9BD\uB2C8\uB2E4.`,
  inspectionComment: `\uC774\uBC88 \uC8FC \uC2DC\uACF5 \uD604\uC7A5 \uBE0C\uB9AC\uD551 \uC54C\uB9BC\uC785\uB2C8\uB2E4. \uAC70\uB798\uCC98 \uB2F4\uB2F9\uC790\uC5D0\uAC8C \uD604\uC7A5 \uC77C\uC815 \uBC0F \uC778\uC6D0 \uC815\uBCF4 \uD655\uC778\uC744 \uC694\uCCAD\uD569\uB2C8\uB2E4.`,
};

async function main() {
  const existingId = process.env.ALIMTALK_WEEKLY_BRIEFING_TEMPLATE || config.alimtalk.weeklyBriefingTemplate;
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
      buttons: [],
    });
    console.log("updated:", updated.templateId || existingId);
    console.log("Set ALIMTALK_WEEKLY_BRIEFING_TEMPLATE=" + (updated.templateId || existingId));
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
    buttons: [],
  });
  console.log("created:", created.templateId);
  console.log("Set ALIMTALK_WEEKLY_BRIEFING_TEMPLATE=" + created.templateId);
  const inspected = await api("PUT", `/kakao/v2/templates/${created.templateId}/inspection`, {
    comment: template.inspectionComment,
  });
  console.log("inspection:", inspected.status || inspected.codes?.[0]?.status || "requested");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
