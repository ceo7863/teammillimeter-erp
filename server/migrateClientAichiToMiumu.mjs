export const CLIENT_RENAME_FROM = "\uC5D0\uC774\uCE58"; // ???
export const CLIENT_RENAME_TO = "\uBBF8\uBB34"; // ??

function replaceExact(value) {
  return value === CLIENT_RENAME_FROM ? CLIENT_RENAME_TO : value;
}

function replaceInString(value) {
  return typeof value === "string" && value.includes(CLIENT_RENAME_FROM)
    ? value.replaceAll(CLIENT_RENAME_FROM, CLIENT_RENAME_TO)
    : value;
}

function clientIdsEqual(a, b) {
  if (a == null || b == null) return false;
  return String(a) === String(b);
}

export function appendClientDepositAlias(aliases, alias) {
  const parts = String(aliases || "")
    .split(/[,?]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.includes(alias)) return parts.join(", ");
  parts.push(alias);
  return parts.join(", ");
}

export function countClientRenameMatches(state) {
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
    clientContracts: 0,
    clientSiteRequests: 0,
    scSchedules: 0,
    auditLogs: 0,
  };

  for (const row of state.clients || []) {
    if (row.name === CLIENT_RENAME_FROM) counts.clientsFrom += 1;
    if (row.name === CLIENT_RENAME_TO) counts.clientsTo += 1;
  }
  for (const row of state.sales || []) {
    if (row.client === CLIENT_RENAME_FROM) counts.sales += 1;
  }
  for (const row of state.paymentVouchers || []) {
    if (row.client === CLIENT_RENAME_FROM) counts.paymentVouchers += 1;
  }
  for (const row of state.paymentInputLogs || []) {
    if (row.client === CLIENT_RENAME_FROM) counts.paymentInputLogs += 1;
  }
  for (const row of state.taxInvoices || []) {
    if (row.client === CLIENT_RENAME_FROM) counts.taxInvoices += 1;
  }
  for (const row of state.bankTransactions || []) {
    if (row.linkedSubject === CLIENT_RENAME_FROM) counts.bankLinkedSubject += 1;
  }
  for (const row of state.bankTransactionFolders || []) {
    if (row.folderName === CLIENT_RENAME_FROM) counts.bankFolders += 1;
  }
  for (const row of state.statementGenerationLogs || []) {
    if (row.subjectName === CLIENT_RENAME_FROM) counts.statementLogs += 1;
  }
  for (const folder of state.statementFolders || []) {
    for (const item of folder.items || []) {
      if (item.subjectName === CLIENT_RENAME_FROM || item.client === CLIENT_RENAME_FROM) {
        counts.statementFolderItems += 1;
      }
    }
  }
  for (const row of state.clientContracts || []) {
    if (row.clientName === CLIENT_RENAME_FROM) counts.clientContracts += 1;
  }
  for (const row of state.clientSiteRequests || []) {
    if (row.clientName === CLIENT_RENAME_FROM) counts.clientSiteRequests += 1;
  }
  for (const row of state.scSchedules || []) {
    if (row.clientName === CLIENT_RENAME_FROM || row.projectName === CLIENT_RENAME_FROM) {
      counts.scSchedules += 1;
    }
  }
  for (const row of state.auditLogs || []) {
    if (
      row.before === CLIENT_RENAME_FROM ||
      row.after === CLIENT_RENAME_FROM ||
      (typeof row.entityLabel === "string" && row.entityLabel.includes(CLIENT_RENAME_FROM))
    ) {
      counts.auditLogs += 1;
    }
  }

  return counts;
}

export function migrateClientAichiToMiumu(state, options = {}) {
  const { updatePdfArchives = false, getDb = null } = options;
  const stats = { mergedClient: false, aliasAdded: false, ...countClientRenameMatches(state) };

  const fromClient = (state.clients || []).find((row) => row.name === CLIENT_RENAME_FROM);
  const toClient = (state.clients || []).find((row) => row.name === CLIENT_RENAME_TO);
  const fromClientId = fromClient?.id;
  const toClientId = toClient?.id;

  if (fromClient && toClient) {
    stats.mergedClient = true;
    const mergedAliases = appendClientDepositAlias(toClient.depositNameAliases, CLIENT_RENAME_FROM);
    if (mergedAliases !== (toClient.depositNameAliases || "")) stats.aliasAdded = true;
    state.clients = (state.clients || [])
      .filter((row) => row.name !== CLIENT_RENAME_FROM)
      .map((row) => (row.name === CLIENT_RENAME_TO ? { ...row, depositNameAliases: mergedAliases } : row));
  } else if (fromClient) {
    state.clients = (state.clients || []).map((row) => {
      if (row.name !== CLIENT_RENAME_FROM) return row;
      const aliases = appendClientDepositAlias(row.depositNameAliases, CLIENT_RENAME_FROM);
      if (aliases !== (row.depositNameAliases || "")) stats.aliasAdded = true;
      return { ...row, name: CLIENT_RENAME_TO, depositNameAliases: aliases };
    });
  } else if (toClient) {
    const aliases = appendClientDepositAlias(toClient.depositNameAliases, CLIENT_RENAME_FROM);
    if (aliases !== (toClient.depositNameAliases || "")) {
      stats.aliasAdded = true;
      state.clients = (state.clients || []).map((row) =>
        row.name === CLIENT_RENAME_TO ? { ...row, depositNameAliases: aliases } : row,
      );
    }
  }

  state.sales = (state.sales || []).map((row) =>
    row.client === CLIENT_RENAME_FROM ? { ...row, client: CLIENT_RENAME_TO } : row,
  );

  state.paymentVouchers = (state.paymentVouchers || []).map((row) =>
    row.client === CLIENT_RENAME_FROM ? { ...row, client: CLIENT_RENAME_TO } : row,
  );

  state.paymentInputLogs = (state.paymentInputLogs || []).map((row) => ({
    ...row,
    client: replaceExact(row.client),
    memo: replaceInString(row.memo),
  }));

  state.taxInvoices = (state.taxInvoices || []).map((row) =>
    row.client === CLIENT_RENAME_FROM ? { ...row, client: CLIENT_RENAME_TO } : row,
  );

  state.bankTransactions = (state.bankTransactions || []).map((row) =>
    row.linkedSubject === CLIENT_RENAME_FROM ? { ...row, linkedSubject: CLIENT_RENAME_TO } : row,
  );

  state.bankTransactionFolders = (state.bankTransactionFolders || []).map((row) =>
    row.folderName === CLIENT_RENAME_FROM ? { ...row, folderName: CLIENT_RENAME_TO } : row,
  );

  state.statementGenerationLogs = (state.statementGenerationLogs || []).map((row) =>
    row.subjectName === CLIENT_RENAME_FROM ? { ...row, subjectName: CLIENT_RENAME_TO } : row,
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

  state.clientContracts = (state.clientContracts || []).map((row) =>
    row.clientName === CLIENT_RENAME_FROM ? { ...row, clientName: CLIENT_RENAME_TO } : row,
  );

  state.clientSiteRequests = (state.clientSiteRequests || []).map((row) => {
    const matchesFrom =
      row.clientName === CLIENT_RENAME_FROM ||
      (fromClientId != null && clientIdsEqual(row.clientId, fromClientId));
    if (!matchesFrom) return row;
    return {
      ...row,
      clientName: CLIENT_RENAME_TO,
      clientId: toClientId != null ? toClientId : row.clientId,
    };
  });

  state.scSchedules = (state.scSchedules || []).map((row) => ({
    ...row,
    clientName: replaceExact(row.clientName),
    projectName: replaceExact(row.projectName),
  }));

  state.clients = (state.clients || []).map((row) => {
    if (row.name !== CLIENT_RENAME_TO) return row;
    const next = { ...row };
    if (next.scProjectName === CLIENT_RENAME_FROM) next.scProjectName = CLIENT_RENAME_TO;
    return next;
  });

  state.auditLogs = (state.auditLogs || []).map((entry) => {
    const next = { ...entry };
    if (typeof next.entityLabel === "string" && next.entityLabel.includes(CLIENT_RENAME_FROM)) {
      next.entityLabel = next.entityLabel.replaceAll(CLIENT_RENAME_FROM, CLIENT_RENAME_TO);
    }
    if (next.before === CLIENT_RENAME_FROM) next.before = CLIENT_RENAME_TO;
    if (next.after === CLIENT_RENAME_FROM) next.after = CLIENT_RENAME_TO;
    return next;
  });

  if (updatePdfArchives && typeof getDb === "function") {
    try {
      const db = getDb();
      const pdfRows = db
        .prepare("SELECT id, subject_name FROM pdf_archives WHERE subject_name LIKE ?")
        .all(`%${CLIENT_RENAME_FROM}%`);
      stats.pdfArchives = pdfRows.length;
      if (pdfRows.length) {
        const upd = db.prepare("UPDATE pdf_archives SET subject_name = ? WHERE id = ?");
        for (const row of pdfRows) {
          upd.run(String(row.subject_name).replaceAll(CLIENT_RENAME_FROM, CLIENT_RENAME_TO), row.id);
        }
      }
    } catch (error) {
      stats.pdfArchivesError = String(error?.message || error);
    }
  }

  stats.after = countClientRenameMatches(state);
  return stats;
}

export function needsClientAichiToMiumuMigration(state) {
  const counts = countClientRenameMatches(state);
  return counts.clientsFrom > 0 || Object.entries(counts).some(([key, value]) => key !== "clientsTo" && value > 0);
}
