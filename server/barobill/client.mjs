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
    throw new Error(`SOAP 오류: ${faultMatch[1]}`);
  }

  throw new Error(`${resultTag} 응답을 읽을 수 없습니다.`);
}

export function parseNumericResult(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

function decodeXml(text) {
  return String(text ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/** GetBaroBillURL TOGO: 요금결제 페이지 */
export const BAROBILL_TOGO_CHARGE = "CHRG";

export function maskCertKey(certKey) {
  const key = String(certKey || "").trim();
  if (!key) return "(없음)";
  if (key.length <= 8) return "****";
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

export function getBarobillConfigStatus() {
  const { certKey, corpNum, userId, userPwd, test, wsdlUrl } = config.barobill;
  const hasCertKey = Boolean(String(certKey || "").trim());
  const hasCorpNum = Boolean(String(corpNum || "").trim());
  const hasUserId = Boolean(String(userId || "").trim());
  const hasUserPwd = Boolean(String(userPwd || "").trim());

  return {
    configured: hasCertKey && hasCorpNum,
    test,
    wsdlUrl,
    hasCertKey,
    hasCorpNum,
    hasUserId,
    hasUserPwd,
    certKeyMasked: maskCertKey(certKey),
  };
}

export function assertBarobillCredentials({ requireCorpNum = true, requireUserId = false } = {}) {
  const { certKey, corpNum, userId } = config.barobill;
  const trimmedCertKey = String(certKey || "").trim();
  const trimmedCorpNum = String(corpNum || "").trim();
  const trimmedUserId = String(userId || "").trim();

  if (!trimmedCertKey) {
    throw new Error("BAROBILL_CERT_KEY가 설정되지 않았습니다. 바로빌 개발자센터에서 발급받은 값을 .env에 설정해 주세요.");
  }

  if (requireCorpNum && !trimmedCorpNum) {
    throw new Error("BAROBILL_CORP_NUM이 설정되지 않았습니다. 사업자번호 10자리(하이픈 제외)를 .env에 설정해 주세요.");
  }

  if (requireUserId && !trimmedUserId) {
    throw new Error("BAROBILL_USER_ID가 설정되지 않았습니다. 바로빌 로그인 아이디를 .env에 설정해 주세요.");
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
    throw new Error(`바로빌 API HTTP ${response.status}: ${xml.slice(0, 300)}`);
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
    throw new Error("CheckCERTIsValid 응답을 해석할 수 없습니다.");
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
    throw new Error("GetBalanceCostAmount 응답을 해석할 수 없습니다.");
  }
  return value;
}

export async function getBarobillUrl(togo = BAROBILL_TOGO_CHARGE) {
  const { certKey, corpNum, userId } = assertBarobillCredentials({ requireUserId: true });
  const userPwd = String(config.barobill.userPwd || "").trim();
  if (!userPwd) {
    throw new Error("BAROBILL_USER_PWD가 설정되지 않았습니다. 바로빌 로그인 비밀번호를 .env에 설정해 주세요.");
  }

  const { rawResult } = await callBarobillSoap(
    "GetBaroBillURL",
    {
      CERTKEY: certKey,
      CorpNum: corpNum,
      ID: userId,
      PWD: userPwd,
      TOGO: String(togo || BAROBILL_TOGO_CHARGE),
    },
    "GetBaroBillURLResult",
  );

  const result = decodeXml(String(rawResult || "").trim());
  const asNumber = parseNumericResult(result);
  if (asNumber !== null && asNumber < 0) {
    const message = await describeBarobillCode(asNumber);
    const error = new Error(message || `바로빌 오류 (${asNumber})`);
    error.errCode = asNumber;
    throw error;
  }
  if (!/^https?:\/\//i.test(result)) {
    throw new Error(result || "바로빌 URL을 받지 못했습니다.");
  }
  return result;
}

async function describeBarobillCode(code) {
  if (code >= 0) return null;
  try {
    const message = await getErrString(code);
    return message || `바로빌 오류 ${code}`;
  } catch {
    return `바로빌 오류 ${code}`;
  }
}

export async function testBarobillConnection() {
  const status = getBarobillConfigStatus();

  if (!status.hasCertKey) {
    return {
      ...status,
      connectionOk: false,
      message: "BAROBILL_CERT_KEY가 없습니다. .env에 인증키를 설정해 주세요.",
    };
  }

  if (!status.hasCorpNum) {
    return {
      ...status,
      connectionOk: false,
      message: "BAROBILL_CORP_NUM이 없습니다. 사업자번호를 .env에 설정해 주세요.",
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
        message: detail || `바로빌 API 오류 (${balance})`,
      };
    }

    return {
      ...status,
      connectionOk: true,
      balance,
      message: `바로빌 API 연결 성공. 잔액: ${balance.toLocaleString("ko-KR")}원`,
    };
  } catch (error) {
    return {
      ...status,
      connectionOk: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
