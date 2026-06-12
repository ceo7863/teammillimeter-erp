/**
 * ?? ???(sent_via_link) ? ?? ?? ??? ?? ?? ?? ?? ??.
 * Usage: node scripts/query-sent-unpaid.mjs [dbPath]
 */
import { DatabaseSync } from "node:sqlite";

const dbPath = process.argv[2] || "tmp-prod-erp.sqlite";
const LIMIT = 30;

function getUnpaid(sale) {
  const amount = Number(sale.amount ?? sale.salesAmount ?? 0);
  const paid = Number(sale.paidAmount ?? sale.paid ?? 0);
  return Math.max(amount - paid, 0);
}

function parseSalesIds(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(String(raw));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function formatKRW(n) {
  return new Intl.NumberFormat("ko-KR").format(Math.round(n));
}

function inPeriod(dateStr, start, end) {
  const d = String(dateStr || "").slice(0, 10);
  if (!d) return false;
  if (start && d < start) return false;
  if (end && d > end) return false;
  return true;
}

const db = new DatabaseSync(dbPath, { readOnly: true });

const stateRow = db.prepare("SELECT payload FROM erp_state WHERE id = 1").get();
if (!stateRow?.payload) {
  console.error("erp_state not found");
  process.exit(1);
}
const state = JSON.parse(stateRow.payload);
const sales = Array.isArray(state.sales) ? state.sales : [];
const salesById = new Map(sales.map((s) => [String(s.id), s]));

const sentArchives = db
  .prepare(
    `SELECT id, subject_name, period_start, period_end, created_at,
            statement_total_amount, payment_status, statement_sales_ids, category
     FROM pdf_archives
     WHERE sent_via_link = 1
       AND category = 'statement-client'
     ORDER BY created_at DESC`
  )
  .all();

const unpaidArchives = sentArchives.filter(
  (a) => a.payment_status !== "confirmed"
);

const seenSaleKeys = new Set();
const rows = [];

for (const archive of unpaidArchives) {
  const salesIds = parseSalesIds(archive.statement_sales_ids);
  const sentAt = String(archive.created_at || "").slice(0, 10);
  const client = String(archive.subject_name || "").trim();
  const period = `${archive.period_start || ""}~${archive.period_end || ""}`;
  const stmtStatus = archive.payment_status || "pending";
  const stmtTotal = Number(archive.statement_total_amount || 0);

  if (salesIds.length) {
    for (const sid of salesIds) {
      const sale = salesById.get(String(sid));
      if (!sale) continue;
      const unpaid = getUnpaid(sale);
      if (unpaid <= 0) continue;
      const key = String(sale.id);
      if (seenSaleKeys.has(key)) continue;
      seenSaleKeys.add(key);
      rows.push({
        client: String(sale.client || client).trim(),
        site: String(sale.site || "").trim(),
        date: String(sale.date || "").slice(0, 10),
        unpaid,
        amount: Number(sale.amount || 0),
        paid: Number(sale.paidAmount ?? sale.paid ?? 0),
        saleId: sale.id,
        sentAt,
        period,
        stmtStatus,
        stmtTotal,
        archiveId: archive.id,
      });
    }
    continue;
  }

  // salesIds ??? ???+???? ?? ?? ??
  const periodSales = sales.filter(
    (s) =>
      String(s.client || "").trim() === client &&
      inPeriod(s.date, archive.period_start, archive.period_end) &&
      getUnpaid(s) > 0
  );
  for (const sale of periodSales) {
    const key = String(sale.id);
    if (seenSaleKeys.has(key)) continue;
    seenSaleKeys.add(key);
    rows.push({
      client,
      site: String(sale.site || "").trim(),
      date: String(sale.date || "").slice(0, 10),
      unpaid: getUnpaid(sale),
      amount: Number(sale.amount || 0),
      paid: Number(sale.paidAmount ?? sale.paid ?? 0),
      saleId: sale.id,
      sentAt,
      period,
      stmtStatus,
      stmtTotal,
      archiveId: archive.id,
      matchedByPeriod: true,
    });
  }
}

rows.sort((a, b) => b.unpaid - a.unpaid);

const totalUnpaid = rows.reduce((s, r) => s + r.unpaid, 0);
const display = rows.slice(0, LIMIT);

console.log("=== ?? ??? · ?? ??? ?? ?? ===");
console.log(`DB: ${dbPath}`);
console.log(`?? ???(???): ${unpaidArchives.length}?`);
console.log(`?? ??: ${rows.length}? · ?? ${formatKRW(totalUnpaid)}?`);
console.log("");

for (const [i, r] of display.entries()) {
  const partial = r.stmtStatus === "partial" ? " [????]" : "";
  console.log(
    `${i + 1}. ${r.client} | ${r.site || "(????)"} | ${r.date} | ?? ${formatKRW(r.unpaid)}?${partial}`
  );
  console.log(
    `   ????? ${r.sentAt} · ?? ${r.period} · ??#${r.saleId} (?? ${formatKRW(r.amount)} / ?? ${formatKRW(r.paid)})`
  );
}

if (rows.length > LIMIT) {
  console.log(`\n... ? ${rows.length - LIMIT}? (?? ${LIMIT}?? ??)`);
}

// ???? ??
const byClient = new Map();
for (const r of rows) {
  const c = r.client || "(??)";
  const prev = byClient.get(c) || { count: 0, unpaid: 0 };
  byClient.set(c, { count: prev.count + 1, unpaid: prev.unpaid + r.unpaid });
}
const clientSummary = [...byClient.entries()]
  .map(([client, v]) => ({ client, ...v }))
  .sort((a, b) => b.unpaid - a.unpaid);

console.log("\n=== ???? ?? ===");
for (const c of clientSummary.slice(0, 15)) {
  console.log(`${c.client}: ${c.count}? · ${formatKRW(c.unpaid)}?`);
}

db.close();
