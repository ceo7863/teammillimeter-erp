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
  getMonthKey,
  todayISO,
  type FixedExpense,
  type FixedExpensePayment,
} from "@/utils/companyLedger";
import {
  buildFixedExpenseMonthPaymentReport,
  type FixedExpenseMonthPaymentRow,
} from "@/utils/fixedExpenseAutomation";

const L = {
  title: "\uACE0\uC815\uBE44 \uAD00\uB9AC",
  desc: "\uB9E4\uC6D4 \uB098\uAC00\uB294 \uACE0\uC815\uBE44 \uD56D\uBAA9\uACFC \uB0A9\uBD80 \uAE30\uB85D\uC744 \uAD00\uB9AC\uD569\uB2C8\uB2E4. \uD1B5\uC7A5 \uCD9C\uAE08\uACFC \uC5F0\uACB0\uD558\uBA74 \uAC00\uACC4\uBD80\uC5D0 \uBC18\uC601\uB429\uB2C8\uB2E4.",
  goBank: "\uD1B5\uC7A5\uC5D0\uC11C \uC5F0\uACB0\uD558\uAE30",
  addItem: "\uACE0\uC815\uBE44 \uD56D\uBAA9 \uCD94\uAC00",
  unsettledBanner: (count: number, amount: number) =>
    `\uBBF8\uB0A9\uBD80 \uACE0\uC815\uBE44 ${count}\uAC74 \u00B7 ${formatKRW(amount)}\uC6D0 \u2014 \uD1B5\uC7A5 \uD14C\uC774\uBE14\uC758 \uACE0\uC815\uBE44 \uD56D\uBAA9 \uC5F4\uC5D0\uC11C \uC5F0\uACB0\uD558\uC138\uC694.`,
  allSettled: "\uC774\uBC88 \uB2EC \uACE0\uC815\uBE44\uB294 \uBAA8\uB450 \uB0A9\uBD80\uB418\uC5C8\uC2B5\uB2C8\uB2E4.",
  itemsTitle: "\uACE0\uC815\uBE44 \uD56D\uBAA9",
  paymentsTitle: "\uC774\uBC88 \uB2EC \uB0A9\uBD80 \uAE30\uB85D",
  expectedFixed: "\uC608\uC0C1 \uACE0\uC815\uBE44",
  unpaidFixed: "\uBBF8\uB0A9\uBD80 \uACE0\uC815\uBE44",
  paidFixed: "\uB0A9\uBD80 \uACE0\uC815\uBE44",
  unpaidSection: (count: number, amount: number) =>
    `\uBBF8\uB0A9\uBD80 \uACE0\uC815\uBE44 ${count}\uAC74 \u00B7 ${formatKRW(amount)}`,
  paidSection: (count: number, amount: number) =>
    `\uB0A9\uBD80 \uACE0\uC815\uBE44 ${count}\uAC74 \u00B7 ${formatKRW(amount)}`,
  name: "\uD56D\uBAA9",
  amount: "\uAE08\uC561",
  cycle: "\uC8FC\uAE30",
  paymentDay: "\uCD9C\uAE08\uC77C",
  paymentDate: "\uB0A9\uBD80\uC608\uC815\uC77C",
  status: "\uC0C1\uD0DC",
  linked: "\uD1B5\uC7A5 \uC5F0\uACB0",
  unlinked: "\uBBF8\uC5F0\uACB0",
  paid: "\uB0A9\uBD80 \uC644\uB8CC",
  unpaid: "\uBBF8\uB0A9\uBD80",
  active: "\uD65C\uC131",
  inactive: "\uBE44\uD65C\uC131",
  edit: "\uC218\uC815",
  emptyItems: "\uACE0\uC815\uBE44 \uD56D\uBAA9\uC774 \uC5C6\uC2B5\uB2C8\uB2E4. \uD56D\uBAA9\uC744 \uCD94\uAC00\uD558\uC138\uC694.",
  emptyPayments: "\uC774\uBC88 \uB2EC \uC608\uC0C1 \uACE0\uC815\uBE44\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.",
  emptyUnpaid: "\uBBF8\uB0A9\uBD80 \uACE0\uC815\uBE44\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.",
  emptyPaid: "\uB0A9\uBD80 \uC644\uB8CC \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  autoMemo: "\uC790\uB3D9 \uB4F1\uB85D",
  caseSuffix: "\uAC74",
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

  const monthReport = useMemo(
    () =>
      buildFixedExpenseMonthPaymentReport({
        fixedExpenses,
        fixedExpensePayments,
        bankTransactions,
        monthKey,
      }),
    [bankTransactions, fixedExpensePayments, fixedExpenses, monthKey],
  );

  const unpaidRows = useMemo(
    () => monthReport.rows.filter((row) => row.status === "unpaid"),
    [monthReport.rows],
  );
  const paidRows = useMemo(
    () => monthReport.rows.filter((row) => row.status === "paid"),
    [monthReport.rows],
  );

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

          {monthReport.unpaidCount > 0 ? (
            <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
              {L.unsettledBanner(monthReport.unpaidCount, monthReport.unpaidTotal)}
            </div>
          ) : monthReport.expectedCount > 0 ? (
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

          {!monthReport.expectedCount ? (
            <p className="py-8 text-center text-sm text-slate-500">{L.emptyPayments}</p>
          ) : (
            <div className="space-y-6">
              <div className="grid gap-3 sm:grid-cols-3">
                <SummaryCard
                  label={L.expectedFixed}
                  value={formatKRW(monthReport.expectedTotal)}
                  hint={`${monthReport.expectedCount}${L.caseSuffix}`}
                  tone="default"
                />
                <SummaryCard
                  label={L.unpaidFixed}
                  value={formatKRW(monthReport.unpaidTotal)}
                  hint={`${monthReport.unpaidCount}${L.caseSuffix}`}
                  tone="warning"
                />
                <SummaryCard
                  label={L.paidFixed}
                  value={formatKRW(monthReport.paidTotal)}
                  hint={`${monthReport.paidCount}${L.caseSuffix}`}
                  tone="success"
                />
              </div>

              <PaymentSection
                title={L.unpaidSection(monthReport.unpaidCount, monthReport.unpaidTotal)}
                rows={unpaidRows}
                emptyLabel={L.emptyUnpaid}
              />

              <PaymentSection
                title={L.paidSection(monthReport.paidCount, monthReport.paidTotal)}
                rows={paidRows}
                emptyLabel={L.emptyPaid}
              />
            </div>
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

function SummaryCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone: "default" | "warning" | "success";
}) {
  const toneClass =
    tone === "warning"
      ? "border-amber-200 bg-amber-50"
      : tone === "success"
        ? "border-emerald-200 bg-emerald-50"
        : "border-slate-200 bg-white";
  const valueClass =
    tone === "warning" ? "text-amber-900" : tone === "success" ? "text-emerald-900" : "text-slate-950";

  return (
    <div className={`rounded-2xl border p-4 ${toneClass}`}>
      <div className="erp-text-caption text-slate-500">{label}</div>
      <div className={`erp-text-section-title mt-1 font-bold ${valueClass}`}>{value}</div>
      <div className="erp-text-caption mt-1 text-slate-500">{hint}</div>
    </div>
  );
}

function PaymentSection({
  title,
  rows,
  emptyLabel,
}: {
  title: string;
  rows: FixedExpenseMonthPaymentRow[];
  emptyLabel: string;
}) {
  return (
    <div>
      <h4 className="erp-text-body mb-2 font-bold text-slate-800">{title}</h4>
      {!rows.length ? (
        <p className="py-4 text-center text-sm text-slate-500">{emptyLabel}</p>
      ) : (
        <DesktopTableWrap>
          <table className="erp-table w-full">
            <thead>
              <tr>
                <th>{L.name}</th>
                <th>{L.paymentDay}</th>
                <th>{L.paymentDate}</th>
                <th className="text-right">{L.amount}</th>
                <th>{L.status}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.fixedExpenseId}:${row.status}`}>
                  <td className="font-semibold text-slate-900">{row.name}</td>
                  <td className="text-sm text-slate-600">{row.paymentDayLabel}</td>
                  <td className="text-sm text-slate-600">{row.paymentDate || "-"}</td>
                  <td className="text-right font-bold text-slate-900">
                    {formatKRW(row.expectedAmount)}
                  </td>
                  <td className="text-sm font-semibold">
                    <PaymentStatusCell row={row} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </DesktopTableWrap>
      )}
    </div>
  );
}

function PaymentStatusCell({ row }: { row: FixedExpenseMonthPaymentRow }) {
  if (row.status === "paid") {
    return (
      <span className="text-emerald-700">
        {L.paid}
        {row.bankLinked ? (
          <span className="ml-1 text-xs font-medium text-slate-500">({L.linked})</span>
        ) : null}
        {row.payment && String(row.payment.memo || "").includes(L.autoMemo) ? (
          <span className="ml-1 text-xs font-medium text-slate-400">({L.autoMemo})</span>
        ) : null}
      </span>
    );
  }

  return (
    <span className="text-amber-700">
      {L.unpaid}
      {row.payment ? (
        <span className="ml-1 text-xs font-medium text-slate-500">({L.unlinked})</span>
      ) : null}
    </span>
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
