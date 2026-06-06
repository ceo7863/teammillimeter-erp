function parseMoney(value) {
  const n = Number(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function formatKrw(value) {
  return `${Math.round(Number(value) || 0).toLocaleString("ko-KR")}${"\uC6D0"}`;
}

function yesterdayDateKey(now = new Date()) {
  const kst = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  kst.setDate(kst.getDate() - 1);
  const y = kst.getFullYear();
  const m = String(kst.getMonth() + 1).padStart(2, "0");
  const d = String(kst.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function dateKeyFromIso(value) {
  return String(value || "").slice(0, 10);
}

function getSaleBill(sale) {
  const direct = parseMoney(sale?.amount);
  if (direct > 0) return direct;
  const workers = Array.isArray(sale?.workers) ? sale.workers : [];
  return workers.reduce((sum, line) => sum + parseMoney(line?.lineBill || line?.chargeAmount), 0);
}

function getSaleMargin(sale) {
  const workers = Array.isArray(sale?.workers) ? sale.workers : [];
  const fromLines = workers.reduce((sum, line) => sum + parseMoney(line?.lineMargin), 0);
  if (fromLines > 0) return fromLines;
  const bill = getSaleBill(sale);
  const spend = workers.reduce((sum, line) => sum + parseMoney(line?.lineSpend), 0);
  return Math.max(0, bill - spend);
}

function sumTaxInvoices(rows, dateKey, flowType) {
  return rows
    .filter((row) => row?.flowType === flowType && row?.status !== "cancelled" && dateKeyFromIso(row?.issueDate) === dateKey)
    .reduce(
      (acc, row) => {
        acc.count += 1;
        acc.total += parseMoney(row?.totalAmount);
        return acc;
      },
      { count: 0, total: 0 },
    );
}

function sumBankForDate(rows, dateKey) {
  let deposits = 0;
  let withdrawals = 0;
  let count = 0;
  for (const row of rows) {
    if (dateKeyFromIso(row?.transactionAt) !== dateKey) continue;
    if (row?.netGroupRole === "preauth_withdrawal" || row?.netGroupRole === "preauth_refund") continue;
    count += 1;
    deposits += parseMoney(row?.deposit);
    withdrawals += parseMoney(row?.withdrawal);
  }
  return { count, deposits, withdrawals };
}

function latestBankBalance(rows) {
  let latest = null;
  for (const row of rows) {
    const at = String(row?.transactionAt || "");
    if (!at) continue;
    if (!latest || at.localeCompare(latest.at) > 0) {
      latest = { at, balance: parseMoney(row?.balanceAfter) };
    }
  }
  return latest?.balance ?? 0;
}

function sumSalesForDate(sales, dateKey) {
  const rows = sales.filter((sale) => dateKeyFromIso(sale?.date || sale?.createdAt) === dateKey);
  return rows.reduce(
    (acc, sale) => {
      acc.count += 1;
      acc.bill += getSaleBill(sale);
      acc.margin += getSaleMargin(sale);
      return acc;
    },
    { count: 0, bill: 0, margin: 0 },
  );
}

export function buildDailyReport(erpData, options = {}) {
  const dateKey = options.dateKey || yesterdayDateKey(options.now);
  const taxInvoices = Array.isArray(erpData?.taxInvoices) ? erpData.taxInvoices : [];
  const sales = Array.isArray(erpData?.sales) ? erpData.sales : [];
  const bankTransactions = Array.isArray(erpData?.bankTransactions) ? erpData.bankTransactions : [];

  const salesTax = sumTaxInvoices(taxInvoices, dateKey, "sales");
  const purchaseTax = sumTaxInvoices(taxInvoices, dateKey, "purchase");
  const bank = sumBankForDate(bankTransactions, dateKey);
  const balance = latestBankBalance(bankTransactions);
  const saleStats = sumSalesForDate(sales, dateKey);

  const label = dateKey.replace(/-/g, ".").slice(5);

  return {
    dateKey,
    label,
    taxSales: salesTax,
    taxPurchase: purchaseTax,
    bank: { ...bank, balance },
    sales: saleStats,
  };
}

export function formatDailyReportMessage(report, erpBaseUrl = "https://erp.teammillimeter.com") {
  const lines = [
    `[${"\uD300\uBC00\uB9AC\uBBF8\uD130 ERP"}] ${report.label} ${"\uC77C\uC77C\uBCF4\uACE0"}`,
    "",
    `${"\u25A0"} ${"\uC138\uAE08\uACC4\uC0B0\uC11C"} (${"\uC804\uC77C"})`,
    `${"\u00B7"} ${"\uB9E4\uCD9C"} ${report.taxSales.count}${"\uAC74"} ${"\u00B7"} ${formatKrw(report.taxSales.total)}`,
    `${"\u00B7"} ${"\uB9E4\uC785"} ${report.taxPurchase.count}${"\uAC74"} ${"\u00B7"} ${formatKrw(report.taxPurchase.total)}`,
    "",
    `${"\u25A0"} ${"\uD1B5\uC7A5"} (${"\uC804\uC77C"})`,
    `${"\u00B7"} ${"\uC785\uAE08"} ${formatKrw(report.bank.deposits)}`,
    `${"\u00B7"} ${"\uCD9C\uAE08"} ${formatKrw(report.bank.withdrawals)}`,
    `${"\u00B7"} ${"\uC794\uC561"} ${formatKrw(report.bank.balance)}`,
    "",
    `${"\u25A0"} ${"\uB9E4\uCD9C\uC804\uD45C"} (${"\uC804\uC77C"})`,
    `${"\u00B7"} ${"\uAC74\uC218"} ${report.sales.count}${"\uAC74"}`,
    `${"\u00B7"} ${"\uCCAD\uAD6C\uC561"} ${formatKrw(report.sales.bill)}`,
    `${"\u00B7"} ${"\uB9C8\uC9C4"} ${formatKrw(report.sales.margin)}`,
    "",
    erpBaseUrl,
  ];
  return lines.join("\n");
}

export function formatDailyReportTemplateVars(report) {
  return {
    reportDate: report.label,
    salesTaxCount: String(report.taxSales.count),
    salesTaxAmount: formatKrw(report.taxSales.total),
    purchaseTaxCount: String(report.taxPurchase.count),
    purchaseTaxAmount: formatKrw(report.purchaseTax.total),
    bankDeposit: formatKrw(report.bank.deposits),
    bankWithdrawal: formatKrw(report.bank.withdrawals),
    bankBalance: formatKrw(report.bank.balance),
    voucherCount: String(report.sales.count),
    voucherBill: formatKrw(report.sales.bill),
    voucherMargin: formatKrw(report.sales.margin),
    reportBody: formatDailyReportMessage(report),
  };
}

export function formatCommentNotifyMessage({ sale, comment, erpBaseUrl = "https://erp.teammillimeter.com" }) {
  const client = String(sale?.client || "-").trim() || "-";
  const site = String(sale?.site || "-").trim() || "-";
  const author = String(comment?.authorName || "-").trim() || "-";
  const body = String(comment?.body || "").trim();
  return [
    `[${"\uD300\uBC00\uB9AC\uBBF8\uD130 ERP"}] ${"\uC0C8 \uB313\uAE00"}`,
    `${client} ${"\u00B7"} ${site}`,
    `${author}: ${body}`,
    erpBaseUrl,
  ].join("\n");
}

export function formatCommentTemplateVars({ sale, comment }) {
  return {
    client: String(sale?.client || "-").trim() || "-",
    site: String(sale?.site || "-").trim() || "-",
    author: String(comment?.authorName || "-").trim() || "-",
    body: String(comment?.body || "").trim(),
    message: formatCommentNotifyMessage({ sale, comment }),
  };
}
