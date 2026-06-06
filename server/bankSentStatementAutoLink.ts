import { listSentStatementArchiveMetas, updatePdfArchiveMeta } from "./pdfArchive.mjs";
import { buildHighConfidenceSentStatementAutoLinks } from "../src/utils/bankSentStatementMatch.ts";
import { createPaymentInputLogsFromVouchers } from "../src/utils/paymentInputLogs.ts";
import { resolveAutoLinkLinkedSubject } from "../src/utils/bankTransactions.ts";
import {
  DEFAULT_CLIENT_FOLDER_ID,
  DEFAULT_CARD_SALES_FOLDER_ID,
  isCardCompanyDeposit,
} from "../src/utils/bankTransactionFolders.ts";

function toIdSet(onlyTransactionIds?: string[] | Set<string>) {
  if (!onlyTransactionIds) return undefined;
  if (onlyTransactionIds instanceof Set) return onlyTransactionIds;
  return new Set(onlyTransactionIds);
}

/**
 * Mirror client IBK import auto-link: match high-confidence sent-statement deposits,
 * create vouchers/logs, update bank tx + pdf archive metadata.
 */
export async function applySentStatementAutoLinksToErpData(
  data: Record<string, unknown>,
  options: { onlyTransactionIds?: string[] | Set<string>; updatedBy?: string } = {},
) {
  const { onlyTransactionIds, updatedBy } = options;

  const archives = listSentStatementArchiveMetas();
  const autoLinks = buildHighConfidenceSentStatementAutoLinks({
    bankTransactions: Array.isArray(data.bankTransactions) ? data.bankTransactions : [],
    archives,
    clients: (data.clients as never[]) || [],
    sales: (data.sales as never[]) || [],
    paymentVouchers: (data.paymentVouchers as never[]) || [],
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

  const bankTransactions = ((data.bankTransactions as never[]) || []).map((row) => {
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
      paymentVouchers: [...autoVouchers, ...(((data.paymentVouchers as never[]) || []))],
      paymentInputLogs: [...autoLogs, ...(((data.paymentInputLogs as never[]) || []))],
    },
    autoLinkedCount: autoLinks.length,
  };
}
