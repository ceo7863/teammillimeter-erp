/**
 * Read-only 미수조정전표 detail drawer — not cash; never rolls into Receipt totals.
 */
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { formatKRW } from "@/utils/receivables";
import { fetchArAdjustmentByIdApi } from "@/utils/erpApi";

export type ArAdjustmentDetailRecord = {
  id?: string | number;
  adjustmentNo?: string;
  clientId?: string | number | null;
  clientName?: string | null;
  clientNameSnapshot?: string | null;
  effectiveDate?: string | null;
  adjustmentType?: string | null;
  direction?: string | null;
  amount?: number | null;
  signedAmount?: number | null;
  reasonCode?: string | null;
  reasonText?: string | null;
  memo?: string | null;
  targetMode?: string | null;
  statementId?: string | number | null;
  targetStatementId?: string | number | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  targetPeriodStart?: string | null;
  targetPeriodEnd?: string | null;
  saleIds?: Array<string | number> | null;
  targets?: Array<{ saleId?: string | number | null; amount?: number; memo?: string | null }> | null;
  beforeAr?: number | null;
  afterAr?: number | null;
  arBefore?: number | null;
  arAfter?: number | null;
  beforeArBalance?: number | null;
  afterArBalance?: number | null;
  createdBy?: string | null;
  postedBy?: string | null;
  approvedBy?: string | null;
  approver?: string | null;
  status?: string | null;
  reversalOfAdjustmentId?: string | number | null;
  reversedEffectiveDate?: string | null;
  reversedAt?: string | null;
  reversedBy?: string | null;
  createdAt?: string | null;
  auditHistory?: Array<Record<string, unknown>> | null;
  events?: Array<Record<string, unknown>> | null;
  [key: string]: unknown;
};

export type ArAdjustmentDetailDrawerProps = {
  open: boolean;
  onClose: () => void;
  adjustment?: ArAdjustmentDetailRecord | null;
  adjustmentId?: string | number | null;
  onOpenClientLedger?: (clientId: string | number, clientName?: string) => void;
  onOpenSale?: (saleId: string | number) => void;
};

const TYPE_LABEL: Record<string, string> = {
  CREDIT_AR_ADJUSTMENT: "미수 감소",
  DEBIT_AR_ADJUSTMENT: "미수 증가",
  OPENING_AR_BALANCE: "기초 미수",
  HISTORICAL_COLLECTION_RECONCILIATION: "과거 수금 정리",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "임시",
  posted: "전기",
  reversed: "취소됨",
};

function money(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function asText(value: unknown) {
  if (value == null) return "";
  const text = String(value).trim();
  return text;
}

function resolveDirection(row: ArAdjustmentDetailRecord | null) {
  if (!row) return { key: "", label: "-" };
  const explicit = asText(row.direction).toLowerCase();
  if (explicit === "credit" || explicit === "debit") {
    return {
      key: explicit,
      label: explicit === "credit" ? "미수 감소 (credit)" : "미수 증가 (debit)",
    };
  }
  const signed = row.signedAmount != null ? money(row.signedAmount) : money(row.amount);
  if (signed < 0 || String(row.adjustmentType || "").includes("CREDIT")) {
    return { key: "credit", label: "미수 감소 (credit)" };
  }
  return { key: "debit", label: "미수 증가 (debit)" };
}

function resolveBeforeAfter(row: ArAdjustmentDetailRecord | null) {
  if (!row) return { before: null as number | null, after: null as number | null };
  const before =
    row.beforeArBalance ?? row.beforeAr ?? row.arBefore ?? null;
  const after = row.afterArBalance ?? row.afterAr ?? row.arAfter ?? null;
  return {
    before: before == null ? null : money(before),
    after: after == null ? null : money(after),
  };
}

function collectSaleIds(row: ArAdjustmentDetailRecord | null) {
  if (!row) return [] as string[];
  const fromTargets = (Array.isArray(row.targets) ? row.targets : [])
    .map((t) => (t?.saleId != null ? String(t.saleId) : ""))
    .filter(Boolean);
  const fromIds = (Array.isArray(row.saleIds) ? row.saleIds : []).map((id) => String(id)).filter(Boolean);
  return Array.from(new Set([...fromTargets, ...fromIds]));
}

function formatAuditLine(event: Record<string, unknown>) {
  const at = asText(event.at || event.createdAt || event.ts) || "-";
  const type = asText(event.eventType || event.type || event.action) || "event";
  const actor = asText(event.actor || event.createdBy || event.by) || "-";
  const effective = asText(event.effectiveDate);
  return `${String(at).slice(0, 19)} · ${type} · ${actor}${effective ? ` · 효력일 ${effective}` : ""}`;
}

export function ArAdjustmentDetailDrawer({
  open,
  onClose,
  adjustment: adjustmentProp = null,
  adjustmentId = null,
  onOpenClientLedger,
  onOpenSale,
}: ArAdjustmentDetailDrawerProps) {
  const [fetched, setFetched] = useState<ArAdjustmentDetailRecord | null>(null);
  const [events, setEvents] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const lookupId = adjustmentId != null && String(adjustmentId).trim() !== "" ? String(adjustmentId) : null;

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setFetched(null);
      setEvents([]);
      setError("");
      setLoading(false);
      return;
    }

    if (adjustmentProp && (!lookupId || String(adjustmentProp.id) === String(lookupId))) {
      setFetched(adjustmentProp);
      setEvents(
        Array.isArray(adjustmentProp.events)
          ? adjustmentProp.events
          : Array.isArray(adjustmentProp.auditHistory)
            ? adjustmentProp.auditHistory
            : [],
      );
      setError("");
    }

    if (!lookupId) {
      if (!adjustmentProp) setFetched(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");
    fetchArAdjustmentByIdApi(lookupId)
      .then((result) => {
        if (cancelled) return;
        setFetched((result.adjustment || null) as ArAdjustmentDetailRecord | null);
        setEvents(Array.isArray(result.events) ? result.events : []);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (!adjustmentProp) setFetched(null);
        setError(err instanceof Error ? err.message : "미수조정을 불러오지 못했습니다.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, lookupId, adjustmentProp]);

  const adjustment = fetched || (adjustmentProp && (!lookupId || String(adjustmentProp.id) === lookupId) ? adjustmentProp : null);

  const direction = resolveDirection(adjustment);
  const beforeAfter = resolveBeforeAfter(adjustment);
  const saleIds = collectSaleIds(adjustment);
  const targetMode = asText(adjustment?.targetMode).toUpperCase() || "-";
  const periodStart = asText(adjustment?.targetPeriodStart || adjustment?.periodStart);
  const periodEnd = asText(adjustment?.targetPeriodEnd || adjustment?.periodEnd);
  const statementId = asText(adjustment?.targetStatementId || adjustment?.statementId);
  const reasonText = asText(adjustment?.reasonText || adjustment?.memo) || "-";
  const reasonCode = asText(adjustment?.reasonCode) || "-";
  const creator = asText(adjustment?.createdBy || adjustment?.postedBy) || "-";
  const approver = asText(adjustment?.approvedBy || adjustment?.approver || adjustment?.postedBy) || "-";
  const clientName =
    asText(adjustment?.clientNameSnapshot || adjustment?.clientName) ||
    (adjustment?.clientId != null ? String(adjustment.clientId) : "-");
  const absAmount = Math.abs(
    adjustment?.signedAmount != null ? money(adjustment.signedAmount) : money(adjustment?.amount),
  );

  const auditRows = useMemo(() => {
    const fromState = events.length
      ? events
      : Array.isArray(adjustment?.auditHistory)
        ? adjustment!.auditHistory!
        : Array.isArray(adjustment?.events)
          ? adjustment!.events!
          : [];
    return fromState.slice().sort((a, b) => String(a.at || a.createdAt || "").localeCompare(String(b.at || b.createdAt || "")));
  }, [events, adjustment]);

  const reversalLines = useMemo(() => {
    if (!adjustment) return [] as string[];
    const lines: string[] = [];
    if (adjustment.reversalOfAdjustmentId) {
      lines.push(`이 전표는 원본 ${adjustment.reversalOfAdjustmentId} 의 취소(역분개)입니다.`);
    }
    if (adjustment.status === "reversed" || adjustment.reversedEffectiveDate) {
      lines.push(
        `취소됨 · 효력일 ${asText(adjustment.reversedEffectiveDate) || "-"}` +
          (adjustment.reversedBy ? ` · ${adjustment.reversedBy}` : "") +
          (adjustment.reversedAt ? ` · ${String(adjustment.reversedAt).slice(0, 19)}` : ""),
      );
    }
    for (const row of auditRows) {
      const type = asText(row.eventType || row.type).toLowerCase();
      if (type.includes("revers") || row.reversalAdjustmentId) {
        lines.push(formatAuditLine(row));
      }
    }
    return Array.from(new Set(lines));
  }, [adjustment, auditRows]);

  if (!open) return null;

  const modal = (
    <div
      className="erp-ledger-modal-backdrop erp-ledger-modal-backdrop--elevated"
      data-ar-adjustment-detail-drawer="true"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="erp-ledger-modal max-w-3xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ar-adjustment-detail-drawer-title"
        onWheel={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3">
          <div>
            <h2 id="ar-adjustment-detail-drawer-title" className="text-base font-bold text-slate-900 md:text-lg">
              미수조정전표 {adjustment?.adjustmentNo || adjustment?.id || (loading ? "…" : "-")}
            </h2>
            <p className="mt-1 text-xs font-semibold text-amber-700">
              미수조정 · 실제입금 아님 — 현금 입금전표·통장입금 합계에 포함하지 않음
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              {clientName} · 효력일 {asText(adjustment?.effectiveDate) || "-"}
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" className="rounded-lg" onClick={onClose}>
            닫기
          </Button>
        </div>

        {error ? (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
        ) : null}
        {loading && !adjustment ? (
          <p className="mt-3 text-xs text-slate-500">불러오는 중…</p>
        ) : null}

        {adjustment ? (
          <>
            <div className="mt-2 flex flex-wrap gap-2">
              {onOpenClientLedger && adjustment.clientId != null ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-lg text-xs"
                  onClick={() =>
                    onOpenClientLedger(
                      adjustment.clientId as string | number,
                      asText(adjustment.clientNameSnapshot || adjustment.clientName) || undefined,
                    )
                  }
                >
                  거래처 수금원장
                </Button>
              ) : null}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl border border-violet-200 bg-violet-50/60 p-3 text-xs sm:grid-cols-4">
              <div>
                <div className="font-semibold text-slate-500">거래처</div>
                <div className="font-bold text-slate-900">{clientName}</div>
                <div className="text-slate-500">{adjustment.clientId != null ? String(adjustment.clientId) : ""}</div>
              </div>
              <div>
                <div className="font-semibold text-slate-500">효력일</div>
                <div className="font-bold text-slate-900">{asText(adjustment.effectiveDate) || "-"}</div>
                <div className="text-slate-500">
                  {adjustment.createdAt ? String(adjustment.createdAt).slice(0, 19) : "-"}
                </div>
              </div>
              <div>
                <div className="font-semibold text-slate-500">방향 / 유형</div>
                <div className="font-bold text-slate-900">{direction.label}</div>
                <div className="text-slate-500">
                  {TYPE_LABEL[String(adjustment.adjustmentType || "")] || adjustment.adjustmentType || "-"}
                </div>
              </div>
              <div>
                <div className="font-semibold text-slate-500">조정금액 (현금 아님)</div>
                <div
                  className={`font-bold ${direction.key === "credit" ? "text-violet-700" : "text-amber-700"}`}
                >
                  {formatKRW(absAmount)}
                </div>
                <div className="text-slate-500">
                  {STATUS_LABEL[String(adjustment.status || "")] || adjustment.status || "-"}
                </div>
              </div>
              <div>
                <div className="font-semibold text-slate-500">사유코드</div>
                <div className="font-bold text-slate-900">{reasonCode}</div>
              </div>
              <div className="sm:col-span-2">
                <div className="font-semibold text-slate-500">사유</div>
                <div className="font-bold text-slate-900">{reasonText}</div>
              </div>
              <div>
                <div className="font-semibold text-slate-500">적용 방식</div>
                <div className="font-bold text-slate-900">
                  {targetMode === "TARGETED"
                    ? "TARGETED (대상 지정)"
                    : targetMode === "BALANCE_ONLY"
                      ? "BALANCE_ONLY (잔액만)"
                      : targetMode}
                </div>
              </div>
              <div>
                <div className="font-semibold text-slate-500">대상 기간</div>
                <div className="font-bold text-slate-900">
                  {periodStart || periodEnd ? `${periodStart || "?"} ~ ${periodEnd || "?"}` : "-"}
                </div>
              </div>
              <div>
                <div className="font-semibold text-slate-500">대상 내역서</div>
                <div className="font-bold text-slate-900">{statementId || "-"}</div>
              </div>
              <div>
                <div className="font-semibold text-slate-500">조정 전 미수</div>
                <div className="font-bold text-slate-900">
                  {beforeAfter.before == null ? "-" : formatKRW(beforeAfter.before)}
                </div>
              </div>
              <div>
                <div className="font-semibold text-slate-500">조정 후 미수</div>
                <div className="font-bold text-slate-900">
                  {beforeAfter.after == null ? "-" : formatKRW(beforeAfter.after)}
                </div>
              </div>
              <div>
                <div className="font-semibold text-slate-500">등록자</div>
                <div className="font-bold text-slate-900">{creator}</div>
              </div>
              <div>
                <div className="font-semibold text-slate-500">승인자</div>
                <div className="font-bold text-slate-900">{approver}</div>
              </div>
            </div>

            <div className="mt-4">
              <h3 className="mb-2 text-sm font-bold text-slate-800">대상 매출전표</h3>
              {saleIds.length === 0 ? (
                <p className="text-xs text-slate-500">
                  {targetMode === "BALANCE_ONLY"
                    ? "BALANCE_ONLY — 개별 매출 지정 없음"
                    : "지정된 매출전표가 없습니다."}
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {saleIds.map((saleId) => {
                    const target = (adjustment.targets || []).find((row) => String(row.saleId) === saleId);
                    return (
                      <li key={saleId}>
                        <button
                          type="button"
                          className={`flex w-full items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 text-left text-xs hover:bg-slate-50 ${
                            onOpenSale ? "cursor-pointer" : "cursor-default"
                          }`}
                          onClick={() => onOpenSale?.(saleId)}
                          disabled={!onOpenSale}
                        >
                          <span>
                            <span className="font-semibold text-slate-900">saleId {saleId}</span>
                            {target?.memo ? <span className="ml-2 text-slate-500">{target.memo}</span> : null}
                          </span>
                          {target?.amount != null ? (
                            <span className="font-semibold text-violet-700">{formatKRW(Math.abs(money(target.amount)))}</span>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="mt-4">
              <h3 className="mb-2 text-sm font-bold text-slate-800">취소 / 역분개 이력</h3>
              {reversalLines.length === 0 ? (
                <p className="text-xs text-slate-500">취소 이력 없음</p>
              ) : (
                <ul className="space-y-1 text-xs text-slate-700">
                  {reversalLines.map((line) => (
                    <li key={line} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                      {line}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {auditRows.length > 0 ? (
              <div className="mt-4">
                <h3 className="mb-2 text-sm font-bold text-slate-800">감사 이력</h3>
                <ul className="space-y-1 text-xs text-slate-700">
                  {auditRows.map((row, index) => (
                    <li
                      key={String(row.id || `${index}-${row.eventType || row.type || "evt"}`)}
                      className="rounded-lg border border-slate-100 px-3 py-2"
                    >
                      {formatAuditLine(row)}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

export default ArAdjustmentDetailDrawer;
