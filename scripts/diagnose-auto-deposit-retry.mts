/**
 * Read-only diagnosis for recent unmatched Barobill/auto-deposit candidates.
 *
 * - Does NOT mutate ERP state, vouchers, or PDF meta.
 * - Hides deposit amounts and account numbers.
 * - Defaults to 30-day lookback (AUTO_DEPOSIT_RETRY_LOOKBACK_DAYS).
 * - Optional --clients=에이온디자인,딜라잇홈,... narrows the report.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/diagnose-auto-deposit-retry.mts
 *   npx tsx --env-file=.env scripts/diagnose-auto-deposit-retry.mts --clients=에이온디자인,딜라잇홈,키친제니스,퍼니볼트,퍼랩스,밀리퍼니
 */
import { getDb, getErpState } from "../server/db.mjs";
import { listSentStatementArchiveMetas } from "../server/pdfArchive.mjs";
import {
  getAutoDepositMaxDateGapDays,
  getAutoDepositRetryLookbackDays,
} from "../server/bankSentStatementAutoLink.ts";
import {
  evaluateHighConfidenceSentStatementAutoLinks,
  selectRecentUnlinkedDepositIds,
} from "../src/utils/bankSentStatementMatch.ts";

const clientsArg = process.argv.find((arg) => arg.startsWith("--clients="));
const clientFilter = clientsArg
  ? clientsArg
      .slice("--clients=".length)
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  : [];

const lookbackArg = process.argv.find((arg) => arg.startsWith("--lookback-days="));
const lookbackDays = lookbackArg
  ? Number(lookbackArg.slice("--lookback-days=".length))
  : getAutoDepositRetryLookbackDays();

process.env.DATABASE_PATH = process.env.DATABASE_PATH || "data/erp.sqlite";
getDb();

const { data } = getErpState();
const bankTransactions = Array.isArray(data.bankTransactions) ? data.bankTransactions : [];
const archives = listSentStatementArchiveMetas();
const recentIds = selectRecentUnlinkedDepositIds(bankTransactions, { lookbackDays });

const evaluated = evaluateHighConfidenceSentStatementAutoLinks({
  bankTransactions,
  archives,
  clients: data.clients || [],
  sales: data.sales || [],
  paymentVouchers: data.paymentVouchers || [],
  onlyTransactionIds: new Set(recentIds),
  maxDateGapDays: getAutoDepositMaxDateGapDays(),
});

function matchesClientFilter(item: { client?: string }) {
  if (!clientFilter.length) return true;
  const client = String(item.client || "");
  return clientFilter.some((name) => client.includes(name));
}

const rows = evaluated.items
  .filter(matchesClientFilter)
  .map((item) => ({
    txId: item.txId,
    client: item.client || null,
    score: item.score ?? null,
    reason: item.reason,
    transactionDate: item.transactionDate || null,
    periodStart: item.periodStart || null,
    periodEnd: item.periodEnd || null,
    statementCreatedAt: item.statementCreatedAt || null,
    dateEligible: item.dateEligible ?? null,
    uniqueTopCandidate: item.uniqueTopCandidate ?? null,
  }));

console.log(
  JSON.stringify(
    {
      mode: "dry-run-readonly",
      lookbackDays,
      maxDateGapDays: getAutoDepositMaxDateGapDays(),
      clientFilter,
      recentUnlinkedCount: recentIds.length,
      diagnostics: evaluated.diagnostics,
      wouldLinkCount: evaluated.drafts.length,
      // Amounts and account numbers intentionally omitted.
      candidates: rows,
      note:
        "No ERP mutations performed. Historical full backfill is forbidden; review listed targets before any repair apply.",
    },
    null,
    2,
  ),
);
