/**
 * Replace wrong client name ?? -> ?? across ERP state (DB).
 */
import { getDb, getErpState, saveErpState } from "../server/db.mjs";

const URIM = "\uC6B0\uB9BC";
const UREUM = "\uC6B0\uB984";

function replaceClientName(value) {
  return typeof value === "string" && value.includes(UREUM) ? value.replaceAll(UREUM, URIM) : value;
}

function countUreum(state) {
  const counts = {
    paymentVouchers: state.paymentVouchers.filter((row) => row.client === UREUM).length,
    sales: state.sales.filter((row) => row.client === UREUM).length,
    bankLinkedSubject: state.bankTransactions.filter((row) => row.linkedSubject === UREUM).length,
    clients: state.clients.filter((row) => row.name === UREUM).length,
  };
  return counts;
}

getDb();
const { data: state, version } = getErpState();

console.log("Before:", countUreum(state));

state.paymentVouchers = state.paymentVouchers.map((row) =>
  row.client === UREUM ? { ...row, client: URIM } : row,
);

state.sales = state.sales.map((row) => (row.client === UREUM ? { ...row, client: URIM } : row));

state.clients = state.clients.map((row) => (row.name === UREUM ? { ...row, name: URIM } : row));

state.bankTransactions = state.bankTransactions.map((row) =>
  row.linkedSubject === UREUM ? { ...row, linkedSubject: URIM } : row,
);

state.paymentInputLogs = state.paymentInputLogs.map((row) => ({
  ...row,
  client: row.client === UREUM ? URIM : row.client,
  memo: replaceClientName(row.memo),
}));

if (Array.isArray(state.pdfArchives)) {
  state.pdfArchives = state.pdfArchives.map((row) => ({
    ...row,
    client: row.client === UREUM ? URIM : row.client,
    subject: replaceClientName(row.subject),
  }));
}

console.log("After:", countUreum(state));

saveErpState(state, version, "fix-urim-name-typo");
console.log("Saved.");
