import { assertBarobillCredentials, callBarobillSoapRequest, getErrString } from "./client.mjs";

function decodeXml(text) {
  return String(text ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function readXmlTag(block, tag) {
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

function extractResultBlock(xml, resultTag) {
  const patterns = [
    new RegExp(`<${resultTag}[^>]*>([\\s\\S]*?)</${resultTag}>`, "i"),
    new RegExp(`<[^:]+:${resultTag}[^>]*>([\\s\\S]*?)</[^:]+:${resultTag}>`, "i"),
  ];
  for (const pattern of patterns) {
    const match = String(xml || "").match(pattern);
    if (match) return match[1];
  }
  return "";
}

function parseStateDetailFromBlock(resultBlock) {
  const barobillState = Number(readXmlTag(resultBlock, "BarobillState")) || 0;
  const ntsSendState = Number(readXmlTag(resultBlock, "NTSSendState")) || 0;
  const ntsSendKey = readXmlTag(resultBlock, "NTSSendKey") || undefined;
  return { barobillState, ntsSendState, ntsSendKey };
}

async function getTaxInvoiceStateEx(mgtKey) {
  const { certKey, corpNum, userId } = assertBarobillCredentials({ requireUserId: true });
  const xml = await callBarobillSoapRequest("GetTaxInvoiceStateEX", {
    CERTKEY: certKey,
    CorpNum: corpNum,
    ID: userId,
    MgtKey: String(mgtKey || "").trim(),
  });

  const resultBlock = extractResultBlock(xml, "GetTaxInvoiceStateEXResult");
  if (!resultBlock) {
    throw new Error("\uACC4\uC0B0\uC11C \uC0C1\uD0DC \uC870\uD68C \uACB0\uACFC\uB97C \uBD84\uC11D\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
  }

  const detail = parseStateDetailFromBlock(resultBlock);
  if (detail.barobillState < 0) {
    let message = `\uBC14\uB85C\uBE4C \uC624\uB958 ${detail.barobillState}`;
    try {
      message = (await getErrString(detail.barobillState)) || message;
    } catch {
      // keep default message
    }
    throw new Error(message);
  }

  return {
    mgtKey: String(mgtKey || "").trim(),
    ...detail,
  };
}

async function getTaxInvoiceStateLegacy(mgtKey) {
  const { certKey, corpNum } = assertBarobillCredentials();
  const xml = await callBarobillSoapRequest("GetTaxInvoiceState", {
    CERTKEY: certKey,
    CorpNum: corpNum,
    MgtKey: String(mgtKey || "").trim(),
  });

  const resultBlock = extractResultBlock(xml, "GetTaxInvoiceStateResult");
  if (!resultBlock) {
    const faultMatch = String(xml || "").match(/<faultstring[^>]*>([^<]*)<\/faultstring>/i);
    if (faultMatch) {
      throw new Error(`SOAP \uC624\uB958: ${decodeXml(faultMatch[1])}`);
    }
    throw new Error("\uACC4\uC0B0\uC11C \uC0C1\uD0DC \uC870\uD68C \uACB0\uACFC\uB97C \uBD84\uC11D\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
  }

  const numericOnly = /^\s*-?\d+\s*$/.test(resultBlock);
  if (numericOnly) {
    const barobillState = Number(resultBlock.trim()) || 0;
    if (barobillState < 0) {
      throw new Error(`\uBC14\uB85C\uBE4C \uC624\uB958 ${barobillState}`);
    }
    return {
      mgtKey: String(mgtKey || "").trim(),
      barobillState,
      ntsSendState: 0,
      ntsSendKey: undefined,
    };
  }

  return {
    mgtKey: String(mgtKey || "").trim(),
    ...parseStateDetailFromBlock(resultBlock),
  };
}

export async function getTaxInvoiceStateDetail(mgtKey) {
  const trimmedKey = String(mgtKey || "").trim();
  if (!trimmedKey) {
    throw new Error("MgtKey\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4.");
  }

  try {
    return await getTaxInvoiceStateEx(trimmedKey);
  } catch {
    return getTaxInvoiceStateLegacy(trimmedKey);
  }
}

export async function refreshBarobillTaxInvoiceStates(mgtKeys) {
  const uniqueKeys = [...new Set(mgtKeys.map((key) => String(key || "").trim()).filter(Boolean))];
  const results = [];

  for (const mgtKey of uniqueKeys) {
    try {
      const detail = await getTaxInvoiceStateDetail(mgtKey);
      results.push({ mgtKey, ok: true, ...detail });
    } catch (error) {
      results.push({
        mgtKey,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}
