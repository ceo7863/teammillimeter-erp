/**
 * Canonical sale detail drawer — single implementation for all entry points.
 * SaleVoucherEditModal re-exports this component for compatibility.
 */
import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Trash2 } from "lucide-react";
import { TeamChatShareButton } from "@/components/TeamChatShareButton";
import { buildSaleTeamChatLink } from "@/utils/teamChatLinks";
import { Button } from "@/components/ui/button";
import { SaleVoucherCommentsPanel } from "@/components/SaleVoucherCommentsPanel";
import { useAudit } from "@/context/AuditContext";
import { useSaveMessage } from "@/hooks/useSaveMessage";
import { SALE_AUDIT_FIELDS, snapshotSaleForAudit } from "@/utils/auditLog";
import { syncBankTransactionsForSaleClientChange } from "@/utils/bankTransactions";
import { listSaleComments, type SaleComment, type SaleReviewAction } from "@/utils/saleComments";
import {
  buildSaleFromForm,
  isSaleAmountSaveable,
  saleRowToForm,
  validateSaleFormMasterRefs,
  type SaleFormData,
} from "@/utils/saleForm";
import { COLLECTION_STATUS_VOCAB } from "@/utils/financeInformationArchitecture";
import { formatKRW } from "@/utils/workerPayments";

export const SALE_DETAIL_DRAWER_IDENTITY = "canonical-sale-detail-drawer";

type SaleRecord = Record<string, unknown> & {
  id: number | string;
  client?: string;
  site?: string;
  voucherNo?: string;
  date?: string;
  createdBy?: string;
  createdByEmail?: string;
  createdAt?: string;
  amount?: number;
  paid?: number;
  outstandingAmount?: number;
  appliedAmount?: number;
  arPaymentStatus?: string;
  cancelled?: boolean;
  memo?: string;
};

export type SaleFormEditorInjectedProps = {
  title: string;
  desc?: string;
  initialForm: SaleFormData;
  sessionKey: string;
  clients: Array<{ name?: string }>;
  workers: Array<{ name?: string }>;
  onSave: (draft: SaleFormData) => void;
  saveLabel?: string;
  saveMessage?: string;
  auditEntityId?: number | string;
  headerAction?: React.ReactNode;
  footerStartExtra?: React.ReactNode;
  allowClientSiteUnlock?: boolean;
};

export type SaleDetailDrawerProps = {
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
  ) => void | Promise<void | boolean | { ok?: boolean; conflict?: boolean }>;
  onPersistSaleDelete?: (saleId: number | string) => void | Promise<boolean | void>;
  screen?: string;
  SaleFormEditor: React.ComponentType<SaleFormEditorInjectedProps>;
  saleComments?: SaleComment[];
  onAddSaleComment?: (body: string) => void | Promise<void>;
  onReviewAction?: (action: SaleReviewAction, body?: string) => void | Promise<void>;
  /** When false (default), keep drawer open after successful save and refresh from latest sale prop. */
  closeOnSave?: boolean;
  mode?: "view" | "edit";
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

function resolveCollectionLabel(sale: SaleRecord): string {
  if (sale.cancelled || sale.arPaymentStatus === "cancelled") return COLLECTION_STATUS_VOCAB.cancelled;
  const status = String(sale.arPaymentStatus || "").toLowerCase();
  if (status === "paid" || status === "settled") return COLLECTION_STATUS_VOCAB.paid;
  if (status === "partial" || status === "partially_paid") return COLLECTION_STATUS_VOCAB.partial;
  if (status === "prepaid" || status === "overpaid") return COLLECTION_STATUS_VOCAB.prepaid;
  if (status === "needs_review") return COLLECTION_STATUS_VOCAB.needsReview;
  const billed = Number(sale.amount) || 0;
  const outstanding =
    sale.outstandingAmount != null ? Number(sale.outstandingAmount) : Math.max(billed - (Number(sale.paid) || 0), 0);
  if (billed <= 0) return COLLECTION_STATUS_VOCAB.unpaid;
  if (outstanding <= 0) return COLLECTION_STATUS_VOCAB.paid;
  if ((Number(sale.paid) || Number(sale.appliedAmount) || 0) > 0) return COLLECTION_STATUS_VOCAB.partial;
  return COLLECTION_STATUS_VOCAB.unpaid;
}

export const SaleDetailDrawer = memo(function SaleDetailDrawer({
  sale,
  onClose,
  setSales,
  clients,
  workers,
  currentUser,
  setPaymentVouchers,
  setBankTransactions,
  onPersistSaleUpdate,
  onPersistSaleDelete,
  screen = "매출전표",
  SaleFormEditor,
  saleComments = [],
  onAddSaleComment,
  onReviewAction,
  closeOnSave = false,
}: SaleDetailDrawerProps) {
  const { recordAudit } = useAudit();
  const [deleteConfirm, setDeleteConfirm] = useState<SaleRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [draftHold, setDraftHold] = useState<SaleFormData | null>(null);
  const { message: saveMessage, setMessage: setSaveMessage } = useSaveMessage();
  const sessionKey = `edit-${sale.id}-${draftHold ? "draft" : "live"}`;
  const initialForm = useMemo(
    () => draftHold || saleRowToForm(sale),
    [sale, draftHold, sessionKey],
  );
  const commentsForSale = useMemo(
    () => listSaleComments(saleComments, sale.id),
    [saleComments, sale.id],
  );

  useEffect(() => {
    // Fresh server sale clears draft hold after successful save.
    setDraftHold(null);
  }, [sale.id, sale.amount, sale.client, sale.site, sale.date, sale.appliedAmount, sale.outstandingAmount]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const collectionLabel = resolveCollectionLabel(sale);
  const billed = Number(sale.amount) || 0;
  const applied =
    sale.appliedAmount != null ? Number(sale.appliedAmount) : Number(sale.paid) || 0;
  const outstanding =
    sale.outstandingAmount != null
      ? Number(sale.outstandingAmount)
      : Math.max(billed - applied, 0);

  const saveVoucher = useCallback(
    async (form: SaleFormData) => {
      const masterRefError = validateSaleFormMasterRefs(form, clients, workers);
      if (masterRefError) {
        setSaveMessage(masterRefError);
        setDraftHold(form);
        return;
      }
      const payload = buildSaleFromForm(form, currentUser, workers, clients);
      if (!payload.client || !payload.site || !isSaleAmountSaveable(payload.amount)) {
        setDraftHold(form);
        return;
      }

      recordAudit({
        entityType: "sale",
        entityId: sale.id,
        entityLabel: `${payload.client} · ${payload.site}`,
        screen,
        action: "update",
        before: snapshotSaleForAudit(sale),
        after: snapshotSaleForAudit({ ...sale, ...payload }),
        fields: SALE_AUDIT_FIELDS,
        user: currentUser,
      });

      setSaving(true);
      setDraftHold(form);
      try {
        if (onPersistSaleUpdate) {
          const result = await onPersistSaleUpdate(sale.id, payload, sale);
          if (result === false || (result && typeof result === "object" && result.ok === false)) {
            setSaveMessage(
              result && typeof result === "object" && result.conflict
                ? "버전 충돌이 있습니다. 입력 내용을 유지한 채 다시 저장해 주세요."
                : "저장에 실패했습니다. 입력 내용을 유지합니다.",
            );
            return;
          }
          setSaveMessage("저장되었습니다. 최신 수금 상태를 반영합니다.");
          setDraftHold(null);
          if (closeOnSave) onClose();
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
          setDraftHold(null);
          setSaveMessage("저장되었습니다.");
          if (closeOnSave) onClose();
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "저장에 실패했습니다.";
        setSaveMessage(`${message} (입력 내용 유지)`);
      } finally {
        setSaving(false);
      }
    },
    [
      clients,
      closeOnSave,
      currentUser,
      onClose,
      onPersistSaleUpdate,
      recordAudit,
      sale,
      screen,
      setBankTransactions,
      setPaymentVouchers,
      setSales,
      setSaveMessage,
      workers,
    ],
  );

  const confirmDeleteVoucher = async () => {
    if (!deleteConfirm) return;
    const target = deleteConfirm;

    recordAudit({
      entityType: "sale",
      entityId: target.id,
      entityLabel: `${target.client} · ${target.site}`,
      screen,
      action: "delete",
      before: snapshotSaleForAudit(target),
      fields: SALE_AUDIT_FIELDS,
      user: currentUser,
    });

    if (onPersistSaleDelete) {
      if ((await onPersistSaleDelete(target.id)) === false) return;
    } else {
      setSales((prev) => prev.filter((row) => String(row.id) !== String(target.id)));
    }
    setDeleteConfirm(null);
    onClose();
  };

  const modal = (
    <>
      <div
        className="erp-ledger-modal-backdrop erp-ledger-modal-backdrop--elevated"
        data-sale-detail-drawer="true"
        data-sale-detail-identity={SALE_DETAIL_DRAWER_IDENTITY}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <div
          className="erp-ledger-modal erp-ledger-modal--sale-edit"
          onClick={(event) => event.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="sale-detail-drawer-title"
          onWheel={(event) => event.stopPropagation()}
        >
          <div className="erp-sale-form-page erp-sale-form-page--compact">
            <div
              className="mb-3 grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs sm:grid-cols-4"
              data-sale-detail-ar-summary="true"
              aria-label="수금 상태 요약"
            >
              <div>
                <div className="font-semibold text-slate-500">전표번호</div>
                <div className="font-bold text-slate-900">{String(sale.voucherNo || sale.id)}</div>
              </div>
              <div>
                <div className="font-semibold text-slate-500">수금 상태</div>
                <div className="font-bold text-slate-900" data-sale-collection-status={collectionLabel}>
                  {collectionLabel}
                </div>
              </div>
              <div>
                <div className="font-semibold text-slate-500">누적 입금배정</div>
                <div className="font-bold text-emerald-700">{formatKRW(applied)}</div>
              </div>
              <div>
                <div className="font-semibold text-slate-500">남은 미수</div>
                <div className="font-bold text-red-600">{formatKRW(outstanding)}</div>
              </div>
            </div>
            <SaleFormEditor
              title="매출전표 상세"
              desc={`${sale.client || ""} · ${sale.site || ""}`}
              initialForm={initialForm}
              sessionKey={sessionKey}
              clients={clients}
              workers={workers}
              onSave={(draft) => {
                void saveVoucher(draft);
              }}
              saveLabel={saving ? "저장 중…" : "전표 저장"}
              saveMessage={saveMessage}
              auditEntityId={sale.id}
              headerAction={(
                <div className="flex items-center gap-1">
                  <TeamChatShareButton
                    payload={{
                      link: buildSaleTeamChatLink({
                        id: sale.id,
                        client: sale.client,
                        date: String(sale.date || ""),
                      }),
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-lg text-xs"
                    onClick={onClose}
                    aria-label="상세 닫기"
                  >
                    닫기
                  </Button>
                </div>
              )}
              footerStartExtra={(
                <>
                  <Button variant="outline" size="sm" className="h-8 rounded-lg text-xs" onClick={onClose}>
                    저장 안 하고 종료
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-lg border-red-200 text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
                    onClick={() => setDeleteConfirm(sale)}
                  >
                    <Trash2 size={13} />
                    전표 삭제
                  </Button>
                </>
              )}
              allowClientSiteUnlock
            />
            {onAddSaleComment || onReviewAction ? (
              <SaleVoucherCommentsPanel
                saleId={sale.id}
                sale={sale}
                comments={commentsForSale}
                onAddComment={onAddSaleComment}
                onReviewAction={onReviewAction}
                currentUser={currentUser}
              />
            ) : null}
          </div>
        </div>
      </div>
      {deleteConfirm ? (
        <div
          className="erp-ledger-modal-backdrop erp-ledger-modal-backdrop--elevated erp-ledger-modal-backdrop--top"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDeleteConfirm(null);
          }}
        >
          <div
            className="erp-ledger-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="sale-detail-delete-title"
          >
            <h2 id="sale-detail-delete-title" className="text-base font-bold text-slate-900 md:text-lg">
              전표 삭제
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              전표 {deleteConfirm.voucherNo || deleteConfirm.id} ({deleteConfirm.client} · {deleteConfirm.site})를
              삭제할까요?
            </p>
            <p className="mt-4 text-sm font-semibold text-slate-700">삭제 후에는 복구할 수 없습니다.</p>
            <div className="mt-5 flex gap-2">
              <Button type="button" variant="outline" className="flex-1 rounded-xl" onClick={() => setDeleteConfirm(null)}>
                아니요
              </Button>
              <Button
                type="button"
                className="flex-1 rounded-xl bg-red-600 hover:bg-red-700"
                onClick={() => void confirmDeleteVoucher()}
              >
                삭제
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );

  return typeof document !== "undefined" ? createPortal(modal, document.body) : modal;
});

/** Compatibility alias — all callers must resolve to the same identity. */
export const SaleVoucherEditModal = SaleDetailDrawer;
export default SaleDetailDrawer;
