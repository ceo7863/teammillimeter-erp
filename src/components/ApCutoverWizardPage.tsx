/**
 * Admin-only AP cutover wizard: date → opening balances → preview → confirm.
 * Production activate is intentionally gated by CEO confirmation phrase + preview token.
 * This release ships the UI but does not perform production activation.
 */
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  fetchApCutoverStatusApi,
  previewApCutoverApi,
  activateApCutoverApi,
} from "@/utils/erpApi";
import { LEGACY_PAYOUT_READ_ONLY_NOTICE } from "@/utils/featureFlags";

type WorkerLike = { id?: string | number; name?: string };

type OpeningRow = {
  workerId: string;
  workerNameSnapshot: string;
  openingAmount: string;
  memo: string;
  reviewed: boolean;
  legacyReferenceAmount?: number | null;
};

const STEPS = ["컷오버 날짜", "기초 미지급", "Preview", "최종 확인"] as const;

function formatKRW(value: number) {
  return Math.round(Number(value) || 0).toLocaleString("ko-KR");
}

export function ApCutoverWizardPage({
  workers = [],
  currentUser,
}: {
  workers?: WorkerLike[];
  currentUser?: { name?: string; email?: string; role?: string };
}) {
  const [step, setStep] = useState(0);
  const [cutoverWorkDate, setCutoverWorkDate] = useState("");
  const [policy, setPolicy] = useState<"APPROVED_WORKER_OPENING_BALANCES" | "ZERO_START">(
    "APPROVED_WORKER_OPENING_BALANCES",
  );
  const [zeroStartConfirmed, setZeroStartConfirmed] = useState(false);
  const [rows, setRows] = useState<OpeningRow[]>([]);
  const [workerQuery, setWorkerQuery] = useState("");
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [activateBlockedNotice] = useState(
    "이번 배포에서는 운영 활성화를 실행하지 않습니다. Preview까지 검증하고, 실제 activate는 대표 승인 후 후속 작업에서만 수행합니다.",
  );

  useEffect(() => {
    void fetchApCutoverStatusApi()
      .then((row) => setStatus(row as Record<string, unknown>))
      .catch(() => setStatus(null));
  }, []);

  const workerOptions = useMemo(() => {
    const q = workerQuery.trim().toLowerCase();
    return (workers || [])
      .filter((row) => String(row.id ?? "").trim() && String(row.name || "").trim())
      .filter((row) => {
        if (!q) return true;
        return (
          String(row.name).toLowerCase().includes(q) || String(row.id).toLowerCase().includes(q)
        );
      })
      .slice(0, 30);
  }, [workers, workerQuery]);

  const rowTotal = rows.reduce((sum, row) => sum + Math.round(Number(row.openingAmount) || 0), 0);
  const duplicateWorker = (() => {
    const seen = new Set<string>();
    for (const row of rows) {
      if (seen.has(row.workerId)) return row.workerId;
      seen.add(row.workerId);
    }
    return "";
  })();
  const missingReview = rows.some((row) => !row.reviewed);

  const addWorker = (worker: WorkerLike) => {
    const workerId = String(worker.id ?? "").trim();
    if (!workerId) return;
    if (rows.some((row) => row.workerId === workerId)) {
      setError(`중복 시공자: ${workerId}`);
      return;
    }
    setError("");
    setRows((prev) => [
      ...prev,
      {
        workerId,
        workerNameSnapshot: String(worker.name || "").trim(),
        openingAmount: "",
        memo: "",
        reviewed: false,
        legacyReferenceAmount: null,
      },
    ]);
  };

  const runPreview = async () => {
    setBusy(true);
    setError("");
    setPreview(null);
    try {
      if (!cutoverWorkDate) throw new Error("컷오버 날짜를 선택하세요.");
      if (duplicateWorker) throw new Error(`중복 시공자: ${duplicateWorker}`);
      if (policy === "APPROVED_WORKER_OPENING_BALANCES" && missingReview) {
        throw new Error("모든 행의 검토 완료가 필요합니다.");
      }
      if (policy === "ZERO_START" && !zeroStartConfirmed) {
        throw new Error("ZERO_START 명시 확인이 필요합니다.");
      }
      const body = {
        apLedgerCutoverWorkDate: cutoverWorkDate,
        openingBalancePolicy: policy,
        zeroStartExplicitConfirmation: zeroStartConfirmed,
        zeroStartConfirmation: zeroStartConfirmed ? "ZERO_START_CONFIRMED_NO_LEGACY_UNPAID" : "",
        operationId: `ap-cutover-preview-${Date.now().toString(36)}`,
        approvedBy: currentUser?.email || currentUser?.name || "",
        reviewedWorkerIds: rows.filter((row) => row.reviewed).map((row) => row.workerId),
        openingBalances:
          policy === "ZERO_START"
            ? []
            : rows.map((row) => ({
                workerId: row.workerId,
                workerNameSnapshot: row.workerNameSnapshot,
                openingAmount: Math.round(Number(row.openingAmount) || 0),
                effectiveDate: cutoverWorkDate,
                memo: row.memo,
                reviewed: row.reviewed,
                approvedBy: currentUser?.email || currentUser?.name || "",
              })),
      };
      const result = await previewApCutoverApi(body);
      setPreview(result as Record<string, unknown>);
      if (!(result as { ok?: boolean }).ok) {
        const errs = ((result as { errors?: Array<{ code?: string; message?: string }> }).errors || [])
          .map((row) => row.code || row.message)
          .join(", ");
        throw new Error(errs || "Preview 실패");
      }
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview 실패");
    } finally {
      setBusy(false);
    }
  };

  const runActivateDryGuard = async () => {
    setBusy(true);
    setError("");
    try {
      // Soft production guard: UI refuses to call activate unless localStorage unlock is set for throwaway tests.
      const unlock =
        typeof window !== "undefined" &&
        window.localStorage?.getItem("erp.feature.apCutoverActivateUnlock") === "1";
      if (!unlock) {
        setError(activateBlockedNotice);
        return;
      }
      if (!preview || !(preview as { previewToken?: string }).previewToken) {
        throw new Error("유효한 preview token이 없습니다.");
      }
      if (confirmation !== String((preview as { confirmationPhrase?: string }).confirmationPhrase || "AP_CUTOVER_ACTIVATE_CONFIRMED")) {
        throw new Error("확인 문구가 일치하지 않습니다.");
      }
      const result = await activateApCutoverApi({
        operationId: `ap-cutover-activate-${Date.now().toString(36)}`,
        confirmation,
        previewToken: (preview as { previewToken: string }).previewToken,
        expectedVersion: (preview as { summary?: { erpVersion?: number } }).summary?.erpVersion,
        apLedgerCutoverWorkDate: cutoverWorkDate,
        openingBalancePolicy: policy,
        zeroStartExplicitConfirmation: zeroStartConfirmed,
        reviewedWorkerIds: rows.filter((row) => row.reviewed).map((row) => row.workerId),
        openingBalances:
          policy === "ZERO_START"
            ? []
            : rows.map((row) => ({
                workerId: row.workerId,
                workerNameSnapshot: row.workerNameSnapshot,
                openingAmount: Math.round(Number(row.openingAmount) || 0),
                effectiveDate: cutoverWorkDate,
                memo: row.memo,
                reviewed: row.reviewed,
              })),
      });
      setStatus((result as { activation?: Record<string, unknown> }).activation || null);
      setError("");
      alert("테스트 환경 컷오버가 활성화되었습니다.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Activate 실패");
    } finally {
      setBusy(false);
    }
  };

  const activated = Boolean(status?.activated || status?.apLedgerActivatedAt);

  return (
    <div className="erp-page space-y-4" data-ap-cutover-wizard="true">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950" role="status">
        {LEGACY_PAYOUT_READ_ONLY_NOTICE}
        <div className="mt-1 font-medium">{activateBlockedNotice}</div>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">AP 컷오버 마법사</h1>
          <p className="text-sm text-slate-600">기초 미지급 검토 · 원자적 활성화 준비 (관리자 전용)</p>
        </div>
        <div className="text-sm text-slate-600" aria-label="컷오버 상태">
          상태: {activated ? "활성화됨" : "미활성"} · write {status?.writeEnabled ? "ON" : "OFF"}
        </div>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="컷오버 단계">
        {STEPS.map((label, index) => (
          <button
            key={label}
            type="button"
            role="tab"
            aria-selected={step === index}
            className={`rounded-xl px-4 py-2 text-sm font-bold ${step === index ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}
            onClick={() => setStep(index)}
          >
            {index + 1}. {label}
          </button>
        ))}
      </div>

      {step === 0 ? (
        <Card className="rounded-2xl">
          <CardContent className="space-y-4 p-5">
            <label className="grid gap-1 text-sm">
              <span className="font-medium">컷오버 작업일 (Asia/Seoul)</span>
              <input
                type="date"
                className="rounded border px-3 py-2"
                value={cutoverWorkDate}
                onChange={(event) => setCutoverWorkDate(event.target.value)}
                aria-label="컷오버 날짜"
              />
            </label>
            <p className="text-sm text-slate-600">
              선택일 00:00부터 해당 workDate 이상만 신규 Payable입니다. 현재 날짜를 자동 확정하지 않습니다.
            </p>
            {cutoverWorkDate ? (
              <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
                <li>이전 날: 신규 Payable 제외</li>
                <li>당일({cutoverWorkDate}): 포함</li>
                <li>이후 날: 포함</li>
              </ul>
            ) : null}
            <Button type="button" onClick={() => setStep(1)} disabled={!cutoverWorkDate}>
              다음
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {step === 1 ? (
        <Card className="rounded-2xl">
          <CardContent className="space-y-4 p-5">
            <div className="flex flex-wrap gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={policy === "APPROVED_WORKER_OPENING_BALANCES"}
                  onChange={() => setPolicy("APPROVED_WORKER_OPENING_BALANCES")}
                />
                APPROVED_WORKER_OPENING_BALANCES (권장)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" checked={policy === "ZERO_START"} onChange={() => setPolicy("ZERO_START")} />
                ZERO_START
              </label>
            </div>
            {policy === "ZERO_START" ? (
              <label className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm">
                <input
                  type="checkbox"
                  checked={zeroStartConfirmed}
                  onChange={(event) => setZeroStartConfirmed(event.target.checked)}
                />
                <span>
                  컷오버 이전 실제 미지급이 모두 0원이며 기존 장부에서 별도 관리할 금액도 없음을 대표가 명시 확인합니다.
                </span>
              </label>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  <input
                    className="rounded border px-3 py-2 text-sm"
                    placeholder="시공자 검색"
                    value={workerQuery}
                    onChange={(event) => setWorkerQuery(event.target.value)}
                    aria-label="시공자 검색"
                  />
                </div>
                <div className="max-h-40 overflow-auto rounded border">
                  {workerOptions.map((worker) => (
                    <button
                      key={String(worker.id)}
                      type="button"
                      className="flex w-full items-center justify-between border-b px-3 py-2 text-left text-sm hover:bg-slate-50"
                      onClick={() => addWorker(worker)}
                    >
                      <span>
                        {worker.name} <span className="text-slate-400">#{worker.id}</span>
                      </span>
                      <span className="text-sky-700">추가</span>
                    </button>
                  ))}
                </div>
                <div className="overflow-auto">
                  <table className="erp-table w-full text-sm">
                    <thead>
                      <tr>
                        <th>workerId</th>
                        <th>이름 snapshot</th>
                        <th>기초 미지급</th>
                        <th>메모</th>
                        <th>검증되지 않은 이전 장부 참고값</th>
                        <th>검토 완료</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.workerId}>
                          <td>{row.workerId}</td>
                          <td>{row.workerNameSnapshot}</td>
                          <td>
                            <input
                              type="number"
                              className="w-32 rounded border px-2 py-1"
                              value={row.openingAmount}
                              min={0}
                              onChange={(event) =>
                                setRows((prev) =>
                                  prev.map((item) =>
                                    item.workerId === row.workerId
                                      ? { ...item, openingAmount: event.target.value }
                                      : item,
                                  ),
                                )
                              }
                            />
                          </td>
                          <td>
                            <input
                              className="w-40 rounded border px-2 py-1"
                              value={row.memo}
                              onChange={(event) =>
                                setRows((prev) =>
                                  prev.map((item) =>
                                    item.workerId === row.workerId ? { ...item, memo: event.target.value } : item,
                                  ),
                                )
                              }
                            />
                          </td>
                          <td className="text-slate-400">
                            {row.legacyReferenceAmount != null
                              ? formatKRW(row.legacyReferenceAmount)
                              : "자동 입력 없음"}
                          </td>
                          <td>
                            <input
                              type="checkbox"
                              checked={row.reviewed}
                              aria-label={`${row.workerNameSnapshot} 검토 완료`}
                              onChange={(event) =>
                                setRows((prev) =>
                                  prev.map((item) =>
                                    item.workerId === row.workerId
                                      ? { ...item, reviewed: event.target.checked }
                                      : item,
                                  ),
                                )
                              }
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-sm text-slate-600">
                  합계 {formatKRW(rowTotal)} · 참고값은 openingAmount와 자동 동기화하지 않습니다.
                </p>
              </>
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setStep(0)}>
                이전
              </Button>
              <Button type="button" onClick={() => void runPreview()} disabled={busy}>
                Preview
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 2 ? (
        <Card className="rounded-2xl">
          <CardContent className="space-y-3 p-5 text-sm">
            <h2 className="text-lg font-semibold">Preview</h2>
            {preview ? (
              <pre className="max-h-80 overflow-auto rounded bg-slate-50 p-3 text-xs" data-ap-cutover-preview="true">
                {JSON.stringify((preview as { summary?: unknown }).summary || preview, null, 2)}
              </pre>
            ) : (
              <p>Preview를 먼저 실행하세요.</p>
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setStep(1)}>
                이전
              </Button>
              <Button type="button" onClick={() => setStep(3)} disabled={!preview || !(preview as { ok?: boolean }).ok}>
                최종 확인
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 3 ? (
        <Card className="rounded-2xl">
          <CardContent className="space-y-4 p-5">
            <p className="text-sm text-slate-700" role="alert">
              대표 권한이 필요하며, preview token · ERP version · legacy hash가 일치해야 합니다. 이번 운영 배포에서는
              활성화를 실행하지 않습니다.
            </p>
            <label className="grid gap-1 text-sm">
              <span>확인 문구 ({String((preview as { confirmationPhrase?: string })?.confirmationPhrase || "AP_CUTOVER_ACTIVATE_CONFIRMED")})</span>
              <input
                className="rounded border px-3 py-2"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                aria-label="컷오버 확인 문구"
              />
            </label>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setStep(2)}>
                이전
              </Button>
              <Button type="button" onClick={() => void runActivateDryGuard()} disabled={busy}>
                활성화 (테스트 unlock 필요)
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {error ? (
        <p className="text-sm text-rose-700" role="alert" data-ap-cutover-error="true">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default ApCutoverWizardPage;
