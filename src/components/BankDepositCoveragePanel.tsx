/**
 * Compact bank deposit classification coverage strip for 입금·미수 hub.
 * Read-only metrics from GET /api/bank-deposits/classification-coverage.
 */
import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  fetchBankDepositClassificationCoverageApi,
  isApiModeEnabled,
} from "@/utils/erpApi";
import { formatKRW } from "@/utils/receivables";

type CoveragePayload = {
  totalCount?: number;
  totalAmount?: number;
  unclassifiedCount?: number;
  unclassifiedAmount?: number;
  countDiff?: number;
  amountDiff?: number;
  byStatus?: Record<string, { count?: number; amount?: number }>;
  sync?: {
    lastSuccessfulSyncAt?: string | null;
    lastProviderTransactionAt?: string | null;
    consecutiveFailureCount?: number;
    stale?: boolean;
  };
};

function statusAmount(byStatus: CoveragePayload["byStatus"], key: string) {
  return Math.round(Number(byStatus?.[key]?.amount) || 0);
}

function statusCount(byStatus: CoveragePayload["byStatus"], key: string) {
  return Math.round(Number(byStatus?.[key]?.count) || 0);
}

export function BankDepositCoveragePanel({ refreshToken = 0 }: { refreshToken?: number }) {
  const [data, setData] = useState<CoveragePayload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = () => {
    if (!isApiModeEnabled()) {
      setData(null);
      setError("서버 모드에서만 통장 분류 대사를 조회할 수 있습니다.");
      return;
    }
    setLoading(true);
    setError("");
    fetchBankDepositClassificationCoverageApi()
      .then((result) => setData(result as CoveragePayload))
      .catch((cause) => {
        setData(null);
        setError(cause?.message || "통장 분류 대사를 조회할 수 없습니다.");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [refreshToken]);

  const byStatus = data?.byStatus || {};
  const unclassified = Math.round(Number(data?.unclassifiedCount) || 0);
  const countDiff = Math.round(Number(data?.countDiff) || 0);
  const amountDiff = Math.round(Number(data?.amountDiff) || 0);
  const stale = Boolean(data?.sync?.stale);
  const identityBroken = countDiff !== 0 || amountDiff !== 0 || unclassified > 0;

  return (
    <Card className="rounded-xl border-slate-200/80 shadow-sm">
      <CardContent className="p-3 md:p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-slate-800">통장입금 분류·대사</h2>
            <p className="text-xs text-slate-500">
              자동충당률이 아니라 인식·분류율 100% 목표 · 건수/금액 identity
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-lg"
            onClick={load}
            disabled={loading}
            aria-label="통장 분류 대사 새로고침"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </Button>
        </div>

        {error ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {error}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
              <Metric label="통장입금" value={`${data?.totalCount ?? "-"}건`} sub={formatKRW(data?.totalAmount || 0)} />
              <Metric
                label="전액충당"
                value={`${statusCount(byStatus, "RECEIPT_ALLOCATED")}건`}
                sub={formatKRW(statusAmount(byStatus, "RECEIPT_ALLOCATED"))}
              />
              <Metric
                label="부분충당"
                value={`${statusCount(byStatus, "RECEIPT_PARTIALLY_ALLOCATED")}건`}
                sub={formatKRW(statusAmount(byStatus, "RECEIPT_PARTIALLY_ALLOCATED"))}
              />
              <Metric
                label="미충당"
                value={`${statusCount(byStatus, "RECEIPT_UNAPPLIED")}건`}
                sub={formatKRW(statusAmount(byStatus, "RECEIPT_UNAPPLIED"))}
              />
              <Metric
                label="업체확인"
                value={`${statusCount(byStatus, "CLIENT_REVIEW_REQUIRED") + statusCount(byStatus, "ALIAS_CONFLICT")}건`}
                tone="warn"
              />
              <Metric
                label="고객입금제외"
                value={`${
                  statusCount(byStatus, "CASH_TRANSFER") +
                  statusCount(byStatus, "CARD_SETTLEMENT") +
                  statusCount(byStatus, "NON_CUSTOMER_DEPOSIT") +
                  statusCount(byStatus, "IGNORED_WITH_REASON")
                }건`}
              />
              <Metric label="분류누락" value={`${unclassified}건`} tone={unclassified > 0 ? "danger" : "ok"} />
              <Metric
                label="동기화"
                value={stale ? "지연" : "정상"}
                sub={data?.sync?.lastSuccessfulSyncAt ? String(data.sync.lastSuccessfulSyncAt).slice(0, 19) : "-"}
                tone={stale ? "warn" : "ok"}
              />
            </div>

            {(identityBroken || stale) && (
              <div className="mt-2 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <div>
                  {unclassified > 0 && <div>분류 누락 {unclassified}건 · {formatKRW(data?.unclassifiedAmount || 0)}</div>}
                  {(countDiff !== 0 || amountDiff !== 0) && (
                    <div>
                      대사 차이 countDiff={countDiff} · amountDiff={formatKRW(amountDiff)}
                    </div>
                  )}
                  {stale && <div>통장 동기화가 지연되었습니다. 마지막 성공 시각을 확인하세요.</div>}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "ok" | "warn" | "danger";
}) {
  const toneClass =
    tone === "danger"
      ? "text-rose-700"
      : tone === "warn"
        ? "text-amber-700"
        : tone === "ok"
          ? "text-emerald-700"
          : "text-slate-800";
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-2.5 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-sm font-bold ${toneClass}`}>{value}</div>
      {sub ? <div className="truncate text-[11px] text-slate-500">{sub}</div> : null}
    </div>
  );
}
