import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const guidePdfPath = path.join(rootDir, "docs", "ERP-AI-Chat-Guide.pdf");
const guideGeneratorScript = path.join(rootDir, "scripts", "generate-erp-chat-guide-pdf.mjs");

const CHAT_GUIDE_QUERY_PATTERN =
  /(?:\uB3C4\uC6C0\uB9D0|\uC0AC\uC6A9(?:\uBC95|\uBC29\uBC95|\uAC00\uC774\uB4DC|\uC124\uBAA9|\uC548\uB0B4)|\uC774\uC6A9(?:\uBC95|\uBC29\uBC95)|(?:\uBB50|\uBB34\uC5C7).*\uD560\s*\uC218\s*\uC788|\uD560\s*\uC218\s*\uC788(?:\uB294|\uB294)?\s*(?:\uAC83|\uAC70|\uC77C|\uAE30\uB2A5)|\uBA85\uB839(?:\uC5B4|\uC778)?|\uCC57(?:\uBD07|bot)?\s*\uC0AC\uC6A9|AI\s*(?:\uC0AC\uC6A9|\uBA85\uB839|\uB3C4\uC6C0)|(?:\uC0AC\uC6A9|\uC774\uC6A9)\s*\uAC00\uC774\uB4DC|guide|manual)/i;

export function isChatGuideQuery(message) {
  const raw = String(message || "").trim();
  if (!raw) return false;
  const normalized = raw.replace(/\s+/g, "");
  if (CHAT_GUIDE_QUERY_PATTERN.test(normalized)) return true;
  if (/\uAC00\uC774\uB4DC.*pdf|pdf.*\uAC00\uC774\uB4DC|pdf.*\uC5EC|\uC5EC.*pdf/i.test(normalized)) return true;
  return false;
}

export function formatChatGuideAnswer() {
  return [
    "ERP AI \uCC57\uBD07 \uC0AC\uC6A9 \uAC00\uC774\uB4DC PDF\uB97C \uC5F4\uC5B4 \uB4DC\uB838\uC5B4\uC694.",
    "\uC0C8 \uCC3D\uC5D0\uC11C \uD655\uC778\uD558\uAC70\uB098 \uC800\uC7A5\uD558\uC2DC\uBA74 \uB429\uB2C8\uB2E4.",
    "",
    '\uC608\uC2DC \uBB38\uAD6C\uB294 PDF \uCC38\uACE0 \uB610\uB294 "\uC778\uB514\uD37C \uBBF8\uC218", "\uC624\uB298 \uC778\uB514\uD37C \uD604\uC7A5", "5\uC6D4 \uD1B5\uC7A5 \uC5F4\uC5B4" \uCC98\uB7FC \uC790\uC5F0\uC2A4\uB7FD\uAC8C \uB9D0\uC4F0\uC2DC\uBA74 \uB429\uB2C8\uB2E4.',
  ].join("\n");
}

export function buildChatActionsFromChatGuide() {
  return [{ type: "open_chat_guide_pdf" }];
}

export function ensureChatGuidePdfPath() {
  if (fs.existsSync(guidePdfPath)) return guidePdfPath;

  if (!fs.existsSync(guideGeneratorScript)) return null;

  const result = spawnSync(process.execPath, [guideGeneratorScript], {
    cwd: rootDir,
    stdio: "pipe",
    encoding: "utf8",
  });

  if (result.status !== 0) {
    console.error("[erp-chat-guide] PDF generation failed:", result.stderr || result.stdout);
    return null;
  }

  return fs.existsSync(guidePdfPath) ? guidePdfPath : null;
}

export function getChatGuidePdfPath() {
  return ensureChatGuidePdfPath();
}
