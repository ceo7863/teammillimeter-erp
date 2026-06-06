import { tsImport } from "tsx/esm/api";
import { listSentStatementArchiveMetas, updatePdfArchiveMeta } from "./pdfArchive.mjs";

let utilsPromise = null;

async function loadUtils() {
  if (!utilsPromise) {
    const parent = import.meta.url;
    const [bankSentStatementMatch, paymentInputLogs, bankTransactions, bankTransactionFolders] =
      await Promise.all([
        tsImport("../src/utils/bankSentStatementMatch.ts", parent),
        tsImport("../src/utils/paymentInputLogs.ts", parent),
        tsImport("../src/utils/bankTransactions.ts", parent),
        tsImport("../src/utils/bankTransactionFolders.ts", parent),
      ]);
    utilsPromise = { bankSentStatementMatch, paymentInputLogs, bankTransactions, bankTransactionFolders };
  }
  return utilsPromise;
}

function toIdSet(onlyTransactionIds) {
  if (!onlyTransactionIds) return undefined;
  if (onlyTransactionIds instanceof Set) return onlyTransactionIds;
  return new Set(onlyTransactionIds);
}

/**
 * Mirror client IBK import auto-link: match high-confidence sent-statement deposits,
 * create vouchers/logs, update bank tx + pdf archive metadata.
 */
export async function applySentStatementAutoLinksToErpData(data, options = {}) {
  const { onlyTransactionIds, updatedBy } = options;
  const {
    bankSentStatementMatch,
    paymentInputLogs,
    bankTransactions: bankTransactionsUtil,
    bankTransactionFolders,
  } = await loadUtils();

  const { buildHighConfidenceSentStatementAutoLinks } = bankSentStatementMatch;
  const { createPaymentInputLogsFromVouchers } = paymentInputLogs;
  const { resolveAutoLinkLinkedSubject } = bankTransactionsUtil;
  const { DEFAULT_CLIENT_FOLDER_ID, DEFAULT_CARD_SALES_FOLDER_ID, isCardCompanyDeposit } =
    bankTransactionFolders;

  const archives = listSentStatementArchiveMetas();
  const autoLinks = buildHighConfidenceSentStatementAutoLinks({
    bankTransactions: Array.isArray(data.bankTransactions) ? data.bankTransactions : [],
    archives,
    clients: data.clients || [],
    sales: data.sales || [],
    paymentVouchers: data.paymentVouchers || [],
    onlyTransactionIds: toIdSet(onlyTransactionIds),
  });

  if (!autoLinks.length) {
    return { data, autoLinkedCount: 0 };
  }

  const savedBy = String(updatedBy || "bank-sync-auto-link");
  const autoVouchers = autoLinks.flatMap((row) => row.vouchers);
  const autoLogs = createPaymentInputLogsFromVouchers(autoVouchers, savedBy);
  const linkByTxId = new Map(autoLinks.map((item) => [item.txId, item]));
  const confirmedAt = new Date().toISOString();

  const bankTransactions = (data.bankTransactions || []).map((row) => {
    const linked = linkByTxId.get(row.id);
    if (!linked) return row;
    return {
      ...row,
      linkedPaymentVoucherId: linked.primaryVoucherId,
      linkedPdfArchiveId: linked.pdfArchiveId,
      linkedSubject: resolveAutoLinkLinkedSubject(row, linked.client),
      linkedSalesId: linked.primarySalesId,
      matchConfirmedAt: confirmedAt,
      matchConfirmedBy: savedBy,
      matchAutoLinked: true,
      folderId:
        row.folderId ||
        (isCardCompanyDeposit(row) ? DEFAULT_CARD_SALES_FOLDER_ID : DEFAULT_CLIENT_FOLDER_ID),
    };
  });

  for (const linked of autoLinks) {
    updatePdfArchiveMeta(linked.pdfArchiveId, {
      paymentStatus: linked.paymentStatus,
      linkedBankTransactionId: linked.txId,
      linkedPaymentVoucherId: linked.primaryVoucherId,
    });
  }

  return {
    data: {
      ...data,
      bankTransactions,
      paymentVouchers: [...autoVouchers, ...(data.paymentVouchers || [])],
      paymentInputLogs: [...autoLogs, ...(data.paymentInputLogs || [])],
    },
    autoLinkedCount: autoLinks.length,
  };
}
