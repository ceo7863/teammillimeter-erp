import { config } from "./config.mjs";

function normalizePhone(phone) {
  return String(phone || "").replace(/\D/g, "");
}

function isConfigured() {
  return Boolean(config.alimtalk.enabled && config.alimtalk.apiUrl && config.alimtalk.senderKey);
}

async function postAlimtalk(payload) {
  if (!isConfigured()) {
    return { ok: false, skipped: true, reason: "alimtalk-not-configured" };
  }
  const headers = {
    "Content-Type": "application/json;charset=UTF-8",
    ...(config.alimtalk.apiHeaders || {}),
  };
  if (config.alimtalk.apiKey) {
    headers.Authorization = config.alimtalk.apiKey.startsWith("Bearer ")
      ? config.alimtalk.apiKey
      : `Bearer ${config.alimtalk.apiKey}`;
  }
  const response = await fetch(config.alimtalk.apiUrl, {
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

export function getAlimtalkStatus() {
  return {
    enabled: isConfigured(),
    provider: config.alimtalk.provider,
    dailyTemplate: config.alimtalk.dailyReportTemplate || null,
    commentTemplate: config.alimtalk.commentTemplate || null,
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

  const payload =
    config.alimtalk.provider === "toast"
      ? buildToastPayload({ phones: uniquePhones, templateCode, variables })
      : {
          senderKey: config.alimtalk.senderKey,
          templateCode,
          phones: uniquePhones,
          variables,
        };

  const result = await postAlimtalk(payload);
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
