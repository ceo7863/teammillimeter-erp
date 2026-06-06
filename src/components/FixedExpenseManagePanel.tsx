import React, { useCallback, useMemo, useRef } from "react";
import { ExternalLink, Pencil, Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DesktopTableWrap } from "@/components/MobileRecordCard";
import {
  CompanyLedgerFixedExpenseModalLayer,
  type CompanyLedgerFixedExpenseModalHandle,
} from "@/components/CompanyLedgerFixedExpenseModalLayer";
import type { ErpUser } from "@/utils/erpApi";
import type { BankLearnRule } from "@/utils/bankCompanyLedger";
import type { BankTransaction } from "@/utils/bankTransactions";
import {
  FIXED_CATEGORY_OPTIONS,
  fixedCycleLabel,
  fixedMonthlyAmount,
  formatFixedExpensePaymentDay,
  formatKRW,
  getFixedExpensePaymentsForMonth,
  getMonthKey,
  isFixedExpensePaymentBankLinked,
  isFixedExpensePaymentSettled,
  todayISO,
  type FixedExpense,
  type FixedExpensePayment,
} from "@/utils/companyLedger";

const L = {
  title: "\uACE0\uC815\uBE44 \uAD00\uB9AC",
  desc: "\uB9E4\uC6D4 \uB098\uAC00\uB294 \uACE0\uC815\uBE44 \uD56D\uBAA9\uACFC \uB0A9\uBD80 \uAE30\uB85D\uC744 \uAD00\uB9AC\uD569\uB2C8\uB2E4. \uD1B5\uC7A5 \uCD9C\uAE08\uACFC \uC5F0\uACB0\uD558\uBA74 \uAC00\uACC4\uBD80\uC5D0 \uBC18\uC601\uB429\uB2C8\uB2E4.",
  goBank: "\uD1B5\uC7A5\uC5D0\uC11C \uC5F0\uACB0\uD558\uAE30",
  addItem: "\uACE0\uC815\uBE44 \uD56D\uBAA9 \uCD94\uAC00",
  thisMonth: "\uC774\uBC88 \uB2EC",
  unsettledBanner: (count: number, amount: number) =>
    `\uBBF8\uC5F0\uACB0 \uACE0\uC815\uBE44 ${count}\uAC74 \u00B7 ${formatKRW(amount)}\uC6D0 \u2014 \uD1B5\uC7A5 \uD14C\uC774\uBE14\uC758 \uACE0\uC815\uBE44 \uD56D\uBAA9 \uC5F4\uC5D0\uC11C \uC5F0\uACB0\uD558\uC138\uC694.`,
  allSettled: "\uC774\uBC88 \uB2EC \uACE0\uC815\uBE44\uB294 \uBAA8\uB450 \uC5F0\uACB0\uB418\uC5C8\uC2B5\uB2C8\uB2E4.",
  itemsTitle: "\uACE0\uC815\uBE44 \uD56D\uBAA9",
  paymentsTitle: "\uC774\uBC88 \uB2EC \uB0A9\uBD80 \uAE30\uB85D",
  name: "\uD56D\uBAA9",
  amount: "\uAE08\uC561",
  cycle: "\uC8FC\uAE30",
  paymentDay: "\uCD9C\uAE08\uC77C",
  status: "\uC0C1\uD0DC",
  linked: "\uC5F0\uACB0",
  unlinked: "\uBBF8\uC5F0\uACB0",
  active: "\uD65C\uC131",
  inactive: "\uBE44\uD65C\uC131",
  edit: "\uC218\uC815",
  emptyItems: "\uACE0\uC815\uBE44 \uD56D\uBAA9\uC774 \uC5C6\uC2B5\uB2C8\uB2E4. \uD56D\uBAA9\uC744 \uCD94\uAC00\uD558\uC138\uC694.",
  emptyPayments: "\uC774\uBC88 \uB2EC \uB0A9\uBD80 \uAE30\uB85D\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  autoMemo: "\uC790\uB3D9 \uB4F1\uB85D",
};

type FixedExpenseManagePanelProps = {
  embedded?: boolean;
  fixedExpenses: FixedExpense[];
  setFixedExpenses: React.Dispatch<React.SetStateAction<FixedExpense[]>>;
  fixedExpensePayments: FixedExpensePayment[];
  setFixedExpensePayments: React.Dispatch<React.SetStateAction<FixedExpensePayment[]>>;
  fixedExpenseCategories: string[];
  setFixedExpenseCategories: React.Dispatch<React.SetStateAction<string[]>>;
  bankTransactions: BankTransaction[];
  setBankTransactions: React.Dispatch<React.SetStateAction<BankTransaction[]>>;
  setBankLedgerRules?: React.Dispatch<React.SetStateAction<BankLearnRule[]>>;
  currentUser?: ErpUser | null;
  onRequestImmediateSave?: (patch?: {
    fixedExpenses?: FixedExpense[];
    fixedExpensePayments?: FixedExpensePayment[];
    fixedExpenseCategories?: string[];
    bankTransactions?: BankTransaction[];
  }) => void | Promise<void>;
  onOpenBankTab?: () => void;
};

export function FixedExpenseManagePanel({
  embedded = false,
  fixedExpenses,
  setFixedExpenses,
  fixedExpensePayments,
  setFixedExpensePayments,
  fixedExpenseCategories,
  setFixedExpenseCategories,
  bankTransactions,
  setBankTransactions,
  setBankLedgerRules,
  currentUser,
  onRequestImmediateSave,
  onOpenBankTab,
}: FixedExpenseManagePanelProps) {
  const modalRef = useRef<CompanyLedgerFixedExpenseModalHandle>(null);
  const monthKey = getMonthKey(todayISO());

  const sortedItems = useMemo(
    () =>
      [...fixedExpenses].sort((a, b) =>
        String(a.name || "").localeCompare(String(b.name || ""), "ko"),
      ),
    [fixedExpenses],
  );

  const monthPayments = useMemo(
    () => getFixedExpensePaymentsForMonth(fixedExpensePayments, monthKey),
    [fixedExpensePayments, monthKey],
  );

  const unsettledSummary = useMemo(() => {
    let count = 0;
    let amount = 0;
    for (const payment of monthPayments) {
      if (
        isFixedExpensePaymentSettled(
          payment,
          fixedExpensePayments,
          bankTransactions,
          fixedExpenses,
        )
      ) {
        continue;
      }
      count += 1;
      amount += Number(payment.amount) || 0;
    }
    return { count, amount };
  }, [bankTransactions, fixedExpensePayments, fixedExpenses, monthPayments]);

  const openCreate = useCallback(() => {
    modalRef.current?.openCreateFixedExpense(
      FIXED_CATEGORY_OPTIONS[0] || fixedExpenseCategories[0] || "",
    );
  }, [fixedExpenseCategories]);

  const noopBankLinkView = useCallback(() => {}, []);

  return (
    <div className="erp-fixed-expense-manage space-y-4">
      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-4 md:p-5">
          {!embedded ? (
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="erp-text-page-title text-slate-900">{L.title}</h2>
                <p className="mt-1 erp-text-body text-slate-600">{L.desc}</p>
              </div>
              <ActionButtons onOpenBankTab={onOpenBankTab} onCreate={openCreate} />
            </div>
          ) : (
            <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
              <ActionButtons onOpenBankTab={onOpenBankTab} onCreate={openCreate} />
            </div>
          )}

          {unsettledSummary.count > 0 ? (
            <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
              {L.unsettledBanner(unsettledSummary.count, unsettledSummary.amount)}
            </div>
          ) : monthPayments.length ? (
            <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">
              {L.allSettled}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-4">
          <h3 className="erp-text-section mb-3 font-bold text-slate-900">{L.itemsTitle}</h3>
          {!sortedItems.length ? (
            <p className="py-8 text-center text-sm text-slate-500">{L.emptyItems}</p>
          ) : (
            <DesktopTableWrap>
              <table className="erp-table w-full">
                <thead>
                  <tr>
                    <th>{L.name}</th>
                    <th className="text-right">{L.amount}</th>
                    <th>{L.cycle}</th>
                    <th>{L.paymentDay}</th>
                    <th>{L.status}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {sortedItems.map((row) => (
                    <tr key={row.id} className={row.isActive ? "" : "opacity-50"}>
                      <td className="font-semibold text-slate-900">{row.name}</td>
                      <td className="text-right font-bold text-slate-900">
                        {formatKRW(fixedMonthlyAmount(row))}
                      </td>
                      <td className="text-sm text-slate-600">{fixedCycleLabel(row.cycle)}</td>
                      <td className="text-sm text-slate-600">
                        {formatFixedExpensePaymentDay(row.paymentDayOfMonth)}
                      </td>
                      <td className="text-sm font-semibold text-slate-600">
                        {row.isActive ? L.active : L.inactive}
                      </td>
                      <td className="text-right">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="rounded-lg"
                          onClick={() => modalRef.current?.openEditFixedExpense(row)}
                        >
                          <Pencil className="mr-1 h-3.5 w-3.5" />
                          {L.edit}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DesktopTableWrap>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-4">
          <h3 className="erp-text-section mb-3 font-bold text-slate-900">
            {L.paymentsTitle} ({monthKey.slice(0, 4)}.{monthKey.slice(5)})
          </h3>
          {!monthPayments.length ? (
            <p className="py-8 text-center text-sm text-slate-500">{L.emptyPayments}</p>
          ) : (
            <DesktopTableWrap>
              <table className="erp-table w-full">
                <thead>
                  <tr>
                    <th>{L.name}</th>
                    <th>{L.paymentDay}</th>
                    <th className="text-right">{L.amount}</th>
                    <th>{L.status}</th>
                  </tr>
                </thead>
                <tbody>
                  {monthPayments.map((payment) => {
                    const item = fixedExpenses.find((row) => row.id === payment.fixedExpenseId);
                    const settled = isFixedExpensePaymentSettled(
                      payment,
                      fixedExpensePayments,
                      bankTransactions,
                      fixedExpenses,
                    );
                    const linked = isFixedExpensePaymentBankLinked(payment, bankTransactions);
                    return (
                      <tr key={payment.id}>
                        <td className="font-semibold text-slate-900">{item?.name || "-"}</td>
                        <td className="text-sm text-slate-600">{payment.date}</td>
                        <td className="text-right font-bold text-slate-900">
                          {formatKRW(payment.amount)}
                        </td>
                        <td
                          className={`text-sm font-semibold ${settled ? "text-emerald-700" : "text-amber-700"}`}
                        >
                          {linked ? L.linked : settled ? L.linked : L.unlinked}
                          {String(payment.memo || "").includes(L.autoMemo) ? (
                            <span className="ml-1 text-xs font-medium text-slate-400">({L.autoMemo})</span>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </DesktopTableWrap>
          )}
        </CardContent>
      </Card>

      <CompanyLedgerFixedExpenseModalLayer
        ref={modalRef}
        fixedExpenses={fixedExpenses}
        setFixedExpenses={setFixedExpenses}
        fixedExpenseCategories={fixedExpenseCategories}
        setFixedExpenseCategories={setFixedExpenseCategories}
        fixedExpensePayments={fixedExpensePayments}
        setFixedExpensePayments={setFixedExpensePayments}
        bankTransactions={bankTransactions}
        setBankTransactions={setBankTransactions}
        setBankLedgerRules={setBankLedgerRules}
        currentUser={currentUser}
        onOpenBankLinkView={noopBankLinkView}
        onRequestImmediateSave={onRequestImmediateSave}
      />
    </div>
  );
}

function ActionButtons({
  onOpenBankTab,
  onCreate,
}: {
  onOpenBankTab?: () => void;
  onCreate: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {onOpenBankTab ? (
        <Button type="button" variant="outline" className="rounded-xl" onClick={onOpenBankTab}>
          <ExternalLink className="mr-2 h-4 w-4" />
          {L.goBank}
        </Button>
      ) : null}
      <Button type="button" className="rounded-xl" onClick={onCreate}>
        <Plus className="mr-2 h-4 w-4" />
        {L.addItem}
      </Button>
    </div>
  );
}
