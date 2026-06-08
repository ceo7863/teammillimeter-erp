import crypto from "crypto";
import { config } from "./config.mjs";

function normalizePhone(phone) {
  return String(phone || "").replace(/\D/g, "");
}

function isSolapi() {
  return config.alimtalk.provider === "solapi";
}

function isConfigured() {
  if (!config.alimtalk.enabled) return false;
  if (isSolapi()) {
    return Boolean(config.alimtalk.apiKey && config.alimtalk.apiSecret && config.alimtalk.senderKey);
  }
  return Boolean(config.alimtalk.apiUrl && config.alimtalk.senderKey);
}

function solapiAuthHeader() {
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

function formatSolapiVariables(variables) {
  const out = {};
  for (const [key, value] of Object.entries(variables || {})) {
    const name = key.startsWith("#{") ? key : key.startsWith("#") ? `#{${key.slice(1)}}` : `#{${key}}`;
    out[name] = String(value ?? "");
  }
  return out;
}

async function postAlimtalk(payload) {
  if (!isConfigured()) {
    return { ok: false, skipped: true, reason: "alimtalk-not-configured" };
  }
  const headers = {
    "Content-Type": "application/json;charset=UTF-8",
    ...(config.alimtalk.apiHeaders || {}),
  };
  if (isSolapi()) {
    headers.Authorization = solapiAuthHeader();
  } else if (config.alimtalk.apiKey) {
    headers.Authorization = config.alimtalk.apiKey.startsWith("Bearer ")
      ? config.alimtalk.apiKey
      : `Bearer ${config.alimtalk.apiKey}`;
  }
  const apiUrl =
    config.alimtalk.apiUrl ||
    (isSolapi()
      ? "https://api.solapi.com/messages/v4/send-many/detail"
      : "https://api.solapi.com/messages/v4/send");
  const response = await fetch(apiUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    return { ok: false, status: response.status, body };
  }
  return { ok: true, status: response.status, body };
}

function buildToastPayload({ phones, templateCode, variables }) {
  return {
    senderKey: config.alimtalk.senderKey,
    templateCode,
    recipientList: phones.map((phone) => ({
      recipientNo: normalizePhone(phone),
      templateParameter: variables,
    })),
  };
}

function buildSolapiPayload({ phones, templateCode, variables }) {
  const kakaoVariables = formatSolapiVariables(variables);
  return {
    messages: phones.map((phone) => ({
      to: normalizePhone(phone),
      ...(config.alimtalk.smsFrom ? { from: config.alimtalk.smsFrom } : {}),
      kakaoOptions: {
        pfId: config.alimtalk.senderKey,
        templateId: templateCode,
        variables: kakaoVariables,
        disableSms: !config.alimtalk.smsFrom,
      },
    })),
  };
}

export function getAlimtalkStatus() {
  return {
    enabled: isConfigured(),
    provider: config.alimtalk.provider,
    dailyTemplate: config.alimtalk.dailyReportTemplate || null,
    commentTemplate: config.alimtalk.commentTemplate || null,
    contractTemplate: config.alimtalk.contractTemplate || null,
  };
}

export async function sendAlimtalkTemplate({ phones, templateCode, variables }) {
  const uniquePhones = [...new Set(phones.map(normalizePhone).filter(Boolean))];
  if (!uniquePhones.length) {
    return { ok: false, skipped: true, reason: "no-recipients" };
  }
  if (!templateCode) {
    return { ok: false, skipped: true, reason: "no-template" };
  }
  if (!isConfigured()) {
    console.log("[alimtalk] (dry-run)", templateCode, uniquePhones.join(", "), variables);
    return { ok: true, dryRun: true, phones: uniquePhones };
  }

  const payload = isSolapi()
    ? buildSolapiPayload({ phones: uniquePhones, templateCode, variables })
    : config.alimtalk.provider === "toast"
      ? buildToastPayload({ phones: uniquePhones, templateCode, variables })
      : {
          senderKey: config.alimtalk.senderKey,
          templateCode,
          phones: uniquePhones,
          variables,
        };

  const result = await postAlimtalk(payload);
  if (!result.ok) {
    console.error("[alimtalk] send failed:", templateCode, uniquePhones.join(", "), result.status, result.body);
  }
  return { ...result, phones: uniquePhones, templateCode };
}

export async function sendDailyReportAlimtalk({ phones, variables }) {
  return sendAlimtalkTemplate({
    phones,
    templateCode: config.alimtalk.dailyReportTemplate,
    variables,
  });
}

export async function sendCommentAlimtalk({ phones, variables }) {
  return sendAlimtalkTemplate({
    phones,
    templateCode: config.alimtalk.commentTemplate,
    variables,
  });
}

export async function sendContractAlimtalk({ phones, variables }) {
  return sendAlimtalkTemplate({
    phones,
    templateCode: config.alimtalk.contractTemplate,
    variables,
  });
}
