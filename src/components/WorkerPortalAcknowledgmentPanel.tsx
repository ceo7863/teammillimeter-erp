import React, { useCallback, useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WorkerPortalSignaturePad } from "@/components/WorkerPortalSignaturePad";
import {
  fetchWorkerPortalAcknowledgment,
  saveWorkerPortalAcknowledgment,
  type WorkerPortalAcknowledgmentState,
} from "@/utils/workerPortalApi";
import {
  buildWorkerPortalAckConfirmMessage,
  formatWorkerPortalAckConfirmedAt,
  isWorkerPortalAckMonth,
} from "@/utils/workerPortalAcknowledgment";
import { formatMonthLabel } from "@/utils/workerMonthlyPayments";

type WorkerPortalAcknowledgmentPanelProps = {
  monthKey: string;
  hasStatementRows: boolean;
};

export function WorkerPortalAcknowledgmentPanel({
  monthKey,
  hasStatementRows,
}: WorkerPortalAcknowledgmentPanelProps) {
  const [state, setState] = useState<WorkerPortalAcknowledgmentState | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [signatureDataUrl, setSignatureDataUrl] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const isAckMonth = isWorkerPortalAckMonth(monthKey);

  const loadAck = useCallback(async () => {
    if (!isAckMonth || !hasStatementRows) {
      setState(null);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await fetchWorkerPortalAcknowledgment(monthKey);
      setState(result);
      if (result.acknowledgment?.signatureDataUrl) {
        setSignatureDataUrl(result.acknowledgment.signatureDataUrl);
      } else {
        setSignatureDataUrl("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "\uD655\uC778 \uC815\uBCF4\uB97C \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.");
    } finally {
      setLoading(false);
    }
  }, [hasStatementRows, isAckMonth, monthKey]);

  useEffect(() => {
    void loadAck();
  }, [loadAck]);

  if (!isAckMonth || !hasStatementRows) return null;

  const confirmed = Boolean(state?.acknowledgment);
  const canSubmit = Boolean(state?.canSubmit) && !confirmed;

  const handleSave = async () => {
    if (!signatureDataUrl) {
      setError("\uC11C\uBA85\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694.");
      return;
    }
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const result = await saveWorkerPortalAcknowledgment(monthKey, signatureDataUrl);
      setState((prev) =>
        prev
          ? {
              ...prev,
              canSubmit: false,
              acknowledgment: result.acknowledgment,
            }
          : prev,
      );
      setSuccess("\uC804\uC6D4 \uC2DC\uACF5\uB0B4\uC5ED\uC11C \uD655\uC778\uC774 \uC800\uC7A5\uB418\uC5C8\uC2B5\uB2C8\uB2E4.");
      setConfirmOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "\uC800\uC7A5\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="erp-worker-portal-ack mt-3 shrink-0 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-3 flex items-start gap-2">
        <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-emerald-600" />
        <div>
          <h3 className="erp-text-body font-bold text-slate-900">{"\uC804\uC6D4 \uC2DC\uACF5\uB0B4\uC5ED\uC11C \uD655\uC778"}</h3>
          <p className="erp-text-caption mt-1 text-slate-600">
            {formatMonthLabel(monthKey)}
            {" \uB0B4\uC5ED\uC744 \uD655\uC778\uD558\uC2DC\uACE0 \uC11C\uBA85 \uD6C4 \uC800\uC7A5\uD574 \uC8FC\uC138\uC694."}
          </p>
        </div>
      </div>

      {loading ? <p className="erp-text-caption text-slate-500">{"\uBD88\uB7EC\uC624\uB294 \uC911\u2026"}</p> : null}

      {confirmed && state?.acknowledgment ? (
        <div className="space-y-3">
          <p className="erp-text-body font-semibold text-emerald-700">
            {"\uD655\uC778 \uC644\uB8CC "}
            {formatWorkerPortalAckConfirmedAt(state.acknowledgment.confirmedAt)}
          </p>
          <img
            src={state.acknowledgment.signatureDataUrl}
            alt={"\uC800\uC7A5\uB41C \uC11C\uBA85"}
            className="erp-worker-portal-ack__signature-image"
          />
        </div>
      ) : canSubmit ? (
        <>
          <WorkerPortalSignaturePad onChange={setSignatureDataUrl} disabled={saving} />
          <Button
            type="button"
            className="erp-login-submit erp-text-body mt-3 w-full rounded-2xl py-4 font-bold"
            disabled={saving || !signatureDataUrl}
            onClick={() => {
              setError("");
              setConfirmOpen(true);
            }}
          >
            {saving ? "\uC800\uC7A5 \uC911\u2026" : "\uD655\uC778 \uBC0F \uC800\uC7A5"}
          </Button>
        </>
      ) : null}

      {error ? (
        <p className="erp-text-caption mt-2 font-semibold text-red-600">{error}</p>
      ) : null}
      {success ? (
        <p className="erp-text-caption mt-2 font-semibold text-emerald-700">{success}</p>
      ) : null}

      {confirmOpen ? (
        <div
          className="erp-worker-portal-ack-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) setConfirmOpen(false);
          }}
        >
          <div
            className="erp-worker-portal-ack-modal"
            role="dialog"
            aria-modal="true"
            aria-label={"\uC2DC\uACF5\uB0B4\uC5ED\uC11C \uD655\uC778 \uC800\uC7A5"}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h4 className="erp-text-body font-bold text-slate-900">{"\uC800\uC7A5 \uD655\uC778"}</h4>
            <p className="erp-text-caption mt-2 whitespace-pre-line text-slate-600">
              {buildWorkerPortalAckConfirmMessage(monthKey)}
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                className="w-full rounded-2xl"
                disabled={saving}
                onClick={() => setConfirmOpen(false)}
              >
                {"\uCDE8\uC18C"}
              </Button>
              <Button
                type="button"
                className="erp-login-submit w-full rounded-2xl font-bold"
                disabled={saving}
                onClick={() => void handleSave()}
              >
                {saving ? "\uC800\uC7A5 \uC911\u2026" : "\uC800\uC7A5"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
