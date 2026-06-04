/**
 * Fix Homeludens typo: linkedSubject/vouchers used ???? (U+B4E0) instead of ???? (U+B374).
 * Usage: node scripts/repair-homeludens-client-spelling.mjs [databasePath]
 */
import { getDb, getErpState, saveErpState } from "../server/db.mjs";

const WRONG = "\uD648\uB8E8\uB4E0\uC2A4";
const RIGHT = "\uD648\uB8E8\uB374\uC2A4";
const DEPOSIT_TX_IDS = new Set([
  "917011fc-d1c7-407e-8edb-efcd85f2e433",
  "fa1a9a0f-b53b-418f-8472-68c5e1d25a10",
  "192ed4c4-7b13-48d5-bda1-17360aea421d",
]);

function replaceTypo(value) {
  if (typeof value !== "string" || !value.includes(WRONG)) return value;
  return value.split(WRONG).join(RIGHT);
}

getDb();
const { data: state, version } = getErpState();

let bankFixed = 0;
state.bankTransactions = (state.bankTransactions || []).map((row) => {
  const linked = replaceTypo(String(row.linkedSubject || ""));
  if (linked !== row.linkedSubject) {
    bankFixed += 1;
    return { ...row, linkedSubject: linked };
  }
  return row;
});

let voucherFixed = 0;
state.paymentVouchers = (state.paymentVouchers || []).map((row) => {
  const client = replaceTypo(String(row.client || ""));
  if (client !== row.client) {
    voucherFixed += 1;
    return { ...row, client };
  }
  return row;
});

let logFixed = 0;
state.paymentInputLogs = (state.paymentInputLogs || []).map((row) => {
  const client = replaceTypo(String(row.client || ""));
  if (client !== row.client) {
    logFixed += 1;
    return { ...row, client };
  }
  return row;
});

const saved = saveErpState(state, version, "repair-homeludens-client-spelling");
console.log(
  JSON.stringify(
    {
      savedVersion: saved.version,
      bankFixed,
      voucherFixed,
      logFixed,
      sample: DEPOSIT_TX_IDS.size
        ? (state.bankTransactions || [])
            .filter((t) => DEPOSIT_TX_IDS.has(t.id))
            .map((t) => ({
              id: t.id,
              linkedSubject: t.linkedSubject,
              counterpartyName: t.counterpartyName,
            }))
        : [],
    },
    null,
    2,
  ),
);
