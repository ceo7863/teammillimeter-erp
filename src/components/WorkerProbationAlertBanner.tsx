import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  buildWorkerProbationAlerts,
  dismissWorkerProbationAlert,
  formatWorkerProbationAlertMessage,
  loadDismissedWorkerProbationAlertKeys,
  storeWorkerScrollTarget,
  type WorkerProbationAlert,
} from "@/utils/workerProbationAlerts";
import type { WorkerMasterLike } from "@/utils/workerPayments";

type WorkerProbationAlertBannerProps = {
  workers: WorkerMasterLike[];
  onOpenWorkers: (workerId?: string) => void;
  onVisibleCountChange?: (count: number) => void;
};

export function useWorkerProbationAlertState(workers: WorkerMasterLike[]) {
  const alerts = useMemo(() => buildWorkerProbationAlerts(workers), [workers]);
  const [dismissedKeys, setDismissedKeys] = useState(() =>
    loadDismissedWorkerProbationAlertKeys(alerts.map((alert) => alert.alertKey)),
  );

  useEffect(() => {
    setDismissedKeys(loadDismissedWorkerProbationAlertKeys(alerts.map((alert) => alert.alertKey)));
  }, [alerts]);

  const visibleAlerts = useMemo(
    () => alerts.filter((alert) => !dismissedKeys.has(alert.alertKey)),
    [alerts, dismissedKeys],
  );

  const dismiss = useCallback((alertKey: string) => {
    dismissWorkerProbationAlert(alertKey);
    setDismissedKeys((prev) => new Set([...prev, alertKey]));
  }, []);

  return { alerts, visibleAlerts, dismiss, visibleCount: visibleAlerts.length };
}

function AlertRow({
  alert,
  onOpenWorkers,
  onDismiss,
}: {
  alert: WorkerProbationAlert;
  onOpenWorkers: (workerId?: string) => void;
  onDismiss: (alertKey: string) => void;
}) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-amber-200/80 bg-white/80 px-3 py-2.5">
      <p className="min-w-0 flex-1 text-sm leading-6 text-amber-950">{formatWorkerProbationAlertMessage(alert)}</p>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 rounded-lg border-amber-300 bg-white px-2.5 text-xs text-amber-950 hover:bg-amber-50"
          onClick={() => onOpenWorkers(alert.workerId)}
        >
          {"\uC2DC\uACF5\uC790 \uBCF4\uAE30"}
        </Button>
        <button
          type="button"
          className="rounded-lg p-1.5 text-amber-700 transition hover:bg-amber-100"
          aria-label={"\uC54C\uB9BC \uB2EB\uAE30"}
          onClick={() => onDismiss(alert.alertKey)}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

export function WorkerProbationAlertBanner({
  workers,
  onOpenWorkers,
  onVisibleCountChange,
}: WorkerProbationAlertBannerProps) {
  const { visibleAlerts, dismiss } = useWorkerProbationAlertState(workers);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    onVisibleCountChange?.(visibleAlerts.length);
  }, [onVisibleCountChange, visibleAlerts.length]);

  if (!visibleAlerts.length) return null;

  const preview = visibleAlerts[0];
  const hiddenCount = visibleAlerts.length - 1;

  const handleOpenWorkers = (workerId?: string) => {
    if (workerId) storeWorkerScrollTarget(workerId);
    onOpenWorkers(workerId);
  };

  return (
    <div className="mb-3 rounded-2xl border border-amber-300 bg-amber-50 p-3 shadow-sm">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-bold text-amber-950">{"\uC218\uC2B5 \uAE30\uAC04 \uC54C\uB9BC"}</h2>
            <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-900">
              {visibleAlerts.length}
              {"\uAC74"}
            </span>
          </div>
          <p className="mt-1 text-xs text-amber-800">
            {"\uC785\uC0AC\uC77C \uAE30\uC900 1\u00B72\u00B73\uAC1C\uC6D4 \uB418\uB294 \uB0A0 3\uC77C \uC804\uBD80\uD130 \uD45C\uC2DC\uB429\uB2C8\uB2E4."}
          </p>
          <div className="mt-3 space-y-2">
            <AlertRow alert={preview} onOpenWorkers={handleOpenWorkers} onDismiss={dismiss} />
            {expanded && hiddenCount > 0
              ? visibleAlerts.slice(1).map((alert) => (
                  <AlertRow key={alert.alertKey} alert={alert} onOpenWorkers={handleOpenWorkers} onDismiss={dismiss} />
                ))
              : null}
          </div>
          {hiddenCount > 0 ? (
            <button
              type="button"
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-amber-900 hover:text-amber-950"
              onClick={() => setExpanded((prev) => !prev)}
            >
              {expanded ? (
                <>
                  {"\uC811\uAE30"}
                  <ChevronUp size={14} />
                </>
              ) : (
                <>
                  {hiddenCount}
                  {"\uAC74 \uB354 \uBCF4\uAE30"}
                  <ChevronDown size={14} />
                </>
              )}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
