import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ClientMasterLike } from "@/utils/clientMaster";
import { listScScheduleClientContacts } from "@/utils/clientContacts";
import type { ScSchedule } from "@/utils/scSchedules";
import { useBodyScrollLock } from "@/utils/bodyScrollLock";
import {
  buildScScheduleAlimtalkClientContactSelection,
  normalizeScScheduleAlimtalkClientKey,
  saveScScheduleAlimtalkClientContactPref,
  saveScScheduleAlimtalkClientContactPrefs,
  scScheduleAlimtalkContactPrefKey,
} from "@/utils/scScheduleAlimtalkRecipientPrefs";

const L = {
  title: "\uC54C\uB9BC\uD1A1 \uBCF4\uB0B4\uAE30",
  desc: "\uBC1C\uC1A1 \uB300\uC0C1 \uAC70\uB798\uCC98 \uB2F4\uB2F9\uC790\uB97C \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.",
  client: "\uAC70\uB798\uCC98",
  manager: "\uB2F4\uB2F9",
  phone: "\uC804\uD654",
  noPhone: "\uC804\uD654 \uC5C6\uC74C",
  noRecipients: "\uC804\uD654\uBC88\uD638\uAC00 \uC788\uB294 \uB2F4\uB2F9\uC790\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.",
  noneSelected: "\uBC1C\uC1A1\uD560 \uB2F4\uB2F9\uC790\uB97C \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.",
  cancel: "\uCDE8\uC18C",
  send: "\uBCF4\uB0B4\uAE30",
  sending: "\uBC1C\uC1A1 \uC911...",
  selectAll: "\uC804\uCCB4 \uC120\uD0DD",
  primaryBadge: "\u00B7 \uAE30\uBCF8",
};

type ClientSiteRequestAlimtalkSendModalProps = {
  open: boolean;
  schedule: ScSchedule | null;
  clients?: ClientMasterLike[];
  sending?: boolean;
  onClose: () => void;
  onConfirm: (phones: string[]) => void;
};

function contactKey(contactId: string, phoneNormalized: string) {
  return `${contactId}:${phoneNormalized}`;
}

export function ClientSiteRequestAlimtalkSendModal({
  open,
  schedule,
  clients = [],
  sending = false,
  onClose,
  onConfirm,
}: ClientSiteRequestAlimtalkSendModalProps) {
  const contacts = useMemo(
    () => (schedule ? listScScheduleClientContacts(clients, schedule) : []),
    [clients, schedule],
  );
  const reachable = useMemo(() => contacts.filter((row) => row.phoneNormalized), [contacts]);
  const clientKey = useMemo(
    () => normalizeScScheduleAlimtalkClientKey(schedule?.clientId, contacts[0]?.clientName || schedule?.clientName),
    [schedule?.clientId, schedule?.clientName, contacts],
  );
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!open || !clientKey) return;
    setSelected(
      buildScScheduleAlimtalkClientContactSelection(
        clientKey,
        reachable.map((row) => ({
          contactId: row.contactId,
          phoneNormalized: row.phoneNormalized,
          name: row.name,
        })),
      ),
    );
  }, [open, schedule?.id, clientKey, reachable]);

  useBodyScrollLock(open);

  if (!open || !schedule || typeof document === "undefined") return null;

  const clientName =
    reachable[0]?.clientName ||
    String(schedule.clientName || schedule.projectName || schedule.workType || "").trim() ||
    "-";

  const toggle = (row: (typeof contacts)[number], checked: boolean) => {
    const uiKey = contactKey(row.contactId, row.phoneNormalized);
    setSelected((current) => ({ ...current, [uiKey]: checked }));
    if (!clientKey) return;
    saveScScheduleAlimtalkClientContactPref(
      clientKey,
      scScheduleAlimtalkContactPrefKey(row.contactId, row.phoneNormalized, row.name),
      checked,
    );
  };

  const selectAll = () => {
    const next: Record<string, boolean> = {};
    const entries: Array<{ contactKey: string; selected: boolean }> = [];
    for (const row of reachable) {
      const uiKey = contactKey(row.contactId, row.phoneNormalized);
      next[uiKey] = true;
      entries.push({
        contactKey: scScheduleAlimtalkContactPrefKey(row.contactId, row.phoneNormalized, row.name),
        selected: true,
      });
    }
    setSelected(next);
    if (clientKey) saveScScheduleAlimtalkClientContactPrefs(clientKey, entries);
  };

  const handleConfirm = () => {
    const phones = reachable
      .filter((row) => selected[contactKey(row.contactId, row.phoneNormalized)])
      .map((row) => row.phoneNormalized);
    if (!phones.length) {
      window.alert(L.noneSelected);
      return;
    }
    if (clientKey) {
      saveScScheduleAlimtalkClientContactPrefs(
        clientKey,
        reachable.map((row) => ({
          contactKey: scScheduleAlimtalkContactPrefKey(row.contactId, row.phoneNormalized, row.name),
          selected: Boolean(selected[contactKey(row.contactId, row.phoneNormalized)]),
        })),
      );
    }
    onConfirm(phones);
  };

  return createPortal(
    <div className="erp-ledger-modal-backdrop erp-csr-cal-alimtalk-modal-backdrop" onClick={onClose}>
      <div
        className="erp-ledger-modal erp-csr-cal-alimtalk-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="csr-alimtalk-send-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="csr-alimtalk-send-title" className="text-base font-bold text-slate-900">
              {L.title}
            </h2>
            <p className="mt-1 text-sm text-slate-600">{L.desc}</p>
            <p className="mt-2 text-sm font-semibold text-slate-800">
              {L.client}: {clientName}
            </p>
          </div>
          <button type="button" className="rounded-xl p-2 text-slate-400 hover:bg-slate-100" onClick={onClose} aria-label={L.cancel}>
            <X size={18} />
          </button>
        </div>

        {reachable.length === 0 ? (
          <p className="rounded-xl bg-red-50 px-3 py-3 text-sm font-semibold text-red-700">{L.noRecipients}</p>
        ) : (
          <>
            <div className="mb-2 flex justify-end">
              <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={selectAll}>
                {L.selectAll}
              </Button>
            </div>
            <ul className="space-y-2">
              {contacts.map((row) => {
                const key = contactKey(row.contactId, row.phoneNormalized);
                const disabled = !row.phoneNormalized;
                return (
                  <li key={key}>
                    <label
                      className={`erp-csr-cal-alimtalk-contact-row${
                        disabled ? " is-disabled" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={Boolean(selected[key])}
                        disabled={disabled || sending}
                                onChange={(event) => toggle(row, event.target.checked)}
                      />
                      <span className="erp-csr-cal-alimtalk-contact-body">
                        <span className="erp-csr-cal-alimtalk-contact-name">
                          {row.name || "-"}
                          {row.isPrimary ? (
                            <span className="erp-csr-cal-alimtalk-contact-primary">{L.primaryBadge.trim()}</span>
                          ) : null}
                        </span>
                        <span className="erp-csr-cal-alimtalk-contact-phone">
                          {L.phone}: {row.phoneDisplay || L.noPhone}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" className="rounded-xl" onClick={onClose} disabled={sending}>
            {L.cancel}
          </Button>
          <Button type="button" className="rounded-xl" onClick={handleConfirm} disabled={sending || reachable.length === 0}>
            {sending ? L.sending : L.send}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
