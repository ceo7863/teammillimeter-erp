import React, { useCallback, useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WorkerPortalSignaturePad } from "@/components/WorkerPortalSignaturePad";
import {
  fetchWorkerPortalAcknowledgment,
  saveWorkerPortalAcknowledgment,
  type WorkerPortalAcknowledgmentRecord,
  type WorkerPortalAcknowledgmentState,
} from "@/utils/workerPortalApi";
import {
  buildWorkerPortalAckConfirmMessage,
  formatWorkerPortalAckConfirmedAt,
  isWorkerPortalSignableMonth,
} from "@/utils/workerPortalAcknowledgment";
import { formatMonthLabel } from "@/utils/workerMonthlyPayments";

type WorkerPortalAcknowledgmentPanelProps = {
  monthKey: string;
  hasStatementRows: boolean;
  onAcknowledgmentChange?: (acknowledgment: WorkerPortalAcknowledgmentRecord | null) => void;
  /** When true, signature pad is rendered on the statement sheet instead of this panel. */
  signatureOnStatement?: boolean;
  onSignatureDraftChange?: (dataUrl: string) => void;
  signatureDataUrl?: string;
};

export function WorkerPortalAcknowledgmentPanel({
  monthKey,
  hasStatementRows,
  onAcknowledgmentChange,
  signatureOnStatement = false,
  onSignatureDraftChange,
  signatureDataUrl: controlledSignatureDataUrl,
}: WorkerPortalAcknowledgmentPanelProps) {
  const [state, setState] = useState<WorkerPortalAcknowledgmentState | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [signatureDataUrl, setSignatureDataUrl] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const activeSignatureDataUrl = controlledSignatureDataUrl ?? signatureDataUrl;
  const updateSignatureDataUrl = useCallback(
    (value: string) => {
      setSignatureDataUrl(value);
      onSignatureDraftChange?.(value);
    },
    [onSignatureDraftChange],
  );

  const canSignMonth = isWorkerPortalSignableMonth(monthKey);

  const loadAck = useCallback(async () => {
    if (!canSignMonth || !hasStatementRows) {
      setState(null);
      onAcknowledgmentChange?.(null);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await fetchWorkerPortalAcknowledgment(monthKey);
      setState(result);
      onAcknowledgmentChange?.(result.acknowledgment);
      if (result.acknowledgment?.signatureDataUrl) {
        updateSignatureDataUrl(result.acknowledgment.signatureDataUrl);
      } else {
        updateSignatureDataUrl("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "\uD655\uC778 \uC815\uBCF4\uB97C \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.");
    } finally {
      setLoading(false);
    }
  }, [canSignMonth, hasStatementRows, monthKey, onAcknowledgmentChange, updateSignatureDataUrl]);

  useEffect(() => {
    void loadAck();
  }, [loadAck]);

  if (!canSignMonth || !hasStatementRows) return null;

  const confirmed = Boolean(state?.acknowledgment);
  const canSubmit = Boolean(state?.canSubmit) && !confirmed;

  const handleSave = async () => {
    if (!activeSignatureDataUrl) {
      setError("\uC11C\uBA85\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694.");
      return;
    }
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const result = await saveWorkerPortalAcknowledgment(monthKey, activeSignatureDataUrl);
      setState((prev) =>
        prev
          ? {
              ...prev,
              canSubmit: false,
              acknowledgment: result.acknowledgment,
            }
          : prev,
      );
      onAcknowledgmentChange?.(result.acknowledgment);
      setSuccess("\uC2DC\uACF5\uB0B4\uC5ED\uC11C \uD655\uC778\uC774 \uC800\uC7A5\uB418\uC5C8\uC2B5\uB2C8\uB2E4.");
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
          <h3 className="erp-text-body font-bold text-slate-900">{"\uC2DC\uACF5\uB0B4\uC5ED\uC11C \uD655\uC778"}</h3>
          <p className="erp-text-caption mt-1 text-slate-600">
            {formatMonthLabel(monthKey)}
            {" \uB0B4\uC5ED\uC744 \uD655\uC778\uD558\uC2DC\uACE0 \uC11C\uBA85 \uD6C4 \uC800\uC7A5\uD574 \uC8FC\uC138\uC694. (\uC774\uBC88 \uB2EC\uC740 \uD655\uC778 \uB300\uC0C1 \uC544\uC998)"}
          </p>
        </div>
      </div>

      {loading ? <p className="erp-text-caption text-slate-500">{"\uBD88\uB7EC\uC624\uB294 \uC911\u2026"}</p> : null}

      {confirmed && state?.acknowledgment ? (
        <p className="erp-text-body font-semibold text-emerald-700">
          {"\uD655\uC778 \uC644\uB8CC "}
          {formatWorkerPortalAckConfirmedAt(state.acknowledgment.confirmedAt)}
          {signatureOnStatement ? " \u00B7 \uC11C\uBA85\uB780 \uC800\uC7A5 \uC644\uB8CC" : ""}
        </p>
      ) : canSubmit ? (
        <>
          {!signatureOnStatement ? (
            <WorkerPortalSignaturePad onChange={updateSignatureDataUrl} disabled={saving} />
          ) : (
            <p className="erp-text-caption text-slate-600">
              {"\uC2DC\uACF5\uB0B4\uC5ED\uC11C \uD558\uB2E8 \uC11C\uBA85\uB780\uC5D0 \uC11C\uBA85\uD55C \uB4A4 \uC800\uC7A5\uD574 \uC8FC\uC138\uC694."}
            </p>
          )}
          <Button
            type="button"
            className="erp-login-submit erp-text-body mt-3 w-full rounded-2xl py-4 font-bold"
            disabled={saving || !activeSignatureDataUrl}
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
