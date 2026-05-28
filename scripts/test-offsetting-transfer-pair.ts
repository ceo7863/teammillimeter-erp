import {
  applyPreauthNetGroups,
  detectPreauthNetGroups,
  isNetGroupSuppressed,
} from "../src/utils/bankPreauthNetting.ts";
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
    accountNumber: "969-046529-04-015",
    bankName: "IBK",
    createdAt: at,
  };
}

// Synthetic: ??? 1,488,630 cross-day W+D pair (mirrors live DB pattern)
const leeRows = [
  tx("w-early", "2026-05-12T17:22:42", 1488630, 0, "???"),
  tx("w-late", "2026-05-12T17:49:31", 1488630, 0, "???"),
  tx("d-refund", "2026-05-13T14:50:29", 0, 1488630, "???"),
];

const leeGroups = detectPreauthNetGroups(leeRows);
const leeApplied = applyPreauthNetGroups(leeRows, leeGroups);
const leeSuppressed = leeApplied.filter((row) => isNetGroupSuppressed(row)).map((row) => row.id);
const leeActive = leeApplied.filter((row) => !isNetGroupSuppressed(row) && !row.netGroupRole);

console.log("lee pair test:", {
  groups: leeGroups.length,
  suppressed: leeSuppressed,
  active: leeActive.map((row) => ({ id: row.id, w: row.withdrawal, d: row.deposit })),
});

if (leeGroups.length !== 1) {
  console.error("expected 1 offsetting group for ??? case");
  process.exit(1);
}
if (leeSuppressed.join(",") !== "w-late,d-refund") {
  console.error("expected w-late and d-refund suppressed, got", leeSuppressed);
  process.exit(1);
}
if (leeActive.length !== 1 || leeActive[0].id !== "w-early") {
  console.error("expected w-early to remain active");
  process.exit(1);
}

// Same-day simple W+D pair
const sameDayRows = [
  tx("w1", "2026-05-28T10:00:00", 500000, 0, "???"),
  tx("d1", "2026-05-28T10:30:00", 0, 500000, "???"),
];
const sameDayApplied = applyPreauthNetGroups(sameDayRows, detectPreauthNetGroups(sameDayRows));
if (sameDayApplied.filter((row) => isNetGroupSuppressed(row)).length !== 2) {
  console.error("expected both same-day W+D suppressed");
  process.exit(1);
}

console.log("ok");
