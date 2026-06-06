import { callBarobillSoap, getErrString, assertBarobillCredentials } from "./client.mjs";
import { config } from "../config.mjs";

function decodeXml(text) {
  return String(text ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

async function describeCode(code) {
  if (code >= 0) return null;
  try {
    return await getErrString(code);
  } catch {
    return `??? ?? (${code})`;
  }
}

/** ??? ???? ??? ?? ?? ?? (RefreshTaxInvoiceScrap) */
export async function checkTaxInvoiceScrapService() {
  const { certKey, corpNum } = assertBarobillCredentials();
  const { rawResult } = await callBarobillSoap(
    "RefreshTaxInvoiceScrap",
    { CERTKEY: certKey, CorpNum: corpNum },
    "RefreshTaxInvoiceScrapResult",
  );
  const code = Number(String(rawResult || "").trim());
  if (code === -51001) {
    return {
      active: false,
      code,
      message:
        "??? ??/?? ?? ???? ???? ???? ?????. ????? ??? ??? ??? ? ?? ??? ???. (?? ?? ??? ??? ? ????)",
    };
  }
  if (code < 0) {
    const detail = await describeCode(code);
    return { active: false, code, message: detail || `??? ?? ?? ?? (${code})` };
  }
  return {
    active: true,
    code,
    message: "??? ?? ??? ??????. ? ? ? ?? ???? ???.",
  };
}

export async function getTaxInvoiceScrapRequestUrl() {
  const { certKey, corpNum, userId } = assertBarobillCredentials({ requireUserId: true });
  const userPwd = String(config.barobill.userPwd || "").trim();
  if (!userPwd) {
    throw new Error("BAROBILL_USER_PWD? ???? ?????.");
  }

  const { rawResult } = await callBarobillSoap(
    "GetTaxInvoiceScrapRequestURL",
    { CERTKEY: certKey, CorpNum: corpNum, ID: userId, PWD: userPwd },
    "GetTaxInvoiceScrapRequestURLResult",
  );

  const result = decodeXml(String(rawResult || "").trim());
  const asNumber = Number(result);
  if (Number.isFinite(asNumber) && asNumber < 0) {
    const detail = await describeCode(asNumber);
    const error = new Error(detail || `??? ?? ?? URL ?? ?? (${asNumber})`);
    error.errCode = asNumber;
    throw error;
  }
  if (!/^https?:\/\//i.test(result)) {
    throw new Error(result || "??? ?? ?? URL? ?? ?????.");
  }
  return result;
}

export async function refreshTaxInvoiceScrap() {
  return checkTaxInvoiceScrapService();
}
