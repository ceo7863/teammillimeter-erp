import { config } from "../config.mjs";
import { escapeXml, assertBarobillCredentials } from "./client.mjs";

const SOAP_NS = "http://ws.baroservice.com/";
const SOAP_ENVELOPE_NS = "http://schemas.xmlsoap.org/soap/envelope/";

function serviceUrl() {
  return config.barobill.test
    ? "https://testws.baroservice.com/BANKACCOUNT.asmx"
    : "https://ws.baroservice.com/BANKACCOUNT.asmx";
}

function buildSoapEnvelope(operation, fields) {
  const bodyFields = Object.entries(fields)
    .map(([name, value]) => `<${name}>${escapeXml(value)}</${name}>`)
    .join("");

  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="${SOAP_ENVELOPE_NS}">
  <soap:Body>
    <${operation} xmlns="${SOAP_NS}">
      ${bodyFields}
    </${operation}>
  </soap:Body>
</soap:Envelope>`;
}

export function decodeXml(text) {
  return String(text ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

export function readXmlTag(block, tag) {
  const patterns = [
    new RegExp(`<${tag}>([^<]*)</${tag}>`, "i"),
    new RegExp(`<[^:]+:${tag}>([^<]*)</[^:]+:${tag}>`, "i"),
  ];
  for (const pattern of patterns) {
    const match = String(block || "").match(pattern);
    if (match) return decodeXml(match[1]).trim();
  }
  return "";
}

export function readXmlInt(block, tag) {
  const raw = readXmlTag(block, tag);
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}

export function extractResultBlock(xml, resultTag) {
  const patterns = [
    new RegExp(`<${resultTag}[^>]*>([\\s\\S]*?)</${resultTag}>`, "i"),
    new RegExp(`<[^:]+:${resultTag}[^>]*>([\\s\\S]*?)</[^:]+:${resultTag}>`, "i"),
  ];
  for (const pattern of patterns) {
    const match = String(xml || "").match(pattern);
    if (match) return match[1];
  }
  const faultMatch = String(xml || "").match(/<faultstring[^>]*>([^<]*)<\/faultstring>/i);
  if (faultMatch) {
    throw new Error(`SOAP \uC624\uB958: ${decodeXml(faultMatch[1])}`);
  }
  throw new Error(`${resultTag} \uACB0\uACFC\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.`);
}

export function extractLogBlocks(resultBlock, tagName = "BankAccountLogEx") {
  const regex = new RegExp(`<(?:[^:]+:)?${tagName}[^>]*>([\\s\\S]*?)<\\/(?:[^:]+:)?${tagName}>`, "gi");
  const blocks = [];
  let match;
  while ((match = regex.exec(resultBlock))) {
    blocks.push(match[0]);
  }
  return blocks;
}

export function extractAccountBlocks(resultBlock) {
  const regex = /<(?:[^:]+:)?BankAccount[^>]*>([\s\S]*?)<\/(?:[^:]+:)?BankAccount>/gi;
  const blocks = [];
  let match;
  while ((match = regex.exec(resultBlock))) {
    blocks.push(match[0]);
  }
  return blocks;
}

export async function callBankAccountSoapRequest(operation, fields) {
  const envelope = buildSoapEnvelope(operation, fields);
  const response = await fetch(serviceUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: `"${SOAP_NS}${operation}"`,
    },
    body: envelope,
  });

  const xml = await response.text();
  if (!response.ok) {
    throw new Error(`\uBC14\uB85C\uBE4C \uACC4\uC88C API HTTP ${response.status}: ${xml.slice(0, 300)}`);
  }
  return xml;
}

export async function callBankAccountSoap(operation, fields, resultTag) {
  const xml = await callBankAccountSoapRequest(operation, fields);
  const rawResult = extractSoapResult(xml, resultTag);
  return { rawResult, xml };
}

function extractSoapResult(xml, resultTag) {
  const patterns = [
    new RegExp(`<${resultTag}[^>]*>([^<]*)</${resultTag}>`, "i"),
    new RegExp(`<[^:]+:${resultTag}[^>]*>([^<]*)</[^:]+:${resultTag}>`, "i"),
  ];

  for (const pattern of patterns) {
    const match = String(xml || "").match(pattern);
    if (match) return match[1];
  }

  const blockPatterns = [
    new RegExp(`<${resultTag}[^>]*>([\\s\\S]*?)</${resultTag}>`, "i"),
    new RegExp(`<[^:]+:${resultTag}[^>]*>([\\s\\S]*?)</[^:]+:${resultTag}>`, "i"),
  ];
  for (const pattern of blockPatterns) {
    const match = String(xml || "").match(pattern);
    if (match) return match[1];
  }

  const faultMatch = String(xml || "").match(/<faultstring[^>]*>([^<]*)<\/faultstring>/i);
  if (faultMatch) {
    throw new Error(`SOAP \uC624\uB958: ${decodeXml(faultMatch[1])}`);
  }

  throw new Error(`${resultTag} \uACB0\uACFC\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.`);
}

export function normalizeBankAccountNum(value) {
  return String(value || "").replace(/\D/g, "");
}

export function formatBankAccountNum(value) {
  const digits = normalizeBankAccountNum(value);
  if (digits.length === 14) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 9)}-${digits.slice(9, 11)}-${digits.slice(11)}`;
  }
  if (digits.length === 12) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 8)}-${digits.slice(8)}`;
  }
  return String(value || "").trim();
}

export function getBarobillBankConfigStatus() {
  const { certKey, corpNum, userId, bankAccountNum, bankSyncEnabled, bankSyncDays, test } = config.barobill;
  const hasCertKey = Boolean(String(certKey || "").trim());
  const hasCorpNum = Boolean(String(corpNum || "").trim());
  const hasUserId = Boolean(String(userId || "").trim());
  const accountDigits = normalizeBankAccountNum(bankAccountNum);

  return {
    configured: hasCertKey && hasCorpNum && hasUserId && Boolean(accountDigits),
    enabled: bankSyncEnabled,
    test,
    hasCertKey,
    hasCorpNum,
    hasUserId,
    bankAccountNum: formatBankAccountNum(bankAccountNum),
    bankAccountNumRaw: accountDigits,
    syncDays: bankSyncDays,
  };
}

export function assertBarobillBankCredentials() {
  const { certKey, corpNum, userId, bankAccountNum } = config.barobill;
  const creds = assertBarobillCredentials({ requireUserId: true });
  const accountDigits = normalizeBankAccountNum(bankAccountNum);
  if (!accountDigits) {
    throw new Error("BAROBILL_BANK_ACCOUNT_NUM\uC774 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.");
  }
  return {
    ...creds,
    bankAccountNum: accountDigits,
    bankAccountDisplay: formatBankAccountNum(bankAccountNum),
  };
}
