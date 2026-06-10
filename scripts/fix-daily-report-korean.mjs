import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const p = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "server", "dailyReport.mjs");
let s = fs.readFileSync(p, "utf8");

s = s.replace(
  /function formatKrw\(value\) \{[\s\S]*?\}/,
  'function formatKrw(value) {\n  return `${Math.round(Number(value) || 0).toLocaleString("ko-KR")}${"\\uC6D0"}`;\n}',
);

const formatDailyReportMessage = [
  'export function formatDailyReportMessage(report, erpBaseUrl = "https://erp.teammillimeter.com") {',
  "  const lines = [",
  '    `[${"\\uD300\\uBC00\\uB9AC\\uBBF8\\uD130 ERP"}] ${report.label} ${"\\uC77C\\uC77C\\uBCF4\\uACE0"}`,',
  '    "",',
  '    `${"\\u25A0"} ${"\\uC138\\uAE08\\uACC4\\uC0B0\\uC11C"} (${"\\uC804\\uC77C"})`,',
  '    `${"\\u00B7"} ${"\\uB9E4\\uCD9C"} ${report.taxSales.count}${"\\uAC74"} ${"\\u00B7"} ${formatKrw(report.taxSales.total)}`,',
  '    `${"\\u00B7"} ${"\\uB9E4\\uC785"} ${report.taxPurchase.count}${"\\uAC74"} ${"\\u00B7"} ${formatKrw(report.taxPurchase.total)}`,',
  '    "",',
  '    `${"\\u25A0"} ${"\\uD1B5\\uC7A5"} (${"\\uC804\\uC77C"})`,',
  '    `${"\\u00B7"} ${"\\uC785\\uAE08"} ${formatKrw(report.bank.deposits)}`,',
  '    `${"\\u00B7"} ${"\\uCD9C\\uAE08"} ${formatKrw(report.bank.withdrawals)}`,',
  '    `${"\\u00B7"} ${"\\uC794\\uC561"} ${formatKrw(report.bank.balance)}`,',
  '    "",',
  '    `${"\\u25A0"} ${"\\uB9E4\\uCD9C\\uC804\\uD45C"} (${"\\uC804\\uC77C"})`,',
  '    `${"\\u00B7"} ${"\\uAC74\\uC218"} ${report.sales.count}${"\\uAC74"}`,',
  '    `${"\\u00B7"} ${"\\uCCAD\\uAD6C\\uC561"} ${formatKrw(report.sales.bill)}`,',
  '    `${"\\u00B7"} ${"\\uB9C8\\uC9C4"} ${formatKrw(report.sales.margin)}`,',
  '    "",',
  "    erpBaseUrl,",
  "  ];",
  '  return lines.join("\\n");',
  "}",
].join("\n");

const formatCommentNotifyMessage = [
  'export function formatCommentNotifyMessage({ sale, comment, erpBaseUrl = "https://erp.teammillimeter.com" }) {',
  '  const client = String(sale?.client || "-").trim() || "-";',
  '  const site = String(sale?.site || "-").trim() || "-";',
  '  const author = String(comment?.authorName || "-").trim() || "-";',
  '  const body = String(comment?.body || "").trim();',
  "  return [",
  '    "[${"\\uD300\\uBC00\\uB9AC\\uBBF8\\uD130 ERP"}] ${"\\uC0C8 \\uB313\\uAE00"}",',
  '    `${client} ${"\\u00B7"} ${site}`,',
  "    `${author}: ${body}`,",
  "    erpBaseUrl,",
  '  ].join("\\n");',
  "}",
].join("\n");

s = s.replace(/export function formatDailyReportMessage[\s\S]*?return lines\.join\("\\n"\);\n\}/, formatDailyReportMessage);
s = s.replace(/export function formatCommentNotifyMessage[\s\S]*?\}\.join\("\\n"\);\n\}/, formatCommentNotifyMessage);

fs.writeFileSync(p, s, "utf8");
console.log("fixed", p);
