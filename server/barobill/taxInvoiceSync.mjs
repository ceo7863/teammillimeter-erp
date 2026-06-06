import crypto from "crypto";
import { callBarobillSoapRequest, getErrString, assertBarobillCredentials } from "./client.mjs";
import { checkTaxInvoiceScrapService } from "./taxInvoiceScrap.mjs";

const SOAP_NS = "http://ws.baroservice.com/";
const COUNT_PER_PAGE = 100;
/** ??? ??? ?? ??: 1=??, 3=?? (2=??? ? API?? ???) */
const TAX_TYPES = [1, 3];
const DATE_TYPE_WRITE = 1;

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

function readXmlInt(block, tag) {
  const raw = readXmlTag(block, tag);
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
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
    throw new Error(`SOAP ??: ${decodeXml(faultMatch[1])}`);
  }
  throw new Error(`${resultTag} ??? ?? ? ????.`);
}

function extractInvoiceBlocks(resultBlock) {
  const regex = /<(?:[^:]+:)?SimpleTaxInvoiceEx[^>]*>([\s\S]*?)<\/(?:[^:]+:)?SimpleTaxInvoiceEx>/gi;
  const blocks = [];
  let match;
  while ((match = regex.exec(resultBlock))) {
    blocks.push(match[0]);
  }
  return blocks;
}

function parseBarobillDate(value) {
  const raw = String(value || "").replace(/\D/g, "");
  if (raw.length < 8) return "";
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
}

function parseAmount(value) {
  const num = Number(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(num) ? Math.round(num) : 0;
}

function formatBusinessNo(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length !== 10) return digits;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

function resolveDocumentType(taxType) {
  return Number(taxType) === 3 ? "bill" : "tax";
}

function resolveStatus(block) {
  const modifyCode = readXmlTag(block, "ModifyCode");
  const supplyAmount = parseAmount(readXmlTag(block, "AmountTotal"));
  const totalAmount = parseAmount(readXmlTag(block, "TotalAmount"));
  if (["3", "4", "6"].includes(modifyCode)) return "cancelled";
  if (supplyAmount < 0 || totalAmount < 0) return "cancelled";
  return "issued";
}

function buildMemo(block) {
  const parts = [
    readXmlTag(block, "ItemName"),
    readXmlTag(block, "Remark1"),
    readXmlTag(block, "Remark2"),
    readXmlTag(block, "Note"),
  ].filter(Boolean);
  return parts.length ? parts.join("  ") : undefined;
}

export function mapBarobillRowToImportRow(block, flowType) {
  const invoiceNo = readXmlTag(block, "NTSSendKey");
  if (!invoiceNo) return null;

  const issueDate =
    parseBarobillDate(readXmlTag(block, "WriteDate")) ||
    parseBarobillDate(readXmlTag(block, "IssueDT")) ||
    parseBarobillDate(readXmlTag(block, "NTSSendDT"));
  if (!issueDate) return null;

  const isPurchase = flowType === "purchase";
  const client = isPurchase ? readXmlTag(block, "InvoicerCorpName") : readXmlTag(block, "InvoiceeCorpName");
  const businessNoRaw = isPurchase ? readXmlTag(block, "InvoicerCorpNum") : readXmlTag(block, "InvoiceeCorpNum");
  if (!client) return null;

  const taxType = readXmlInt(block, "TaxType");
  const supplyAmount = Math.abs(parseAmount(readXmlTag(block, "AmountTotal")));
  const vatAmount = Math.abs(parseAmount(readXmlTag(block, "TaxTotal")));
  const totalAmount = Math.abs(parseAmount(readXmlTag(block, "TotalAmount")));

  return {
    issueDate,
    invoiceNo,
    client,
    businessNo: formatBusinessNo(businessNoRaw),
    flowType,
    supplyAmount,
    vatAmount,
    totalAmount,
    documentType: resolveDocumentType(taxType),
    status: resolveStatus(block),
    memo: buildMemo(block),
  };
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

function parsePagedTaxInvoiceEx(xml, resultTag) {
  const resultBlock = extractResultBlock(xml, resultTag);
  const currentPage = readXmlInt(resultBlock, "CurrentPage");
  const maxPageNum = readXmlInt(resultBlock, "MaxPageNum");
  const maxIndex = readXmlInt(resultBlock, "MaxIndex");

  if (currentPage < 0) {
    return { errorCode: currentPage, currentPage, maxPageNum, maxIndex, rows: [] };
  }
  if (maxIndex < 0) {
    return { errorCode: maxIndex, currentPage, maxPageNum, maxIndex, rows: [] };
  }

  const invoiceBlocks = extractInvoiceBlocks(resultBlock);
  return { errorCode: null, currentPage, maxPageNum, maxIndex, rows: invoiceBlocks };
}

async function fetchDailyTaxInvoicePage({ flowType, baseDate, taxType, currentPage }) {
  const { certKey, corpNum, userId } = assertBarobillCredentials({ requireUserId: true });
  const operation =
    flowType === "purchase" ? "GetDailyTaxInvoicePurchaseList" : "GetDailyTaxInvoiceSalesList";
  const resultTag = `${operation}Result`;

  const xml = await callBarobillSoapRequest(operation, {
    CERTKEY: certKey,
    CorpNum: corpNum,
    UserID: userId,
    TaxType: String(taxType),
    DateType: String(DATE_TYPE_WRITE),
    BaseDate: baseDate,
    CountPerPage: String(COUNT_PER_PAGE),
    CurrentPage: String(currentPage),
  });

  return parsePagedTaxInvoiceEx(xml, resultTag);
}

export async function fetchDailyTaxInvoices({ flowType, baseDate, taxType = 1 }) {
  const allBlocks = [];
  let currentPage = 1;
  let maxPageNum = 1;

  do {
    const page = await fetchDailyTaxInvoicePage({ flowType, baseDate, taxType, currentPage });
    if (page.errorCode !== null) {
      const detail = await describeBarobillCode(page.errorCode);
      const error = new Error(detail || `??? API ?? (${page.errorCode})`);
      error.errCode = page.errorCode;
      throw error;
    }

    allBlocks.push(...page.rows);
    maxPageNum = Math.max(1, page.maxPageNum || 1);
    currentPage += 1;
  } while (currentPage <= maxPageNum);

  return allBlocks;
}

function toBaseDate(isoDate) {
  return String(isoDate || "").replace(/-/g, "").slice(0, 8);
}

function* iterateIsoDates(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return;
  if (start > end) return;

  for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    yield cursor.toISOString().slice(0, 10);
  }
}

function sumImportRows(rows) {
  return rows.reduce(
    (acc, row) => {
      if (row.status === "cancelled") return acc;
      acc.count += 1;
      acc.supply += row.supplyAmount;
      acc.vat += row.vatAmount;
      acc.total += row.totalAmount;
      return acc;
    },
    { count: 0, supply: 0, vat: 0, total: 0 },
  );
}

function computeIssueDateRange(rows) {
  if (!rows.length) {
    return { earliestIssueDate: undefined, latestIssueDate: undefined };
  }
  let earliest = rows[0].issueDate;
  let latest = rows[0].issueDate;
  for (const row of rows) {
    if (row.issueDate.localeCompare(earliest) < 0) earliest = row.issueDate;
    if (row.issueDate.localeCompare(latest) > 0) latest = row.issueDate;
  }
  return { earliestIssueDate: earliest, latestIssueDate: latest };
}

function dedupeRows(rows) {
  const seen = new Set();
  const deduped = [];
  for (const row of rows) {
    if (seen.has(row.invoiceNo)) continue;
    seen.add(row.invoiceNo);
    deduped.push(row);
  }
  return deduped;
}

function flowTypeLabel(flowType) {
  return flowType === "purchase" ? "\uB9E4\uC785" : "\uB9E4\uCD9C";
}

export async function fetchTaxInvoicesInRange({ startDate, endDate, flowTypes = ["purchase", "sales"] }) {
  const errors = [];
  const collected = [];

  const scrapStatus = await checkTaxInvoiceScrapService();
  if (!scrapStatus.active) {
    errors.push(scrapStatus.message);
    const flowLabel = flowTypes.map((f) => flowTypeLabel(f)).join("/");
    return {
      flowType: flowTypes.length === 1 ? flowTypes[0] : "sales",
      sourceFile: "barobill-api",
      title: `\uBC14\uB85C\uBE4C API \uB3D9\uAE30\uD654 (${flowLabel})`,
      earliestIssueDate: undefined,
      latestIssueDate: undefined,
      rows: [],
      parsedTotals: { count: 0, supply: 0, vat: 0, total: 0 },
      errors,
      startDate,
      endDate,
      flowTypes,
      scrapStatus,
    };
  }

  if (scrapStatus.message && scrapStatus.code >= 0) {
    errors.push(scrapStatus.message);
  }
  if (scrapStatus.collecting && scrapStatus.message) {
    errors.push(scrapStatus.message);
  }

  for (const isoDate of iterateIsoDates(startDate, endDate)) {
    const baseDate = toBaseDate(isoDate);
    for (const flowType of flowTypes) {
      for (const taxType of TAX_TYPES) {
        try {
          const blocks = await fetchDailyTaxInvoices({ flowType, baseDate, taxType });
          for (const block of blocks) {
            const row = mapBarobillRowToImportRow(block, flowType);
            if (row) collected.push(row);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          errors.push(`${isoDate} ${flowType} TaxType${taxType}: ${message}`);
        }
      }
    }
  }

  const rows = dedupeRows(collected);
  const { earliestIssueDate, latestIssueDate } = computeIssueDateRange(rows);
  const flowLabel = flowTypes.map((f) => flowTypeLabel(f)).join("/");

  return {
    flowType: flowTypes.length === 1 ? flowTypes[0] : "sales",
    sourceFile: "barobill-api",
    title: `\uBC14\uB85C\uBE4C \uBAA9\uB85D \uB3D9\uAE30\uD654 (${flowLabel})`,
    earliestIssueDate,
    latestIssueDate,
    rows,
    parsedTotals: sumImportRows(rows),
    errors,
    startDate,
    endDate,
    flowTypes,
  };
}

function makeTaxInvoiceId() {
  return crypto.randomUUID();
}

export function countMergeAgainstExisting(existing, rows) {
  const known = new Set(
    (existing || [])
      .map((row) => String(row.invoiceNo || "").trim())
      .filter(Boolean),
  );
  let added = 0;
  let skipped = 0;
  for (const row of rows) {
    if (known.has(row.invoiceNo)) {
      skipped += 1;
    } else {
      added += 1;
      known.add(row.invoiceNo);
    }
  }
  return { added, skipped };
}

export function mergeBarobillTaxInvoices(existing, rows, author) {
  const known = new Set(
    (existing || [])
      .map((row) => String(row.invoiceNo || "").trim())
      .filter(Boolean),
  );

  const now = new Date().toISOString();
  const additions = [];
  let skipped = 0;

  for (const row of rows) {
    if (known.has(row.invoiceNo)) {
      skipped += 1;
      continue;
    }
    known.add(row.invoiceNo);
    additions.push({
      id: makeTaxInvoiceId(),
      issueDate: row.issueDate,
      client: row.client,
      businessNo: row.businessNo,
      flowType: row.flowType,
      documentType: row.documentType,
      supplyAmount: row.supplyAmount,
      vatAmount: row.vatAmount,
      totalAmount: row.totalAmount,
      invoiceNo: row.invoiceNo,
      memo: row.memo,
      status: row.status,
      createdAt: now,
      createdBy: author.name,
      createdByLoginId: author.loginId,
    });
  }

  return {
    next: [...additions, ...(existing || [])],
    added: additions.length,
    skipped,
  };
}

export async function syncBarobillTaxInvoices({
  startDate,
  endDate,
  flowTypes,
  existing = [],
  author,
  apply = false,
}) {
  const preview = await fetchTaxInvoicesInRange({ startDate, endDate, flowTypes });
  const { added, skipped } = countMergeAgainstExisting(existing, preview.rows);

  if (!apply) {
    return { ok: true, apply: false, added, skipped, preview };
  }

  const merged = mergeBarobillTaxInvoices(existing, preview.rows, author);
  return {
    ok: true,
    apply: true,
    added: merged.added,
    skipped: merged.skipped,
    preview,
    taxInvoices: merged.next,
  };
}
