import {
  assertBarobillCredentials,
  callBarobillSoapRequest,
} from "./client.mjs";
import { getTaxInvoiceState } from "./taxInvoiceIssue.mjs";

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
  const faultMatch = String(xml || "").match(/<faultstring[^>]*>([^<]*)<\/faultstring>/i);
  if (faultMatch) {
    throw new Error(`SOAP \uC624\uB958: ${decodeXml(faultMatch[1])}`);
  }
  return "";
}

function extractNestedBlock(parent, tag) {
  const patterns = [
    new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"),
    new RegExp(`<[^:]+:${tag}[^>]*>([\\s\\S]*?)</[^:]+:${tag}>`, "i"),
  ];
  for (const pattern of patterns) {
    const match = String(parent || "").match(pattern);
    if (match) return match[1];
  }
  return "";
}

function formatBusinessNo(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 10);
  if (digits.length !== 10) return digits;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

function parseAmount(value) {
  const num = Number(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(num) ? Math.round(num) : 0;
}

function parsePartyBlock(block) {
  if (!block) {
    return {
      name: "",
      businessNo: "",
      ceoName: "",
      address: "",
      bizType: "",
      bizClass: "",
      email: "",
      phone: "",
    };
  }
  return {
    name: readXmlTag(block, "CorpName"),
    businessNo: formatBusinessNo(readXmlTag(block, "CorpNum")),
    ceoName: readXmlTag(block, "CEOName"),
    address: readXmlTag(block, "Addr"),
    bizType: readXmlTag(block, "BizType"),
    bizClass: readXmlTag(block, "BizClass"),
    email: readXmlTag(block, "Email"),
    phone: readXmlTag(block, "TEL") || readXmlTag(block, "HP"),
  };
}

function readFirstLineItemName(resultBlock) {
  const match = String(resultBlock || "").match(
    /<(?:[^:]+:)?TaxInvoiceTradeLineItem[^>]*>([\s\S]*?)<\/(?:[^:]+:)?TaxInvoiceTradeLineItem>/i,
  );
  if (!match) return "";
  return readXmlTag(match[1], "Name");
}

function readNtsSendKeyFromXml(xml) {
  const direct = readXmlTag(xml, "NTSSendKey");
  if (direct) return direct;
  const matches = [...String(xml || "").matchAll(/<(?:[^:]+:)?NTSSendKey>([^<]*)<\/(?:[^:]+:)?NTSSendKey>/gi)];
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const value = decodeXml(matches[index][1]).trim();
    if (value) return value;
  }
  return "";
}

function buildMemo(resultBlock) {
  return [readXmlTag(resultBlock, "Remark1"), readXmlTag(resultBlock, "Remark2"), readXmlTag(resultBlock, "Remark3")]
    .filter(Boolean)
    .join(" \u00B7 ");
}

export async function fetchBarobillTaxInvoiceDetail(mgtKey) {
  const trimmedKey = String(mgtKey || "").trim();
  if (!trimmedKey) {
    throw new Error("MgtKey\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4.");
  }

  const { certKey, corpNum } = assertBarobillCredentials();
  const xml = await callBarobillSoapRequest("GetTaxInvoice", {
    CERTKEY: certKey,
    CorpNum: corpNum,
    MgtKey: trimmedKey,
  });

  const resultBlock = extractResultBlock(xml, "GetTaxInvoiceResult");
  if (!resultBlock) {
    throw new Error("\uACC4\uC0B0\uC11C \uC0C1\uC138 \uC870\uD68C \uACB0\uACFC\uB97C \uBD84\uC11D\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
  }

  const taxType = Number(readXmlTag(resultBlock, "TaxType")) || 1;
  const documentType = taxType === 3 ? "bill" : "tax";

  let invoiceNo = readNtsSendKeyFromXml(resultBlock) || readNtsSendKeyFromXml(xml);
  if (!invoiceNo) {
    try {
      const state = await getTaxInvoiceState(trimmedKey);
      invoiceNo = state.ntsSendKey || "";
    } catch {
      invoiceNo = "";
    }
  }

  return {
    mgtKey: trimmedKey,
    issueDate: readXmlTag(resultBlock, "WriteDate"),
    invoiceNo,
    itemName: readFirstLineItemName(resultBlock),
    memo: buildMemo(resultBlock),
    supplyAmount: parseAmount(readXmlTag(resultBlock, "AmountTotal")),
    vatAmount: parseAmount(readXmlTag(resultBlock, "TaxTotal")),
    totalAmount: parseAmount(readXmlTag(resultBlock, "TotalAmount")),
    documentType,
    supplier: parsePartyBlock(extractNestedBlock(resultBlock, "InvoicerParty")),
    buyer: parsePartyBlock(extractNestedBlock(resultBlock, "InvoiceeParty")),
  };
}
