import crypto from "crypto";
import fs from "fs";
import path from "path";
import { config } from "./config.mjs";

export function solapiAuthHeader() {
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

export async function solapiRequest(method, apiPath, body, options = {}) {
  const headers = {
    Authorization: solapiAuthHeader(),
    ...(options.headers || {}),
  };
  if (body != null && !(body instanceof FormData)) {
    headers["Content-Type"] = "application/json; charset=utf-8";
  }
  const response = await fetch(`https://api.solapi.com${apiPath}`, {
    method,
    headers,
    body: body instanceof FormData ? body : body != null ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!response.ok) {
    throw new Error(`${method} ${apiPath} ${response.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

export async function fetchAlimtalkCategoryCode() {
  try {
    const categories = await solapiRequest("GET", "/kakao/v2/templates/categories");
    const list = categories?.categoryList || categories?.categories || [];
    const hit =
      list.find((row) => String(row.name || "").includes("\uC11C\uBE44\uC2A4")) ||
      list.find((row) => String(row.code || "") === "999999") ||
      list[0];
    return hit?.code || "999999";
  } catch {
    return "999999";
  }
}

export async function uploadAlimtalkTemplateImage(filePath, fileName = "team-millimeter-logo.jpg") {
  const buffer = fs.readFileSync(filePath);
  const blob = new Blob([buffer], { type: "image/jpeg" });
  const form = new FormData();
  form.append("file", blob, fileName);
  form.append("type", "KAKAO");
  const result = await solapiRequest("POST", "/storage/v1/files", form);
  const imageId = result?.fileId || result?.imageId || result?.image?.fileId || result?.image?.imageId;
  if (!imageId) {
    throw new Error(`image upload returned no fileId: ${JSON.stringify(result)}`);
  }
  return String(imageId);
}

export async function createAlimtalkTemplate(payload) {
  return solapiRequest("POST", "/kakao/v2/templates", payload);
}

export async function requestAlimtalkTemplateInspection(templateId, comment) {
  return solapiRequest("PUT", `/kakao/v2/templates/${templateId}/inspection`, { comment });
}

export function resolveAlimtalkLogoBannerPath(rootDir = process.cwd()) {
  return path.join(rootDir, "server", "templates", "team-mm-alimtalk-banner.jpg");
}

export function resolveAlimtalkLogoSourcePath(rootDir = process.cwd()) {
  return path.join(rootDir, "server", "templates", "team-mm-logo.png");
}
