import React, { useMemo, useState } from "react";
import { ChevronRight, FileText, Landmark, Plus, Trash2, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AutocompleteInput } from "@/components/AutocompleteInput";
import { KoreanDateInput } from "@/components/KoreanDateInput";
import { confirmDelete } from "@/utils/confirmDelete";
import { formatBankTransactionDateTime } from "@/utils/bankTransactions";
import type { BankTransaction } from "@/utils/bankTransactions";
import type { BankTransactionFolder } from "@/utils/bankTransactionFolders";
import { formatKRW, todayISO, type WorkerMasterLike } from "@/utils/workerPayments";
import { parseMoney, formatMoneyInput, sanitizeMoneyInput } from "@/utils/receivables";
import {
  WORKER_PAYOUT_METHOD_LABELS,
  buildWorkerPayoutFolders,
  makeWorkerPayoutVoucherId,
  summarizeWorkerPayoutFolders,
  type WorkerPayoutMethod,
  type WorkerPayoutVoucher,
} from "@/utils/workerPayoutLedger";

type WorkerPayoutHistoryTabProps = {
  workers?: WorkerMasterLike[];
  bankTransactions?: BankTransaction[];
  bankTransactionFolders?: BankTransactionFolder[];
  workerPayoutVouchers?: WorkerPayoutVoucher[];
  setWorkerPayoutVouchers?: React.Dispatch<React.SetStateAction<WorkerPayoutVoucher[]>>;
  dateFilter: { startDate: string; endDate: string };
  currentUser?: { name?: string; email?: string };
};

const METHOD_OPTIONS: Array<{ key: WorkerPayoutMethod; label: string }> = [
  { key: "cash", label: WORKER_PAYOUT_METHOD_LABELS.cash },
  { key: "corporate", label: WORKER_PAYOUT_METHOD_LABELS.corporate },
  { key: "personal", label: WORKER_PAYOUT_METHOD_LABELS.personal },
];

const emptyVoucherForm = {
  workerName: "",
  date: todayISO(),
  amount: "",
  method: "cash" as WorkerPayoutMethod,
  memo: "",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="erp-payment-hub-filter">
      <span className="erp-text-caption font-bold text-slate-500">{label}</span>
      {children}
    </label>
  );
}

export function WorkerPayoutHistoryTab({
  workers = [],
  bankTransactions = [],
  bankTransactionFolders = [],
  workerPayoutVouchers = [],
  setWorkerPayoutVouchers,
  dateFilter,
  currentUser,
}: WorkerPayoutHistoryTabProps) {
  const [selectedWorker, setSelectedWorker] = useState("");
  const [folderQuery, setFolderQuery] = useState("");
  const [voucherModalOpen, setVoucherModalOpen] = useState(false);
  const [voucherForm, setVoucherForm] = useState(emptyVoucherForm);
  const [voucherError, setVoucherError] = useState("");

  const workerOptions = useMemo(() => workers.map((row) => row.name).filter(Boolean), [workers]);

  const payoutFolders = useMemo(
    () =>
      buildWorkerPayoutFolders(bankTransactions, bankTransactionFolders, workers, workerPayoutVouchers, {
        startDate: dateFilter.startDate || undefined,
        endDate: dateFilter.endDate || undefined,
      }),
    [bankTransactions, bankTransactionFolders, workers, workerPayoutVouchers, dateFilter.endDate, dateFilter.startDate],
  );

  const payoutSummary = useMemo(() => summarizeWorkerPayoutFolders(payoutFolders), [payoutFolders]);
  const voucherTotal = useMemo(() => payoutFolders.reduce((sum, folder) => sum + folder.voucherTotal, 0), [payoutFolders]);
  const bankTotal = payoutSummary.total - voucherTotal;

  const filteredFolders = useMemo(() => {
    const query = folderQuery.trim().toLowerCase();
    if (!query) return payoutFolders;
    return payoutFolders.filter((folder) => folder.workerName.toLowerCase().includes(query));
  }, [folderQuery, payoutFolders]);

  const activeFolder = useMemo(() => {
    if (!filteredFolders.length) return null;
    if (selectedWorker) {
      return filteredFolders.find((folder) => folder.workerName === selectedWorker) || filteredFolders[0];
    }
    return filteredFolders[0];
  }, [filteredFolders, selectedWorker]);

  const openVoucherModal = (workerName = "") => {
    setVoucherForm({
      ...emptyVoucherForm,
      workerName: workerName || activeFolder?.workerName || "",
      date: todayISO(),
    });
    setVoucherError("");
    setVoucherModalOpen(true);
  };

  const closeVoucherModal = () => {
    setVoucherModalOpen(false);
    setVoucherError("");
  };

  const saveVoucher = () => {
    if (!setWorkerPayoutVouchers) return;
    const workerName = voucherForm.workerName.trim();
    const date = voucherForm.date.trim();
    const amount = parseMoney(voucherForm.amount);
    if (!workerName) {
      setVoucherError("\uC2DC\uACF5\uC790\uB97C \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.");
      return;
    }
    if (!date) {
      setVoucherError("\uC9C0\uAE09\uC77C\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694.");
      return;
    }
    if (amount <= 0) {
      setVoucherError("\uC9C0\uAE09\uC561\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694.");
      return;
    }

    const voucher: WorkerPayoutVoucher = {
      id: makeWorkerPayoutVoucherId(),
      workerName,
      date,
      amount,
      method: voucherForm.method,
      memo: voucherForm.memo.trim() || undefined,
      createdAt: new Date().toISOString(),
      createdBy: currentUser?.name || currentUser?.email || undefined,
    };

    setWorkerPayoutVouchers((prev) => [voucher, ...prev]);
    setSelectedWorker(workerName);
    closeVoucherModal();
  };

  const removeVoucher = (voucherId: string) => {
    if (!setWorkerPayoutVouchers) return;
    if (!confirmDelete("\uC774 \uC2DC\uACF5\uC790 \uC804\uD45C\uB97C \uC0AD\uC81C\uD560\uAE4C\uC694?")) return;
    setWorkerPayoutVouchers((prev) => prev.filter((row) => row.id !== voucherId));
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
          <Card className="rounded-2xl shadow-sm">
            <CardContent className="p-4">
              <div className="erp-text-caption font-bold text-slate-500">{"\uC9C0\uAE09 \uD569\uACC4"}</div>
              <div className="erp-text-title mt-1 font-black text-emerald-700">{formatKRW(payoutSummary.total)}</div>
              <div className="erp-text-caption mt-1 text-slate-500">{payoutSummary.workerCount}{"\uBA85 \uC2DC\uACF5\uC790"}</div>
            </CardContent>
          </Card>
          <Card className="rounded-2xl shadow-sm">
            <CardContent className="p-4">
              <div className="erp-text-caption font-bold text-slate-500">{"\uD1B5\uC7A5 \uCD9C\uAE08"}</div>
              <div className="erp-text-title mt-1 font-black">{formatKRW(bankTotal)}</div>
              <div className="erp-text-caption mt-1 text-slate-500">{payoutSummary.bankCount}{"\uAC74"}</div>
            </CardContent>
          </Card>
          <Card className="rounded-2xl shadow-sm">
            <CardContent className="p-4">
              <div className="erp-text-caption font-bold text-slate-500">{"\uC2DC\uACF5\uC790 \uC804\uD45C"}</div>
              <div className="erp-text-title mt-1 font-black text-amber-700">{formatKRW(voucherTotal)}</div>
              <div className="erp-text-caption mt-1 text-slate-500">{payoutSummary.voucherCount}{"\uAC74"}</div>
            </CardContent>
          </Card>
        </div>
        <Button className="rounded-2xl" onClick={() => openVoucherModal()} disabled={!setWorkerPayoutVouchers}>
          <Plus size={16} className="mr-2" />
          {"\uC2DC\uACF5\uC790 \uC804\uD45C \uCD94\uAC00"}
        </Button>
      </div>

      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-4 md:p-5">
          <div className="erp-statement-folder-split">
            <div className="erp-statement-folder-column">
              <div className="erp-statement-folder-column-head">
                <span className="erp-statement-folder-column-title">{"\uC2DC\uACF5\uC790 \uD3F4\uB354"}</span>
                <span className="erp-statement-folder-column-count">{filteredFolders.length}</span>
              </div>
              <div className="erp-statement-folder-toolbar">
                <input
                  lang="ko"
                  className="erp-statement-folder-search erp-input"
                  value={folderQuery}
                  onChange={(e) => setFolderQuery(e.target.value)}
                  placeholder={"\uC2DC\uACF5\uC790 \uAC80\uC0C9"}
                />
              </div>
              <div className="erp-statement-folder-column-body">
                {!filteredFolders.length ? (
                  <p className="erp-statement-folder-empty">
                    {"\uC120\uD0DD \uAE30\uAC04\uC5D0 \uD1B5\uC7A5 \uCD9C\uAE08\u00B7\uC2DC\uACF5\uC790 \uC804\uD45C\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4. \uD1B5\uC7A5 \uAC70\uB798\uB0B4\uC5ED\uC5D0\uC11C \uC2DC\uACF5\uC790 \uBD84\uB958 \uD6C4 \uD655\uC778\uD558\uAC70\uB098 \uC804\uD45C\uB97C \uCD94\uAC00\uD574 \uC8FC\uC138\uC694."}
                  </p>
                ) : (
                  <div className="erp-statement-folder-list">
                    {filteredFolders.map((folder) => {
                      const active = activeFolder?.workerName === folder.workerName;
                      return (
                        <button
                          key={folder.workerName}
                          type="button"
                          className={`erp-worker-payout-folder-btn ${active ? "is-active" : ""}`}
                          onClick={() => setSelectedWorker(folder.workerName)}
                        >
                          <span className="erp-worker-payout-folder-name">{folder.workerName}</span>
                          <span className="erp-worker-payout-folder-meta">
                            {folder.entries.length}{"\uAC74 \u00B7 "}{formatKRW(folder.total)}
                          </span>
                          <ChevronRight size={14} className="shrink-0 text-slate-400" />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="erp-statement-folder-column erp-worker-payout-detail-column">
              {!activeFolder ? (
                <p className="erp-statement-folder-empty">{"\uC2DC\uACF5\uC790 \uD3F4\uB354\uB97C \uC120\uD0DD\uD574 \uC8FC\uC138\uC694."}</p>
              ) : (
                <>
                  <div className="erp-statement-folder-column-head">
                    <div>
                      <span className="erp-statement-folder-column-title">{activeFolder.workerName}</span>
                      <p className="erp-text-caption mt-1 text-slate-500">
                        {"\uD1B5\uC7A5 "}{formatKRW(activeFolder.bankTotal)}{" \u00B7 \uC804\uD45C "}{formatKRW(activeFolder.voucherTotal)}{" \u00B7 \uD569\uACC4 "}{formatKRW(activeFolder.total)}
                      </p>
                    </div>
                    <Button variant="outline" size="sm" className="rounded-xl" onClick={() => openVoucherModal(activeFolder.workerName)}>
                      <Plus size={14} className="mr-1" />
                      {"\uC804\uD45C \uCD94\uAC00"}
                    </Button>
                  </div>
                  <div className="erp-table-wrap mt-3">
                    <table className="erp-table erp-table--lg">
                      <thead className="bg-slate-100 text-slate-600">
                        <tr>
                          <th className="text-left">{"\uC77C\uC790"}</th>
                          <th className="text-left">{"\uAD6C\uBD84"}</th>
                          <th className="text-left">{"\uC9C0\uAE09\uAD6C\uBD84"}</th>
                          <th className="text-right">{"\uAE08\uC561"}</th>
                          <th className="text-left">{"\uB0B4\uC6A9"}</th>
                          <th className="text-right">{"\uAD00\uB9AC"}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeFolder.entries.map((entry) => {
                          if (entry.kind === "bank") {
                            const tx = entry.bankTransaction;
                            const memo = [tx.counterpartyName, tx.description, tx.memo].filter(Boolean).join(" \u00B7 ");
                            return (
                              <tr key={`bank-${entry.id}`} className="border-t">
                                <td className="whitespace-nowrap text-slate-600">{formatBankTransactionDateTime(tx.transactionAt)}</td>
                                <td>
                                  <span className="erp-worker-payout-kind-badge is-bank">
                                    <Landmark size={12} />
                                    {"\uD1B5\uC7A5"}
                                  </span>
                                </td>
                                <td className="text-slate-500">-</td>
                                <td className="text-right font-bold text-red-600">{formatKRW(entry.amount)}</td>
                                <td className="text-left text-slate-600">{memo || "-"}</td>
                                <td />
                              </tr>
                            );
                          }

                          const voucher = entry.voucher;
                          return (
                            <tr key={`voucher-${entry.id}`} className="border-t bg-amber-50/40">
                              <td className="whitespace-nowrap">{voucher.date}</td>
                              <td>
                                <span className="erp-worker-payout-kind-badge is-voucher">
                                  <FileText size={12} />
                                  {"\uC804\uD45C"}
                                </span>
                              </td>
                              <td>{WORKER_PAYOUT_METHOD_LABELS[voucher.method]}</td>
                              <td className="text-right font-bold text-amber-800">{formatKRW(entry.amount)}</td>
                              <td className="text-left text-slate-600">{voucher.memo || "-"}</td>
                              <td className="text-right">
                                {setWorkerPayoutVouchers ? (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="rounded-lg text-red-600"
                                    onClick={() => removeVoucher(voucher.id)}
                                  >
                                    <Trash2 size={12} />
                                  </Button>
                                ) : null}
                              </td>
                            </tr>
                          );
                        })}
                        {activeFolder.entries.length === 0 && (
                          <tr>
                            <td colSpan={6} className="p-8 text-center text-slate-500">
                              {"\uC774 \uC2DC\uACF5\uC790\uC758 \uC9C0\uAE09 \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4."}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {voucherModalOpen ? (
        <div
          className="erp-ledger-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeVoucherModal();
          }}
        >
          <div
            className="erp-ledger-modal max-w-lg"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={"\uC2DC\uACF5\uC790 \uC804\uD45C \uCD94\uAC00"}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">
                  <FileText size={14} />
                  {"\uC2DC\uACF5\uC790 \uC804\uD45C \uCD94\uAC00"}
                </div>
                <p className="erp-text-caption text-slate-500">
                  {"\uB9E4\uCD9C\uC804\uD45C\uCC98\uB7FC \uC9C0\uAE09 \uC804\uD45C\uB97C \uB4F1\uB85D\uD558\uBA74 \uC120\uD0DD\uD55C \uC2DC\uACF5\uC790 \uD3F4\uB354\uC5D0 \uD568\uAED8 \uD45C\uC2DC\uB429\uB2C8\uB2E4."}
                </p>
              </div>
              <button type="button" className="rounded-xl p-2 text-slate-500 hover:bg-slate-100" onClick={closeVoucherModal} aria-label={"\uB2EB\uAE30"}>
                <X size={18} />
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label={"\uC2DC\uACF5\uC790"}>
                  <AutocompleteInput
                    value={voucherForm.workerName}
                    options={workerOptions}
                    onChange={(value) => setVoucherForm((prev) => ({ ...prev, workerName: value }))}
                    placeholder={"\uC2DC\uACF5\uC790 \uC120\uD0DD"}
                    limit={20}
                  />
                </Field>
              </div>
              <Field label={"\uC9C0\uAE09\uC77C"}>
                <KoreanDateInput value={voucherForm.date} onChange={(e) => setVoucherForm((prev) => ({ ...prev, date: e.target.value }))} />
              </Field>
              <Field label={"\uC9C0\uAE09\uC561"}>
                <input
                  lang="ko"
                  className="erp-input w-full rounded-xl"
                  inputMode="numeric"
                  value={formatMoneyInput(voucherForm.amount)}
                  onChange={(e) => setVoucherForm((prev) => ({ ...prev, amount: sanitizeMoneyInput(e.target.value) }))}
                  placeholder="0"
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label={"\uC9C0\uAE09\uAD6C\uBD84"}>
                  <div className="grid grid-cols-3 gap-2">
                    {METHOD_OPTIONS.map((option) => (
                      <button
                        key={option.key}
                        type="button"
                        className={`rounded-xl border px-3 py-2.5 text-sm font-bold transition ${
                          voucherForm.method === option.key
                            ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                        }`}
                        onClick={() => setVoucherForm((prev) => ({ ...prev, method: option.key }))}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label={"\uBE44\uACE0"}>
                  <textarea
                    lang="ko"
                    className="erp-input min-h-[88px] w-full rounded-xl"
                    value={voucherForm.memo}
                    onChange={(e) => setVoucherForm((prev) => ({ ...prev, memo: e.target.value }))}
                    placeholder={"\uBA54\uBAA8"}
                  />
                </Field>
              </div>
            </div>

            {voucherError ? <p className="mt-3 text-sm font-semibold text-red-600">{voucherError}</p> : null}

            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="outline" className="rounded-2xl" onClick={closeVoucherModal}>
                {"\uCDE8\uC18C"}
              </Button>
              <Button type="button" className="rounded-2xl" onClick={saveVoucher}>
                {"\uC804\uD45C \uC0DD\uC131"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
