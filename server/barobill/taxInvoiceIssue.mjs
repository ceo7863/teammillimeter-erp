import crypto from "crypto";
import { config } from "../config.mjs";
import { getErpState } from "../db.mjs";
import {
  assertBarobillCredentials,
  callBarobillSoapRequest,
  escapeXml,
  extractSoapResult,
  getErrString,
  parseNumericResult,
} from "./client.mjs";

const SOAP_NS = "http://ws.baroservice.com/";
const ISSUE_DIRECTION_SALES = 1;
const TAX_INVOICE_TYPE_NORMAL = 1;
const TAX_CALC_TYPE_MANUAL = 1;
const DEFAULT_PURPOSE_TYPE = 2;
const DEFAULT_INVOICER_BIZ = {
  bizType: "\uAC74\uC124\uC5C5",
  bizClass: "\uAC00\uAD6C\uC2DC\uACF5",
};

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

function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

function toBarobillDate(isoDate) {
  return digitsOnly(isoDate).slice(0, 8);
}

function resolveTaxType(documentType) {
  return documentType === "bill" ? 3 : 1;
}

function generateMgtKey(issueDate) {
  const datePart = toBarobillDate(issueDate) || new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = crypto.randomBytes(3).toString("hex");
  return `${datePart}-${suffix}`;
}

function normalizeCompanyProfile(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  return {
    name: String(source.name || "\uD300\uBC00\uB9AC\uBBF8\uD130").trim() || "\uD300\uBC00\uB9AC\uBBF8\uD130",
    businessNo: digitsOnly(source.businessNo || ""),
    ceoName: String(source.ceoName || "").trim(),
    email: String(source.email || "").trim(),
    bizType: String(source.bizType || DEFAULT_INVOICER_BIZ.bizType).trim() || DEFAULT_INVOICER_BIZ.bizType,
    bizClass: String(source.bizClass || DEFAULT_INVOICER_BIZ.bizClass).trim() || DEFAULT_INVOICER_BIZ.bizClass,
    phone: String(source.phone || "").trim(),
    address: String(source.address || "").trim(),
  };
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function resolveInvoicerProfile() {
  const state = getErpState();
  const profile = normalizeCompanyProfile(state.data?.companyProfile);
  const corpNum = digitsOnly(config.barobill.corpNum || profile.businessNo);
  const ceoName = String(config.barobill.ceoName || profile.ceoName || "").trim();
  const email = String(config.barobill.contactEmail || profile.email || "").trim();
  const contactId = String(config.barobill.userId || "").trim();

  return {
    corpNum,
    corpName: profile.name,
    ceoName,
    contactId,
    contactName: ceoName,
    email,
    addr: profile.address,
    tel: profile.phone,
    bizType: String(config.barobill.bizType || profile.bizType || DEFAULT_INVOICER_BIZ.bizType).trim(),
    bizClass: String(config.barobill.bizClass || profile.bizClass || DEFAULT_INVOICER_BIZ.bizClass).trim(),
  };
}

function buildInvoicePartyXml(party, { includeMgtNum = false } = {}) {
  const parts = [];
  if (includeMgtNum && party.mgtNum) {
    parts.push(`<MgtNum>${escapeXml(party.mgtNum)}</MgtNum>`);
  }
  if (party.contactId) parts.push(`<ContactID>${escapeXml(party.contactId)}</ContactID>`);
  if (party.corpNum) parts.push(`<CorpNum>${escapeXml(party.corpNum)}</CorpNum>`);
  if (party.corpName) parts.push(`<CorpName>${escapeXml(party.corpName)}</CorpName>`);
  if (party.bizType) parts.push(`<BizType>${escapeXml(party.bizType)}</BizType>`);
  if (party.bizClass) parts.push(`<BizClass>${escapeXml(party.bizClass)}</BizClass>`);
  if (party.ceoName) parts.push(`<CEOName>${escapeXml(party.ceoName)}</CEOName>`);
  if (party.contactName) parts.push(`<ContactName>${escapeXml(party.contactName)}</ContactName>`);
  if (party.addr) parts.push(`<Addr>${escapeXml(party.addr)}</Addr>`);
  if (party.tel) parts.push(`<TEL>${escapeXml(party.tel)}</TEL>`);
  if (party.email) parts.push(`<Email>${escapeXml(party.email)}</Email>`);
  return parts.join("");
}

export function buildTaxInvoiceXml(payload) {
  const {
    mgtKey,
    issueDate,
    invoicer,
    invoicee,
    documentType,
    supplyAmount,
    vatAmount,
    totalAmount,
    itemName,
    memo,
    purposeType = DEFAULT_PURPOSE_TYPE,
  } = payload;

  const writeDate = toBarobillDate(issueDate);
  const taxType = resolveTaxType(documentType);
  const lineName = String(itemName || memo || "\uD488\uBAA9").trim() || "\uD488\uBAA9";
  const remark = String(memo || "").trim();

  const invoicerXml = buildInvoicePartyXml(
    {
      mgtNum: mgtKey,
      contactId: invoicer.contactId,
      corpNum: invoicer.corpNum,
      corpName: invoicer.corpName,
      ceoName: invoicer.ceoName,
      contactName: invoicer.contactName,
      email: invoicer.email,
      addr: invoicer.addr,
      tel: invoicer.tel,
      bizType: invoicer.bizType,
      bizClass: invoicer.bizClass,
    },
    { includeMgtNum: true },
  );

  const invoiceeXml = buildInvoicePartyXml({
    corpNum: invoicee.corpNum,
    corpName: invoicee.corpName,
    ceoName: invoicee.ceoName,
    addr: invoicee.addr,
    contactName: invoicee.contactName || invoicee.ceoName,
    tel: invoicee.tel,
    email: invoicee.email,
    bizType: invoicee.bizType,
    bizClass: invoicee.bizClass,
  });

  const lineItemXml = `<TaxInvoiceTradeLineItem>
      <PurchaseExpiry>${escapeXml(writeDate)}</PurchaseExpiry>
      <Name>${escapeXml(lineName)}</Name>
      <Amount>${escapeXml(String(supplyAmount))}</Amount>
      <Tax>${escapeXml(String(vatAmount))}</Tax>
    </TaxInvoiceTradeLineItem>`;

  const remarkXml = remark ? `<Remark1>${escapeXml(remark)}</Remark1>` : "";

  return `<InvoicerParty>${invoicerXml}</InvoicerParty>
      <InvoiceeParty>${invoiceeXml}</InvoiceeParty>
      <IssueDirection>${ISSUE_DIRECTION_SALES}</IssueDirection>
      <TaxInvoiceType>${TAX_INVOICE_TYPE_NORMAL}</TaxInvoiceType>
      <TaxType>${taxType}</TaxType>
      <TaxCalcType>${TAX_CALC_TYPE_MANUAL}</TaxCalcType>
      <PurposeType>${Number(purposeType) || DEFAULT_PURPOSE_TYPE}</PurposeType>
      <WriteDate>${escapeXml(writeDate)}</WriteDate>
      <AmountTotal>${escapeXml(String(supplyAmount))}</AmountTotal>
      <TaxTotal>${escapeXml(String(vatAmount))}</TaxTotal>
      <TotalAmount>${escapeXml(String(totalAmount))}</TotalAmount>
      ${remarkXml}
      <TaxInvoiceTradeLineItems>${lineItemXml}</TaxInvoiceTradeLineItems>`;
}

function validateIssueInput(input) {
  if (input.flowType && input.flowType !== "sales") {
    return "\uB9E4\uCD9C(\uC815\uBC1C\uD589) \uACC4\uC0B0\uC11C\uB9CC \uBC14\uB85C\uBE4C \uBC1C\uD589\uC744 \uC9C0\uC6D0\uD569\uB2C8\uB2E4.";
  }

  const issueDate = String(input.issueDate || "").trim();
  if (!issueDate) return "\uBC1C\uD589\uC77C\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694.";

  const client = String(input.client || "").trim();
  if (!client) return "\uAC70\uB798\uCC98\uBA85\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694.";

  const businessNo = digitsOnly(input.businessNo);
  if (businessNo.length !== 10) return "\uAC70\uB798\uCC98 \uC0AC\uC5C5\uC790\uBC88\uD638 10\uC790\uB9AC\uB97C \uC785\uB825\uD574 \uC8FC\uC138\uC694.";

  const supplyAmount = Math.round(Number(input.supplyAmount) || 0);
  const vatAmount = Math.round(Number(input.vatAmount) || 0);
  const totalAmount = Math.round(Number(input.totalAmount) || 0);

  if (supplyAmount <= 0 || totalAmount <= 0) {
    return "\uACF5\uAE09\uAC00\uC561\uACFC \uD569\uACC4\uAE08\uC561\uC740 0\uBCF4\uB2E4 \uCEE4\uC57C \uD569\uB2C8\uB2E4.";
  }

  const invoicer = resolveInvoicerProfile();
  if (!invoicer.corpNum || invoicer.corpNum.length !== 10) {
    return "\uACF5\uAE09\uC790 \uC0AC\uC5C5\uC790\uBC88\uD638(BAROBILL_CORP_NUM \uB610\uB294 \uD68C\uC0AC\uC815\uBCF4)\uAC00 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.";
  }
  if (!invoicer.ceoName) {
    return "\uACF5\uAE09\uC790 \uB300\uD45C\uC790\uBA85\uC774 \uC5C6\uC2B5\uB2C8\uB2E4. .env\uC758 BAROBILL_CEO_NAME \uB610\uB294 \uD68C\uC0AC\uC815\uBCF4\uB97C \uD655\uC778\uD574 \uC8FC\uC138\uC694.";
  }
  if (!invoicer.email) {
    return "\uACF5\uAE09\uC790 \uC774\uBA54\uC77C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4. .env\uC758 BAROBILL_CONTACT_EMAIL\uC744 \uC124\uCEC4\uD574 \uC8FC\uC138\uC694.";
  }
  if (!invoicer.contactId) {
    return "\uBC14\uB85C\uBE4C \uC0AC\uC6A9\uC790 ID(BAROBILL_USER_ID)\uAC00 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.";
  }
  if (!invoicer.addr) {
    return "\uACF5\uAE09\uC790 \uC8FC\uC18C\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4. \uAE30\uBCF8\uC815\uBCF4 \u2192 \uD68C\uC0AC \uC815\uBCF4\uC5D0\uC11C \uC8FC\uC18C\uB97C \uC785\uB825\uD574 \uC8FC\uC138\uC694.";
  }
  if (!invoicer.bizType) {
    return "\uACF5\uAE09\uC790 \uC5C5\uD0DC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4. \uAE30\uBCF8\uC815\uBCF4 \u2192 \uD68C\uC0AC \uC815\uBCF4\uC5D0\uC11C \uC5C5\uD0DC\uB97C \uC785\uB825\uD574 \uC8FC\uC138\uC694.";
  }
  if (!invoicer.bizClass) {
    return "\uACF5\uAE09\uC790 \uC5C5\uC885\uC774 \uC5C6\uC2B5\uB2C8\uB2E4. \uAE30\uBCF8\uC815\uBCF4 \u2192 \uD68C\uC0AC \uC815\uBCF4\uC5D0\uC11C \uC5C5\uC885\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694.";
  }

  const invoiceeCeoName = String(input.invoiceeCeoName || "").trim();
  const invoiceeAddr = String(input.invoiceeAddr || "").trim();
  const invoiceeEmail = String(input.invoiceeEmail || "").trim();
  const invoiceeBizType = String(input.invoiceeBizType || "").trim();
  const invoiceeBizClass = String(input.invoiceeBizClass || "").trim();

  if (!invoiceeCeoName) return "\uAC70\uB798\uCC98 \uB300\uD45C\uC790\uBA85\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694.";
  if (!invoiceeAddr) return "\uAC70\uB798\uCC98 \uC8FC\uC18C\uB97C \uC785\uB825\uD574 \uC8FC\uC138\uC694.";
  if (!isValidEmail(invoiceeEmail)) return "\uAC70\uB798\uCC98 \uC774\uBA54\uC77C\uC744 \uC62C\uBC14\uB974\uAC8C \uC785\uB825\uD574 \uC8FC\uC138\uC694.";
  if (!invoiceeBizType) return "\uAC70\uB798\uCC98 \uC5C5\uD0DC\uB97C \uC785\uB825\uD574 \uC8FC\uC138\uC694.";
  if (!invoiceeBizClass) return "\uAC70\uB798\uCC98 \uC5C5\uC885\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694.";

  return null;
}

async function describeBarobillCode(code) {
  if (code >= 0) return null;
  try {
    const message = await getErrString(code);
    return message || `\uBC14\uB85C\uBE4C \uC624\uB958 ${code}`;
  } catch {
    return `\uBC14\uB85C\uBE4C \uC624\uB958 ${code}`;
  }
}

export async function getTaxInvoiceState(mgtKey) {
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
      throw new Error(`SOAP ??: ${decodeXml(faultMatch[1])}`);
    }
    throw new Error("\uACC4\uC0B0\uC11C \uC0C1\uD0DC \uC870\uD68C \uACB0\uACFC\uB97C \uBD84\uC11D\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
  }

  return {
    mgtKey: readXmlTag(resultBlock, "MgtKey") || String(mgtKey || "").trim(),
    ntsSendKey: readXmlTag(resultBlock, "NTSSendKey") || undefined,
    barobillState: Number(readXmlTag(resultBlock, "BarobillState")) || 0,
    ntsSendState: Number(readXmlTag(resultBlock, "NTSSendState")) || 0,
  };
}

export async function registAndIssueTaxInvoice(input) {
  const validationError = validateIssueInput(input);
  if (validationError) {
    const error = new Error(validationError);
    error.validation = true;
    throw error;
  }

  const { certKey, corpNum } = assertBarobillCredentials();
  const invoicer = resolveInvoicerProfile();
  const mgtKey = generateMgtKey(input.issueDate);
  const supplyAmount = Math.round(Number(input.supplyAmount) || 0);
  const vatAmount = Math.round(Number(input.vatAmount) || 0);
  const totalAmount = Math.round(Number(input.totalAmount) || 0);
  const documentType = input.documentType === "bill" ? "bill" : "tax";

  const invoiceXml = buildTaxInvoiceXml({
    mgtKey,
    issueDate: input.issueDate,
    invoicer,
    invoicee: {
      corpNum: digitsOnly(input.businessNo),
      corpName: String(input.client || "").trim(),
      ceoName: String(input.invoiceeCeoName || "").trim(),
      addr: String(input.invoiceeAddr || "").trim(),
      contactName: String(input.invoiceeContactName || input.invoiceeCeoName || "").trim(),
      tel: String(input.invoiceePhone || "").trim(),
      email: String(input.invoiceeEmail || "").trim(),
      bizType: String(input.invoiceeBizType || "").trim(),
      bizClass: String(input.invoiceeBizClass || "").trim(),
    },
    documentType,
    supplyAmount,
    vatAmount,
    totalAmount,
    itemName: input.itemName,
    memo: input.memo,
    purposeType: input.purposeType,
  });

  const xml = await callBarobillSoapRequest(
    "RegistAndIssueTaxInvoice",
    {
      CERTKEY: certKey,
      CorpNum: corpNum,
      Invoice: invoiceXml,
      SendSMS: "false",
      ForceIssue: "false",
      MailTitle: "\uC804\uC790\uC138\uAE08\uACC4\uC0B0\uC11C \uBC1C\uD589 \uC548\uB0B4",
    },
    { rawFieldNames: ["Invoice"] },
  );

  const rawResult = extractSoapResult(xml, "RegistAndIssueTaxInvoiceResult");
  const code = parseNumericResult(rawResult);
  if (code === null) {
    throw new Error("\uBC1C\uD589 \uACB0\uACFC \uCF54\uB4DC\uB97C \uBD84\uC11D\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
  }

  if (code < 0) {
    const detail = await describeBarobillCode(code);
    const error = new Error(detail || `\uACC4\uC0B0\uC11C \uBC1C\uD589 \uC2E4\uD328 (${code})`);
    error.errCode = code;
    throw error;
  }

  let invoiceNo;
  try {
    const state = await getTaxInvoiceState(mgtKey);
    invoiceNo = state.ntsSendKey;
  } catch {
    invoiceNo = undefined;
  }

  return {
    ok: true,
    mgtKey,
    invoiceNo,
    message: invoiceNo
      ? `\uC804\uC790\uACC4\uC0B0\uC11C\uAC00 \uBC1C\uD589\uB418\uC5C8\uC2B5\uB2C8\uB2E4. (\uC2B9\uC778\uBC88\uD638: ${invoiceNo})`
      : "\uC804\uC790\uACC4\uC0B0\uC11C\uAC00 \uBC1C\uD589\uB418\uC5C8\uC2B5\uB2C8\uB2E4.",
    errCode: undefined,
  };
}

function makeTaxInvoiceId() {
  return crypto.randomUUID();
}

export function buildIssuedTaxInvoiceRecord(input, issueResult, author) {
  const now = new Date().toISOString();
  const memoParts = [String(input.memo || "").trim(), issueResult.mgtKey ? `MgtKey: ${issueResult.mgtKey}` : ""].filter(
    Boolean,
  );

  return {
    id: makeTaxInvoiceId(),
    issueDate: String(input.issueDate || "").trim(),
    client: String(input.client || "").trim(),
    businessNo: digitsOnly(input.businessNo),
    flowType: "sales",
    documentType: input.documentType === "bill" ? "bill" : "tax",
    supplyAmount: Math.round(Number(input.supplyAmount) || 0),
    vatAmount: Math.round(Number(input.vatAmount) || 0),
    totalAmount: Math.round(Number(input.totalAmount) || 0),
    invoiceNo: issueResult.invoiceNo || undefined,
    memo: memoParts.length ? memoParts.join(" \u00B7 ") : undefined,
    status: "issued",
    createdAt: now,
    createdBy: author.name,
    createdByLoginId: author.loginId,
  };
}
