/**
 * Rename client "???" -> "??" across entire ERP state (SQLite).
 * Merges duplicate client rows if both names exist; keeps ?? master + deposit alias for ???.
 *
 * Usage:
 *   node scripts/repair-rename-client-aichi-to-miumu.mjs           # apply
 *   node scripts/repair-rename-client-aichi-to-miumu.mjs --dry-run # preview only
 */
import { getDb, getErpState, saveErpState } from "../server/db.mjs";

const FROM = "\uC5D0\uC774\uCE58"; // ???
const TO = "\uBBF8\uBB34"; // ??

const dryRun = process.argv.includes("--dry-run");

function replaceExact(value) {
  return value === FROM ? TO : value;
}

function replaceInString(value) {
  return typeof value === "string" && value.includes(FROM) ? value.replaceAll(FROM, TO) : value;
}

function countMatches(state) {
  const counts = {
    clientsFrom: 0,
    clientsTo: 0,
    sales: 0,
    paymentVouchers: 0,
    paymentInputLogs: 0,
    taxInvoices: 0,
    bankLinkedSubject: 0,
    bankFolders: 0,
    statementLogs: 0,
    statementFolderItems: 0,
    auditLogs: 0,
  };

  for (const row of state.clients || []) {
    if (row.name === FROM) counts.clientsFrom += 1;
    if (row.name === TO) counts.clientsTo += 1;
  }
  for (const row of state.sales || []) {
    if (row.client === FROM) counts.sales += 1;
  }
  for (const row of state.paymentVouchers || []) {
    if (row.client === FROM) counts.paymentVouchers += 1;
  }
  for (const row of state.paymentInputLogs || []) {
    if (row.client === FROM) counts.paymentInputLogs += 1;
  }
  for (const row of state.taxInvoices || []) {
    if (row.client === FROM) counts.taxInvoices += 1;
  }
  for (const row of state.bankTransactions || []) {
    if (row.linkedSubject === FROM) counts.bankLinkedSubject += 1;
  }
  for (const row of state.bankTransactionFolders || []) {
    if (row.folderName === FROM) counts.bankFolders += 1;
  }
  for (const row of state.statementGenerationLogs || []) {
    if (row.subjectName === FROM) counts.statementLogs += 1;
  }
  for (const folder of state.statementFolders || []) {
    for (const item of folder.items || []) {
      if (item.subjectName === FROM || item.client === FROM) counts.statementFolderItems += 1;
    }
  }
  for (const row of state.auditLogs || []) {
    if (
      row.before === FROM ||
      row.after === FROM ||
      (typeof row.entityLabel === "string" && row.entityLabel.includes(FROM))
    ) {
      counts.auditLogs += 1;
    }
  }

  return counts;
}

function appendAlias(aliases, alias) {
  const parts = String(aliases || "")
    .split(/[,?]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.includes(alias)) return parts.join(", ");
  parts.push(alias);
  return parts.join(", ");
}

function applyRename(state) {
  const stats = { mergedClient: false, aliasAdded: false, ...countMatches(state) };

  const fromClient = (state.clients || []).find((row) => row.name === FROM);
  const toClient = (state.clients || []).find((row) => row.name === TO);

  if (fromClient && toClient) {
    stats.mergedClient = true;
    const mergedAliases = appendAlias(toClient.depositNameAliases, FROM);
    if (mergedAliases !== (toClient.depositNameAliases || "")) stats.aliasAdded = true;
    state.clients = (state.clients || [])
      .filter((row) => row.name !== FROM)
      .map((row) => (row.name === TO ? { ...row, depositNameAliases: mergedAliases } : row));
  } else if (fromClient) {
    state.clients = (state.clients || []).map((row) => {
      if (row.name !== FROM) return row;
      const aliases = appendAlias(row.depositNameAliases, FROM);
      if (aliases !== (row.depositNameAliases || "")) stats.aliasAdded = true;
      return { ...row, name: TO, depositNameAliases: aliases };
    });
  } else if (toClient) {
    const aliases = appendAlias(toClient.depositNameAliases, FROM);
    if (aliases !== (toClient.depositNameAliases || "")) {
      stats.aliasAdded = true;
      state.clients = (state.clients || []).map((row) =>
        row.name === TO ? { ...row, depositNameAliases: aliases } : row,
      );
    }
  }

  state.sales = (state.sales || []).map((row) =>
    row.client === FROM ? { ...row, client: TO } : row,
  );

  state.paymentVouchers = (state.paymentVouchers || []).map((row) =>
    row.client === FROM ? { ...row, client: TO } : row,
  );

  state.paymentInputLogs = (state.paymentInputLogs || []).map((row) => ({
    ...row,
    client: replaceExact(row.client),
    memo: replaceInString(row.memo),
  }));

  state.taxInvoices = (state.taxInvoices || []).map((row) =>
    row.client === FROM ? { ...row, client: TO } : row,
  );

  state.bankTransactions = (state.bankTransactions || []).map((row) =>
    row.linkedSubject === FROM ? { ...row, linkedSubject: TO } : row,
  );

  state.bankTransactionFolders = (state.bankTransactionFolders || []).map((row) =>
    row.folderName === FROM ? { ...row, folderName: TO } : row,
  );

  state.statementGenerationLogs = (state.statementGenerationLogs || []).map((row) =>
    row.subjectName === FROM ? { ...row, subjectName: TO } : row,
  );

  state.statementFolders = (state.statementFolders || []).map((folder) => ({
    ...folder,
    folderName: replaceInString(folder.folderName),
    items: (folder.items || []).map((item) => ({
      ...item,
      subjectName: replaceExact(item.subjectName),
      client: replaceExact(item.client),
    })),
  }));

  state.auditLogs = (state.auditLogs || []).map((entry) => {
    const next = { ...entry };
    if (typeof next.entityLabel === "string" && next.entityLabel.includes(FROM)) {
      next.entityLabel = next.entityLabel.replaceAll(FROM, TO);
    }
    if (next.before === FROM) next.before = TO;
    if (next.after === FROM) next.after = TO;
    return next;
  });

  try {
    const db = getDb();
    const pdfRows = db
      .prepare("SELECT id, subject_name FROM pdf_archives WHERE subject_name LIKE ?")
      .all(`%${FROM}%`);
    stats.pdfArchives = pdfRows.length;
    if (pdfRows.length) {
      const upd = db.prepare("UPDATE pdf_archives SET subject_name = ? WHERE id = ?");
      for (const row of pdfRows) {
        upd.run(String(row.subject_name).replaceAll(FROM, TO), row.id);
      }
    }
  } catch (error) {
    stats.pdfArchivesError = String(error?.message || error);
  }

  stats.after = countMatches(state);
  return stats;
}

getDb();
const { data: state, version } = getErpState();

const before = countMatches(state);
console.log(JSON.stringify({ dryRun, before, version }, null, 2));

if (dryRun) {
  const preview = applyRename(JSON.parse(JSON.stringify(state)));
  console.log("Preview after:", preview.after);
  console.log("Would merge duplicate clients:", preview.mergedClient);
  console.log("Would add deposit alias:", preview.aliasAdded);
  process.exit(0);
}

const stats = applyRename(state);
const saved = saveErpState(state, version, "repair-rename-client-aichi-to-miumu");

console.log(
  JSON.stringify(
    {
      savedVersion: saved.version,
      mergedClient: stats.mergedClient,
      aliasAdded: stats.aliasAdded,
      before,
      after: stats.after,
    },
    null,
    2,
  ),
);
