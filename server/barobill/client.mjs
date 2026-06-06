import { config } from "../config.mjs";

const SOAP_NS = "http://ws.baroservice.com/";
const SOAP_ENVELOPE_NS = "http://schemas.xmlsoap.org/soap/envelope/";

function serviceUrl() {
  return config.barobill.test
    ? "https://testws.baroservice.com/TI.asmx"
    : "https://ws.baroservice.com/TI.asmx";
}

export function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildSoapEnvelope(operation, fields, { rawFieldNames = [] } = {}) {
  const rawSet = new Set(rawFieldNames);
  const bodyFields = Object.entries(fields)
    .map(([name, value]) => {
      if (rawSet.has(name)) {
        return `<${name}>${String(value ?? "")}</${name}>`;
      }
      return `<${name}>${escapeXml(value)}</${name}>`;
    })
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

export function buildSoapEnvelopeWithRawFields(operation, fields, rawFieldNames = []) {
  return buildSoapEnvelope(operation, fields, { rawFieldNames });
}

export function extractSoapResult(xml, resultTag) {
  const patterns = [
    new RegExp(`<${resultTag}[^>]*>([^<]*)</${resultTag}>`, "i"),
    new RegExp(`<[^:]+:${resultTag}[^>]*>([^<]*)</[^:]+:${resultTag}>`, "i"),
  ];

  for (const pattern of patterns) {
    const match = String(xml || "").match(pattern);
    if (match) return match[1];
  }

  const faultMatch = String(xml || "").match(/<faultstring[^>]*>([^<]*)<\/faultstring>/i);
  if (faultMatch) {
    throw new Error(`SOAP ??: ${faultMatch[1]}`);
  }

  throw new Error(`${resultTag} ??? ??? ? ????.`);
}

export function parseNumericResult(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

export function maskCertKey(certKey) {
  const key = String(certKey || "").trim();
  if (!key) return "(??)";
  if (key.length <= 8) return "****";
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

export function getBarobillConfigStatus() {
  const { certKey, corpNum, userId, test, wsdlUrl } = config.barobill;
  const hasCertKey = Boolean(String(certKey || "").trim());
  const hasCorpNum = Boolean(String(corpNum || "").trim());
  const hasUserId = Boolean(String(userId || "").trim());

  return {
    configured: hasCertKey && hasCorpNum,
    test,
    wsdlUrl,
    hasCertKey,
    hasCorpNum,
    hasUserId,
    certKeyMasked: maskCertKey(certKey),
  };
}

export function assertBarobillCredentials({ requireCorpNum = true, requireUserId = false } = {}) {
  const { certKey, corpNum, userId } = config.barobill;
  const trimmedCertKey = String(certKey || "").trim();
  const trimmedCorpNum = String(corpNum || "").trim();
  const trimmedUserId = String(userId || "").trim();

  if (!trimmedCertKey) {
    throw new Error("BAROBILL_CERT_KEY? ???? ?????. ??? ??????? ??? ???? .env? ??? ???.");
  }

  if (requireCorpNum && !trimmedCorpNum) {
    throw new Error("BAROBILL_CORP_NUM? ???? ?????. ??????? 10??(??? ??)? .env? ??? ???.");
  }

  if (requireUserId && !trimmedUserId) {
    throw new Error("BAROBILL_USER_ID? ???? ?????. ???? ??? ?? ???? .env? ??? ???.");
  }

  return {
    certKey: trimmedCertKey,
    corpNum: trimmedCorpNum.replace(/\D/g, ""),
    userId: trimmedUserId,
  };
}

export async function callBarobillSoapRequest(operation, fields, options = {}) {
  const envelope = buildSoapEnvelope(operation, fields, options);
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
    throw new Error(`??? API HTTP ${response.status}: ${xml.slice(0, 300)}`);
  }
  return xml;
}

export async function callBarobillSoap(operation, fields, resultTag) {
  const xml = await callBarobillSoapRequest(operation, fields);
  const rawResult = extractSoapResult(xml, resultTag);
  return { rawResult, xml };
}

export async function getErrString(errCode) {
  const { certKey } = assertBarobillCredentials({ requireCorpNum: false });
  const { rawResult } = await callBarobillSoap(
    "GetErrString",
    { CERTKEY: certKey, ErrCode: String(errCode) },
    "GetErrStringResult",
  );
  return String(rawResult || "").trim();
}

export async function checkCertIsValid() {
  const { certKey, corpNum } = assertBarobillCredentials();
  const { rawResult } = await callBarobillSoap(
    "CheckCERTIsValid",
    { CERTKEY: certKey, CorpNum: corpNum },
    "CheckCERTIsValidResult",
  );
  const code = parseNumericResult(rawResult);
  if (code === null) {
    throw new Error("CheckCERTIsValid ??? ???? ????.");
  }
  return code;
}

export async function getBalanceCostAmount() {
  const { certKey, corpNum } = assertBarobillCredentials();
  const { rawResult } = await callBarobillSoap(
    "GetBalanceCostAmount",
    { CERTKEY: certKey, CorpNum: corpNum },
    "GetBalanceCostAmountResult",
  );
  const value = parseNumericResult(rawResult);
  if (value === null) {
    throw new Error("GetBalanceCostAmount ??? ???? ????.");
  }
  return value;
}

async function describeBarobillCode(code) {
  if (code >= 0) return null;
  try {
    const message = await getErrString(code);
    return message || `?? ?? ${code}`;
  } catch {
    return `?? ?? ${code}`;
  }
}

export async function testBarobillConnection() {
  const status = getBarobillConfigStatus();

  if (!status.hasCertKey) {
    return {
      ...status,
      connectionOk: false,
      message: "BAROBILL_CERT_KEY? ????. .env? ???? ??? ???.",
    };
  }

  if (!status.hasCorpNum) {
    return {
      ...status,
      connectionOk: false,
      message: "BAROBILL_CORP_NUM? ????. ???????? ??? ? ?? ??? ???.",
    };
  }

  try {
    const balance = await getBalanceCostAmount();
    if (balance < 0) {
      const detail = await describeBarobillCode(balance);
      return {
        ...status,
        connectionOk: false,
        errCode: balance,
        message: detail || `??? API ?? (${balance})`,
      };
    }

    return {
      ...status,
      connectionOk: true,
      balance,
      message: `??? API ?? ??. ?? ??: ${balance.toLocaleString("ko-KR")}?`,
    };
  } catch (error) {
    return {
      ...status,
      connectionOk: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
