import { getErpState } from "../server/db.mjs";

function simulateBankSync(sinceVersion, localCount, localLatestAt) {
  const state = getErpState();
  const transactions = state.data.bankTransactions || [];
  const transactionCount = transactions.length;
  const changed = state.version > sinceVersion;
  const countChanged = localCount >= 0 && localCount !== transactionCount;
  const serverLatestAt = String(state.data.bankSyncMeta?.lastImportLatestAt || "").trim();
  const importChanged = Boolean(
    serverLatestAt && (!localLatestAt || serverLatestAt.localeCompare(localLatestAt) > 0),
  );
  const includeTransactions = changed || countChanged || importChanged;
  return {
    version: state.version,
    changed: changed || countChanged || importChanged,
    bankTransactionCount: transactionCount,
    includeTransactions,
    serverLatestAt,
    countChanged,
    importChanged,
    versionChanged: changed,
  };
}

console.log("in sync:", simulateBankSync(103, 820, "2026-06-06T21:54:13"));
console.log("behind count:", simulateBankSync(103, 815, "2026-06-06T21:54:13"));
console.log("behind latest:", simulateBankSync(103, 820, "2026-06-05T12:00:00"));
console.log("behind version:", simulateBankSync(100, 820, "2026-06-06T21:54:13"));
