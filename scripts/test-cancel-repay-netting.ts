import { applyPreauthNetGroups, detectPreauthNetGroups, isNetGroupSuppressed } from "../src/utils/bankPreauthNetting.ts";
import type { BankTransaction } from "../src/utils/bankTransactions.ts";

function tx(
  id: string,
  at: string,
  withdrawal: number,
  deposit: number,
  counterpartyName: string,
): BankTransaction {
  return {
    id,
    transactionAt: at,
    withdrawal,
    deposit,
    balanceAfter: 0,
    description: counterpartyName,
    counterpartyName,
    accountNumber: "123-456",
    createdAt: at,
  };
}

const samdong = "???? ???";
const rows = [
  tx("w1", "2026-05-28T12:40:00", 105000, 0, samdong),
  tx("d1", "2026-05-28T12:42:00", 0, 105000, samdong),
  tx("w2", "2026-05-28T12:43:00", 105000, 0, samdong),
];

const groups = detectPreauthNetGroups(rows);
if (groups.length !== 1) {
  console.error("expected 1 net group, got", groups.length);
  process.exit(1);
}

const applied = applyPreauthNetGroups(rows, groups);
const suppressed = applied.filter((row) => isNetGroupSuppressed(row)).map((row) => row.id);
const settlement = applied.find((row) => row.netGroupRole === "settlement");

console.log("group:", {
  preauth: groups[0].preauthWithdrawalTx.id,
  refund: groups[0].refundTx.id,
  settlement: groups[0].settlementTx.id,
});
console.log("suppressed:", suppressed);
console.log("effective settlement:", settlement?.id, settlement?.withdrawal);

if (suppressed.join() !== "w1,d1" || settlement?.id !== "w2") {
  console.error("unexpected netting result");
  process.exit(1);
}

console.log("ok");
