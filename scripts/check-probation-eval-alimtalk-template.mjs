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

async function main() {
  const templateId =
    process.env.ALIMTALK_PROBATION_EVAL_TEMPLATE || config.alimtalk.probationEvalTemplate;
  if (!templateId) {
    console.log(JSON.stringify({ configured: false }, null, 2));
    return;
  }
  const res = await fetch(`https://api.solapi.com/kakao/v2/templates/${templateId}`, {
    headers: { Authorization: authHeader() },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`${res.status}: ${JSON.stringify(data)}`);
  }
  console.log(
    JSON.stringify(
      {
        configured: true,
        templateId,
        status: data.status,
        name: data.name,
        emphasizeTitle: data.emphasizeTitle,
        codes: (data.codes || []).map((row) => ({
          status: row.status,
          createdAt: row.createdAt,
        })),
        buttons: (data.buttons || []).map((row) => ({
          name: row.buttonName,
          type: row.buttonType,
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
