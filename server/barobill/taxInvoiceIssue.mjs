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
    name: String(source.name || "(?)?????").trim() || "(?)?????",
    businessNo: digitsOnly(source.businessNo || ""),
    phone: String(source.phone || "").trim(),
    address: String(source.address || "").trim(),
  };
}

function resolveInvoicerProfile() {
  const state = getErpState();
  const profile = normalizeCompanyProfile(state.data?.companyProfile);
  const corpNum = digitsOnly(config.barobill.corpNum || profile.businessNo);
  const ceoName = String(config.barobill.ceoName || "").trim();
  const email = String(config.barobill.contactEmail || "").trim();
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
  const lineName = String(itemName || memo || "??").trim() || "??";
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
    },
    { includeMgtNum: true },
  );

  const invoiceeXml = buildInvoicePartyXml({
    corpNum: invoicee.corpNum,
    corpName: invoicee.corpName,
    ceoName: invoicee.ceoName || "\uB300\uD45C",
    addr: invoicee.addr || "\uC8FC\uC18C \uBBF8\uC785\uB825",
    contactName: invoicee.contactName || invoicee.ceoName || "\uB300\uD45C",
    email: invoicee.email || "noreply@example.com",
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
    return "??(???) ?????? ??? ??? ?????.";
  }

  const issueDate = String(input.issueDate || "").trim();
  if (!issueDate) return "???? ??? ???.";

  const client = String(input.client || "").trim();
  if (!client) return "???? ??? ???.";

  const businessNo = digitsOnly(input.businessNo);
  if (businessNo.length !== 10) return "??? ??????? 10??? ??? ???.";

  const supplyAmount = Math.round(Number(input.supplyAmount) || 0);
  const vatAmount = Math.round(Number(input.vatAmount) || 0);
  const totalAmount = Math.round(Number(input.totalAmount) || 0);

  if (supplyAmount <= 0 || totalAmount <= 0) {
    return "????? ????? 0?? ?? ???.";
  }

  const invoicer = resolveInvoicerProfile();
  if (!invoicer.corpNum || invoicer.corpNum.length !== 10) {
    return "??? ?????(BAROBILL_CORP_NUM ?? ????)? ?????.";
  }
  if (!invoicer.ceoName) {
    return "??? ????? ?????. .env? BAROBILL_CEO_NAME? ????? ????? ??? ???.";
  }
  if (!invoicer.email) {
    return "??? ???? ?????. .env? BAROBILL_CONTACT_EMAIL? ??? ???.";
  }
  if (!invoicer.contactId) {
    return "??? ??? ID(BAROBILL_USER_ID)? ?????.";
  }

  return null;
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
    throw new Error("????? ?? ?? ??? ??? ? ????.");
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
      addr: String(input.invoiceeAddr || "").trim() || "\uC8FC\uC18C \uBBF8\uC785\uB825",
      contactName: String(input.invoiceeContactName || "").trim(),
      email: String(input.invoiceeEmail || "").trim(),
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
      MailTitle: "????? ?? ??",
    },
    { rawFieldNames: ["Invoice"] },
  );

  const rawResult = extractSoapResult(xml, "RegistAndIssueTaxInvoiceResult");
  const code = parseNumericResult(rawResult);
  if (code === null) {
    throw new Error("??? ?? ??? ??? ? ????.");
  }

  if (code < 0) {
    const detail = await describeBarobillCode(code);
    const error = new Error(detail || `??? ?? ?? (${code})`);
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
      ? `?????? ???????. (????: ${invoiceNo})`
      : "?????? ???????.",
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
    memo: memoParts.length ? memoParts.join("  ") : undefined,
    status: "issued",
    createdAt: now,
    createdBy: author.name,
    createdByLoginId: author.loginId,
  };
}
