import React, { memo, useCallback, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAudit } from "@/context/AuditContext";
import { useSaveMessage } from "@/hooks/useSaveMessage";
import { SALE_AUDIT_FIELDS, snapshotSaleForAudit } from "@/utils/auditLog";
import { syncBankTransactionsForSaleClientChange } from "@/utils/bankTransactions";
import {
  buildSaleFromForm,
  saleRowToForm,
  validateSaleFormMasterRefs,
  type SaleFormData,
} from "@/utils/saleForm";
import type { SaleFormEditorInjectedProps } from "@/components/SaleVoucherEditModal";

type SaleRecord = Record<string, unknown> & {
  id: number | string;
  client?: string;
  site?: string;
  voucherNo?: string;
  createdBy?: string;
  createdByEmail?: string;
  createdAt?: string;
};

type SalesVoucherSearchEditorProps = {
  sale: SaleRecord;
  onClose: () => void;
  setSales: React.Dispatch<React.SetStateAction<SaleRecord[]>>;
  clients: Array<{ name?: string }>;
  workers: Array<{ name?: string }>;
  currentUser?: { name?: string; email?: string } | null;
  setPaymentVouchers?: React.Dispatch<React.SetStateAction<unknown[]>>;
  setBankTransactions?: React.Dispatch<React.SetStateAction<unknown[]>>;
  onPersistSaleUpdate?: (
    saleId: number | string,
    payload: Record<string, unknown>,
    previousSale: SaleRecord,
  ) => void | Promise<void>;
  SaleFormEditor: React.ComponentType<SaleFormEditorInjectedProps>;
};

function syncLinkedPaymentVouchersForSale(
  vouchers: unknown[],
  saleId: number | string,
  next: { client: string; site: string },
) {
  if (!Array.isArray(vouchers)) return vouchers;
  const saleKey = String(saleId);
  let changed = false;
  const mapped = vouchers.map((voucher) => {
    const row = voucher as { salesId?: number | string; client?: string; site?: string };
    if (String(row.salesId ?? "") !== saleKey) return voucher;
    changed = true;
    return { ...row, client: next.client, site: next.site };
  });
  return changed ? mapped : vouchers;
}

export const SalesVoucherSearchEditor = memo(function SalesVoucherSearchEditor({
  sale,
  onClose,
  setSales,
  clients,
  workers,
  currentUser,
  setPaymentVouchers,
  setBankTransactions,
  onPersistSaleUpdate,
  SaleFormEditor,
}: SalesVoucherSearchEditorProps) {
  const { recordAudit } = useAudit();
  const [deleteConfirm, setDeleteConfirm] = useState<SaleRecord | null>(null);
  const { message: saveMessage, setMessage: setSaveMessage } = useSaveMessage();
  const sessionKey = `search-edit-${sale.id}`;
  const initialForm = useMemo(() => saleRowToForm(sale), [sale, sessionKey]);
  const filledWorkerHint = useMemo(
    () => initialForm.workers.filter((line) => String(line.worker || "").trim()).length,
    [initialForm.workers],
  );

  const saveVoucher = useCallback(
    (form: SaleFormData) => {
      const masterRefError = validateSaleFormMasterRefs(form, clients, workers);
      if (masterRefError) {
        setSaveMessage(masterRefError);
        return;
      }
      const payload = buildSaleFromForm(form, currentUser, workers, clients);
      if (!payload.client || !payload.site || payload.amount <= 0) return;

      recordAudit({
        entityType: "sale",
        entityId: sale.id,
        entityLabel: `${payload.client} \u00B7 ${payload.site}`,
        screen: "\uB9E4\uCD9C\uC804\uD45C\uAC80\uC0C9",
        action: "update",
        before: snapshotSaleForAudit(sale),
        after: snapshotSaleForAudit({ ...sale, ...payload }),
        fields: SALE_AUDIT_FIELDS,
        user: currentUser,
      });

      if (onPersistSaleUpdate) {
        void onPersistSaleUpdate(sale.id, payload, sale);
      } else {
        setSales((prev) =>
          prev.map((row) =>
            row.id === sale.id
              ? {
                  ...row,
                  ...payload,
                  createdBy: row.createdBy,
                  createdByEmail: row.createdByEmail,
                  createdAt: row.createdAt,
                }
              : row,
          ),
        );
        if (setPaymentVouchers && (payload.client !== sale.client || payload.site !== sale.site)) {
          setPaymentVouchers((prev) => {
            const nextVouchers = syncLinkedPaymentVouchersForSale(prev, sale.id, {
              client: payload.client,
              site: payload.site,
            });
            if (setBankTransactions && payload.client !== sale.client) {
              setBankTransactions((prevTx) => {
                const synced = syncBankTransactionsForSaleClientChange(
                  prevTx as Parameters<typeof syncBankTransactionsForSaleClientChange>[0],
                  sale.id,
                  { client: payload.client },
                  nextVouchers,
                );
                return synced.updated > 0 ? synced.transactions : prevTx;
              });
            }
            return nextVouchers;
          });
        }
      }
      setSaveMessage(`${payload.client} \u00B7 ${payload.site} \uC804\uD45C\uAC00 \uC800\uC7A5\uB418\uC5C8\uC2B5\uB2C8\uB2E4.`);
      onClose();
    },
    [
      clients,
      currentUser,
      onClose,
      onPersistSaleUpdate,
      recordAudit,
      sale,
      setBankTransactions,
      setPaymentVouchers,
      setSales,
      setSaveMessage,
      workers,
    ],
  );

  const confirmDeleteVoucher = () => {
    if (!deleteConfirm) return;
    const target = deleteConfirm;

    recordAudit({
      entityType: "sale",
      entityId: target.id,
      entityLabel: `${target.client} \u00B7 ${target.site}`,
      screen: "\uB9E4\uCD9C\uC804\uD45C\uAC80\uC0C9",
      action: "delete",
      before: snapshotSaleForAudit(target),
      fields: SALE_AUDIT_FIELDS,
      user: currentUser,
    });

    setSales((prev) => prev.filter((row) => String(row.id) !== String(target.id)));
    setDeleteConfirm(null);
    onClose();
    setSaveMessage(
      `\uC804\uD45C ${target.voucherNo || target.id} (${target.client} \u00B7 ${target.site})\uAC00 \uC0AD\uC81C\uB418\uC5C8\uC2B5\uB2C8\uB2E4.`,
    );
  };

  return (
    <>
      {deleteConfirm ? (
        <div className="erp-ledger-modal-backdrop" onClick={() => setDeleteConfirm(null)}>
          <div
            className="erp-ledger-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="sale-delete-title"
          >
            <h2 id="sale-delete-title" className="text-base font-bold text-slate-900 md:text-lg">
              {"\uC804\uD45C \uC0AD\uC81C"}
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              {"\uC804\uD45C "}
              {deleteConfirm.voucherNo || deleteConfirm.id}
              {" ("}
              {deleteConfirm.client}
              {" \u00B7 "}
              {deleteConfirm.site}
              {")\uB97C \uC0AD\uC81C\uD560\uAE4C\uC694?"}
            </p>
            <p className="mt-4 text-sm font-semibold text-slate-700">
              {"\uC0AD\uC81C \uD6C4\uC5D0\uB294 \uBCF5\uAD6C\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4."}
            </p>
            <div className="mt-5 flex gap-2">
              <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setDeleteConfirm(null)}>
                {"\uC544\uB2C8\uC624"}
              </Button>
              <Button className="flex-1 rounded-xl bg-red-600 hover:bg-red-700" onClick={confirmDeleteVoucher}>
                {"\uC0AD\uC81C"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      <SaleFormEditor
        title={"\uB9E4\uCD9C\uC804\uD45C \uC218\uC815"}
        desc={`${sale.client} \u00B7 ${sale.site} \u00B7 \uC2DC\uACF5\uC790 ${filledWorkerHint}/${initialForm.workers.length}\uBA85`}
        initialForm={initialForm}
        sessionKey={sessionKey}
        clients={clients}
        workers={workers}
        onSave={saveVoucher}
        saveLabel={"\uC804\uD45C \uC800\uC7A5"}
        saveMessage={saveMessage}
        auditEntityId={sale.id}
        headerAction={(
          <Button variant="outline" size="sm" className="h-8 rounded-lg text-xs" onClick={onClose}>
            {"\uB2EB\uAE30"}
          </Button>
        )}
        footerStartExtra={(
          <>
            <Button variant="outline" size="sm" className="h-8 rounded-lg text-xs" onClick={onClose}>
              {"\uC800\uC7A5 \uC548 \uD558\uACE0 \uC885\uB8CC"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded-lg border-red-200 text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
              onClick={() => setDeleteConfirm(sale)}
            >
              <Trash2 size={13} />
              {"\uC804\uD45C \uC0AD\uC81C"}
            </Button>
          </>
        )}
        allowClientSiteUnlock
      />
    </>
  );
});
