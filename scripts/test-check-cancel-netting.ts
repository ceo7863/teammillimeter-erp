import {
  applyPreauthNetGroups,
  detectPreauthNetGroups,
  isCancellationOrCorrectionTransaction,
  isNetGroupSuppressed,
} from "../src/utils/bankPreauthNetting.ts";
import type { BankTransaction } from "../src/utils/bankTransactions.ts";

function tx(
  id: string,
  at: string,
  withdrawal: number,
  deposit: number,
  counterpartyName: string,
  extra: Partial<BankTransaction> = {},
): BankTransaction {
  return {
    id,
    transactionAt: at,
    withdrawal,
    deposit,
    balanceAfter: 0,
    description: extra.description ?? counterpartyName,
    counterpartyName,
    accountNumber: "123-456",
    bankName: "test",
    createdAt: at,
    ...extra,
  };
}

const onStation = "\uC628\uC2A4\uD14C\uC774\uC158";
const cancelDesc = "260513\uCCB4\uD06C\uCDE8\uC18C";
const rows = [
  tx("w1", "2026-05-13T16:44:00", 30000, 0, onStation),
  tx("d1", "2026-05-14T01:47:00", 0, 30000, cancelDesc, {
    description: cancelDesc,
    transactionType: "\uCCB4\uD06C\uCDE8\uC18C",
  }),
  tx("w2", "2026-05-14T01:47:00", 15583, 0, onStation),
];

if (!isCancellationOrCorrectionTransaction(rows[1])) {
  console.error("expected cancel row to match isCancellationOrCorrectionTransaction");
  process.exit(1);
}

const groups = detectPreauthNetGroups(rows);
if (groups.length !== 1) {
  console.error("expected 1 net group, got", groups.length);
  process.exit(1);
}

const group = groups[0];
if (
  group.preauthWithdrawalTx.id !== "w1" ||
  group.refundTx.id !== "d1" ||
  group.settlementTx?.id !== "w2" ||
  group.preauthAmount !== 30000 ||
  group.settlementAmount !== 15583
) {
  console.error("unexpected group shape", {
    preauth: group.preauthWithdrawalTx.id,
    refund: group.refundTx.id,
    settlement: group.settlementTx?.id,
    preauthAmount: group.preauthAmount,
    settlementAmount: group.settlementAmount,
  });
  process.exit(1);
}

const applied = applyPreauthNetGroups(rows, groups);
const suppressed = applied.filter((row) => isNetGroupSuppressed(row)).map((row) => row.id);
const settlement = applied.find((row) => row.netGroupRole === "settlement");

console.log("group:", {
  preauth: group.preauthWithdrawalTx.id,
  refund: group.refundTx.id,
  settlement: group.settlementTx?.id,
  preauthAmount: group.preauthAmount,
  settlementAmount: group.settlementAmount,
});
console.log("suppressed:", suppressed);
console.log("effective settlement:", settlement?.id, settlement?.withdrawal);

if (suppressed.join() !== "w1,d1" || settlement?.id !== "w2" || settlement?.withdrawal !== 15583) {
  console.error("unexpected netting result");
  process.exit(1);
}

console.log("ok");
