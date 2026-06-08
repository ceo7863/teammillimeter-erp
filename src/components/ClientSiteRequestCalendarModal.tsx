import React, { useLayoutEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { Link2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ClientSiteRequestCalendarPanel } from "@/components/ClientSiteRequestCalendarPanel";
import {
  openClientSiteRequestLink,
  resolveClientSiteRequestLinkUrl,
  type ClientSiteRequestLink,
} from "@/utils/clientSiteRequests";
import type { WorkerMasterLike } from "@/utils/workerPayments";
import { useBodyScrollLock } from "@/utils/bodyScrollLock";
import { useBackdropPointerDismiss, useModalDismissGuard } from "@/utils/modalBackdrop";

const L = {
  title: "\uC811\uC218 \uCE98\uB9B0\uB354",
  closeAria: "\uC811\uC218 \uCE98\uB9B0\uB354 \uB2EB\uAE30",
  openLink: "\uACF5\uAC1C \uD398\uC774\uC815 \uC5F4\uAE30",
};

type ClientSiteRequestCalendarModalProps = {
  open: boolean;
  clientId: number | string;
  clientName: string;
  link: ClientSiteRequestLink | null;
  workers?: WorkerMasterLike[];
  onClose: () => void;
};

export function ClientSiteRequestCalendarModal({
  open,
  clientId,
  clientName,
  link,
  workers = [],
  onClose,
}: ClientSiteRequestCalendarModalProps) {
  const { onPointerDown, onPointerUp, isTouchDevice } = useBackdropPointerDismiss(open, onClose);
  const { guardedClose } = useModalDismissGuard(open);
  const closeModal = () => guardedClose(onClose);
  const [headerLocked, setHeaderLocked] = React.useState(false);

  useLayoutEffect(() => {
    if (!open) {
      setHeaderLocked(false);
      return;
    }
    setHeaderLocked(true);
    const timer = window.setTimeout(() => setHeaderLocked(false), 900);
    return () => window.clearTimeout(timer);
  }, [open]);

  useBodyScrollLock(open);

  const publicUrl = useMemo(() => (link ? resolveClientSiteRequestLinkUrl(link) : ""), [link]);

  if (!open) return null;

  const modal = (
    <div
      className="erp-ledger-modal-backdrop erp-ledger-modal-backdrop--elevated erp-client-request-calendar-modal-backdrop"
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      data-touch-device={isTouchDevice ? "true" : undefined}
    >
      <div
        className="erp-ledger-modal erp-client-request-calendar-modal"
        style={{ padding: 0 }}
        onPointerDown={(event) => event.stopPropagation()}
        onPointerUp={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="client-site-request-calendar-title"
      >
        <div className="erp-client-request-calendar-modal__head flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="client-site-request-calendar-title" className="text-base font-bold text-slate-900 md:text-lg">
              {L.title}
            </h2>
            <p className="mt-1 text-sm font-bold text-slate-700">{clientName}</p>
            {isTouchDevice ? (
              <p className="mt-1 text-xs font-semibold text-slate-500">{"\uB2EB\uC744 \uB54C\uB294 \uC624\uB978\uC0C1\uB2E8 X \uBC84\uD2BC\uC744 \uC0AC\uC6A9\uD558\uC138\uC694."}</p>
            ) : null}
          </div>
          <div
            className={`erp-client-request-calendar-modal__head-actions flex shrink-0 items-center gap-2${headerLocked ? " is-locked" : ""}`}
          >
            {publicUrl ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="erp-client-request-calendar-modal__public-link rounded-xl"
                noFeedback
                onClick={() => openClientSiteRequestLink(publicUrl)}
              >
                <Link2 size={14} className="mr-1" />
                {L.openLink}
              </Button>
            ) : null}
            <button type="button" className="erp-touch-target rounded-xl p-2 text-slate-400 hover:bg-slate-100" onClick={closeModal} aria-label={L.closeAria}>
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="erp-client-request-calendar-modal__body">
          <ClientSiteRequestCalendarPanel
            key={String(clientId)}
            active={open}
            clientId={clientId}
            workers={workers}
            drawerElevated
            fullscreen
          />
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modal, document.body) : modal;
}
