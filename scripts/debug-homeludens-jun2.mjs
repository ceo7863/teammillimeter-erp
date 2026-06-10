#!/usr/bin/env node
import { getDb, getErpState } from "../server/db.mjs";

const HOMELUDENS = "\uD648\uB8E8\uB374\uC2A4";
const APT = "\uC544\uD30C\uD2B8\uBA58\uD130\uB9AC";
const TARGET_DATE = process.argv[2] || "2026-06-02";

getDb();
const { data } = getErpState();

const clients = (data.clients || []).filter((c) => {
  const hay = [c.name, c.depositNameAliases, c.memo].map((v) => String(v || "")).join(" ");
  return hay.includes(HOMELUDENS) || hay.includes(APT);
});

const txs = (data.bankTransactions || []).filter((t) => {
  const d = String(t.transactionAt || "").slice(0, 10);
  if (d !== TARGET_DATE) return false;
  const hay = JSON.stringify(t);
  return hay.includes(HOMELUDENS) || hay.includes(APT) || hay.includes("\uD648\uB8E8");
});

const rules = (data.bankLedgerRules || []).filter((r) => {
  const hay = JSON.stringify(r);
  return hay.includes(HOMELUDENS) || hay.includes(APT) || hay.includes("\uD648\uB8E8");
});

console.log(
  JSON.stringify(
    {
      targetDate: TARGET_DATE,
      clients: clients.map((c) => ({
        id: c.id,
        name: c.name,
        depositNameAliases: c.depositNameAliases,
        businessNo: c.businessNo,
      })),
      bankTxs: txs.map((t) => ({
        id: t.id,
        at: String(t.transactionAt).slice(0, 16),
        deposit: t.deposit,
        withdrawal: t.withdrawal,
        description: t.description,
        counterpartyName: t.counterpartyName,
        memo: t.memo,
        ledgerClientName: t.ledgerClientName,
        linkedSubject: t.linkedSubject,
        folderId: t.folderId,
        linkedTaxInvoiceId: t.linkedTaxInvoiceId,
        linkedPaymentVoucherId: t.linkedPaymentVoucherId,
        linkedPdfArchiveId: t.linkedPdfArchiveId,
        linkedCompanyExpenseId: t.linkedCompanyExpenseId,
        matchAutoLinked: t.matchAutoLinked,
      })),
      bankLedgerRules: rules.slice(0, 20),
      salesJun2: (data.sales || [])
        .filter((s) => String(s.date || "").slice(0, 10) === TARGET_DATE)
        .filter((s) => String(s.client || "").includes(HOMELUDENS) || String(s.client || "").includes(APT))
        .map((s) => ({ id: s.id, client: s.client, site: s.site, amount: s.amount })),
    },
    null,
    2,
  ),
);
