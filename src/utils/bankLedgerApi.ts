import type { BankTransaction } from "./bankTransactions";
import { getAuthToken } from "./erpApi";
import {
  classifyBankTransactionForLedger,
  type BankLedgerClassification,
} from "./bankLedgerClassifier";
import type { FixedExpense } from "./companyLedger";

function apiBase() {
  return import.meta.env.VITE_API_BASE || "/api";
}

export async function fetchBankLedgerClassifications(
  transactions: BankTransaction[],
  context: {
    expenseCategories: string[];
    fixedExpenses: FixedExpense[];
  },
): Promise<Map<string, BankLedgerClassification>> {
  const fallback = new Map<string, BankLedgerClassification>();
  for (const tx of transactions) {
    const row = classifyBankTransactionForLedger(tx, {
      fixedExpenses: context.fixedExpenses,
      expenseCategories: context.expenseCategories,
    });
    if (row) fallback.set(tx.id, row);
  }

  if (!transactions.length) return fallback;

  try {
    const token = getAuthToken();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`${apiBase()}/bank/classify-ledger`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        transactions: transactions.map((tx) => ({
          id: tx.id,
          description: tx.description,
          counterpartyName: tx.counterpartyName,
          memo: tx.memo,
          withdrawal: tx.withdrawal,
        })),
        expenseCategories: context.expenseCategories,
        fixedExpenses: context.fixedExpenses
          .filter((row) => row.isActive)
          .map((row) => ({ id: row.id, name: row.name, category: row.category, amount: row.amount })),
      }),
    });

    if (!res.ok) return fallback;

    const data = (await res.json()) as {
      items?: Array<{
        transactionId: string;
        kind: "manual" | "fixed";
        category?: string;
        fixedExpenseId?: string;
        confidence?: number;
        source?: "llm" | "heuristic";
      }>;
    };

    const map = new Map<string, BankLedgerClassification>();
    for (const item of data.items || []) {
      if (!item.transactionId) continue;
      const fixedRow = context.fixedExpenses.find((row) => row.id === item.fixedExpenseId);
      const category = String(item.category || fixedRow?.category || "").trim();
      const confidence = Number(item.confidence) || 0;
      if (confidence < 1) continue;

      if (item.kind === "fixed" && item.fixedExpenseId) {
        map.set(item.transactionId, {
          targetKey: `fixed:${item.fixedExpenseId}`,
          kind: "fixed",
          fixedExpenseId: item.fixedExpenseId,
          category: fixedRow?.category,
          confidence,
          source: item.source === "llm" ? "llm" : "heuristic",
          label: fixedRow ? `[\uACE0\uC815\uBE44] ${fixedRow.name}` : "[\uACE0\uC815\uBE44]",
          reasons: item.source === "llm" ? ["LLM \uBD84\uB958"] : ["\uC11C\uBC84 \uCD94\uC815"],
        });
        continue;
      }

      if (category) {
        map.set(item.transactionId, {
          targetKey: `manual:${category}`,
          kind: "manual",
          category,
          confidence,
          source: item.source === "llm" ? "llm" : "heuristic",
          label: `[\uC9C0\uCD9C] ${category}`,
          reasons: item.source === "llm" ? ["LLM \uBD84\uB958"] : ["\uC11C\uBC84 \uCD94\uC815"],
        });
      }
    }

    if (!map.size) return fallback;
    return map;
  } catch {
    return fallback;
  }
}
