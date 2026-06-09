import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { loadEnv } from "../server/loadEnv.mjs";
import { config } from "../server/config.mjs";
import {
  createAlimtalkTemplate,
  fetchAlimtalkCategoryCode,
  requestAlimtalkTemplateInspection,
  resolveAlimtalkLogoBannerPath,
  resolveAlimtalkLogoSourcePath,
  uploadAlimtalkTemplateImage,
} from "../server/alimtalkSolapi.mjs";

loadEnv();

const TM = "\uD300\uBC00\uB9AC\uBBF8\uD130";
const CO = "(\uC8FC)\uD300\uBC00\uB9AC\uBBF8\uD130";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");

const scShareBase = String(config.sc.sharePublicUrl || config.sc.apiBaseUrl || "https://sc.teammillimeter.com").replace(
  /\/$/,
  "",
);
const erpUrl = config.alimtalk.erpBaseUrl.replace(/\/$/, "");
const signLinkBase = `${erpUrl}/sign/#{token}`;

function ensureBannerImage() {
  const sourcePath = resolveAlimtalkLogoSourcePath(rootDir);
  const bannerPath = resolveAlimtalkLogoBannerPath(rootDir);
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`logo source not found: ${sourcePath}`);
  }
  execFileSync(
    "magick",
    [
      sourcePath,
      "-resize",
      "520x520>",
      "-background",
      "white",
      "-gravity",
      "center",
      "-extent",
      "800x400",
      bannerPath,
    ],
    { stdio: "inherit" },
  );
  const stat = fs.statSync(bannerPath);
  if (stat.size > 500 * 1024) {
    throw new Error(`banner image exceeds 500KB: ${bannerPath}`);
  }
  return bannerPath;
}

const templates = [
  {
    key: "contract",
    envKey: "ALIMTALK_CONTRACT_TEMPLATE",
    name: `${TM} \uACC4\uC57D \uC804\uC790\uC11C\uBA85 (\uB85C\uACE0)`,
    content: `${TM} \uAC70\uB798\uCC98 \uACC4\uC57D \uC804\uC790\uC11C\uBA85 \uC548\uB0B4\uC785\uB2C8\uB2E4.

\uAC70\uB798\uCC98: #{client}
\uACC4\uC57D: #{title}

\uC544\uB798 \uBC84\uD2BC\uC744 \uB20C\uB7EC \uACC4\uC57D\uC11C\uB97C \uD655\uC778\uD558\uC2DC\uACE0 \uC804\uC790\uC11C\uBA85\uC744 \uC9C4\uD589\uD574 \uC8FC\uC138\uC694.

\uC11C\uBA85 \uB9C1\uD06C\uB294 24\uC2DC\uAC04 \uC720\uD6A8\uD569\uB2C8\uB2E4.`,
    buttons: [
      {
        buttonType: "WL",
        buttonName: "\uACC4\uC57D\uC11C \uC11C\uBA85\uD558\uAE30",
        linkMo: signLinkBase,
        linkPc: signLinkBase,
      },
    ],
    inspectionComment: `\uAC70\uB798\uCC98 \uACC4\uC57D \uC804\uC790\uC11C\uBA85 \uC548\uB0B4 \uC54C\uB9BC\uC785\uB2C8\uB2E4. \uC218\uC2E0\uC790\uB294 ${CO} \uAC70\uB798\uCC98 \uB2F4\uB2F9\uC790\uC774\uBA70, \uACC4\uC57D\uC11C \uD655\uC778 \uBC0F \uC804\uC790\uC11C\uBA85\uC744 \uC694\uCCAD\uD569\uB2C8\uB2E4. \uC0C1\uB2E8 \uC774\uBBF8\uC9C0\uB294 ${CO} \uB85C\uACE0\uC785\uB2C8\uB2E4.`,
  },
  {
    key: "schedule",
    envKey: "ALIMTALK_SCHEDULE_TEMPLATE",
    name: `${TM} \uB0B4\uC77C \uC77C\uC815 \uC548\uB0B4 (\uB85C\uACE0)`,
    content: `${TM} \uB0B4\uC77C \uC2DC\uACF5 \uC77C\uC815 \uC548\uB0B4\uC785\uB2C8\uB2E4.

\uAC70\uB798\uCC98: #{client}
\uD604\uC7A5: #{site}
\uB2F4\uB2F9\uC790: #{clientManager}
\uC77C\uC815: #{dateTime}
\uC2DC\uACF5: #{workers}

\uC544\uB798 \uBC84\uD2BC\uC744 \uB20C\uB7EC \uC77C\uC815 \uC0C1\uC138 \uC815\uBCF4\uB97C \uD655\uC778\uD574 \uC8FC\uC138\uC694.`,
    buttons: [
      {
        buttonType: "WL",
        buttonName: "\uC77C\uC815 \uC0C1\uC138 \uBCF4\uAE30",
        linkMo: `${scShareBase}/share/schedules/#{shareToken}`,
        linkPc: `${scShareBase}/share/schedules/#{shareToken}`,
      },
    ],
    inspectionComment: `\uB0B4\uC77C \uC2DC\uACF5 \uC77C\uC815 \uC548\uB0B4 \uC54C\uB9BC\uC785\uB2C8\uB2E4. \uC218\uC2E0\uC790\uB294 ${CO} \uAC70\uB798\uCC98 \uB2F4\uB2F9\uC790 \uB610\uB294 \uCC38\uC5EC \uC2DC\uACF5\uC790\uC774\uBA70, \uB2E4\uC74C \uB0A0 \uC608\uC815 \uD604\uC7A5 \uC815\uBCF4 \uD655\uC778\uC744 \uC694\uCCAD\uD569\uB2C8\uB2E4. \uC0C1\uB2E8 \uC774\uBBF8\uC9C0\uB294 ${CO} \uB85C\uACE0\uC785\uB2C8\uB2E4.`,
  },
];

async function main() {
  if (!config.alimtalk.apiKey || !config.alimtalk.apiSecret || !config.alimtalk.senderKey) {
    throw new Error("ALIMTALK_API_KEY / ALIMTALK_API_SECRET / ALIMTALK_SENDER_KEY required");
  }

  console.log("==> build 800x400 banner from logo");
  const bannerPath = ensureBannerImage();
  console.log("banner:", bannerPath);

  console.log("==> upload banner to Solapi (KAKAO)");
  const imageId = await uploadAlimtalkTemplateImage(bannerPath, "team-millimeter-alimtalk-banner.jpg");
  console.log("imageId:", imageId);

  const categoryCode = await fetchAlimtalkCategoryCode();
  console.log("categoryCode:", categoryCode);

  const created = {};
  for (const tpl of templates) {
    console.log(`\n==> create template: ${tpl.key}`);
    const result = await createAlimtalkTemplate({
      channelId: config.alimtalk.senderKey,
      name: tpl.name,
      content: tpl.content,
      categoryCode,
      messageType: "BA",
      emphasizeType: "IMAGE",
      imageId,
      buttons: tpl.buttons,
    });
    const templateId = result.templateId;
    created[tpl.key] = templateId;
    console.log("templateId:", templateId, "status:", result.status);

    const inspected = await requestAlimtalkTemplateInspection(templateId, tpl.inspectionComment);
    console.log(
      "inspection:",
      inspected.status || inspected.codes?.[0]?.status || "requested",
    );
  }

  console.log("\n=== RESULT ===");
  console.log(JSON.stringify(created, null, 2));
  console.log("\nAdd to server .env after Kakao approval (INSPECTING -> APPROVED):");
  for (const tpl of templates) {
    console.log(`${tpl.envKey}=${created[tpl.key] || ""}`);
  }
  console.log("\nThen restart: pm2 restart erp");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
