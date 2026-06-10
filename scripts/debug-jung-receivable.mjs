import { getDb, getErpState } from "../server/db.mjs";

getDb();
const { data } = getErpState();
const txId = "4e4098b8-4b56-4af6-8e50-c0be050bc975";

const sales = (data.sales || []).filter((s) => String(s.client || "").includes("\uD06C\uB808"));
console.log("cresse sales:", sales.map((s) => ({
  id: s.id,
  client: s.client,
  site: s.site,
  date: s.date,
  amount: s.amount,
  paid: s.paidAmount,
})));

const receivableLike = sales.map((s) => {
  const paid = Number(s.paidAmount || 0);
  const amt = Number(s.amount || 0);
  return { id: s.id, client: s.client, site: s.site, date: s.date, unpaid: amt - paid };
}).filter((r) => r.unpaid > 0);
console.log("unpaid cresse:", receivableLike);

const tx = (data.bankTransactions || []).find((t) => t.id === txId);
console.log("tx:", tx);
