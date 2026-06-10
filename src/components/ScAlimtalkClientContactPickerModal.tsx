import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ClientMasterLike } from "@/utils/clientMaster";
import { listScScheduleClientContacts } from "@/utils/clientContacts";
import { useBodyScrollLock } from "@/utils/bodyScrollLock";
import {
  buildScScheduleAlimtalkClientContactSelection,
  normalizeScScheduleAlimtalkClientKey,
  saveScScheduleAlimtalkClientContactPrefs,
  scScheduleAlimtalkContactPrefKey,
} from "@/utils/scScheduleAlimtalkRecipientPrefs";

const L = {
  title: "\uC5C5\uCCB4\uB2F4\uB2F9",
  desc: "\uC54C\uB9BC\uD1A1 \uBC1C\uC1A1 \uB300\uC0C1 \uAC70\uB798\uCC98 \uB2F4\uB2F9\uC790\uB97C \uC120\uD0DD\uD574 \uC8FC\uC138\uC694. \uC800\uC7A5\uD55C \uC120\uD0DD\uC740 \uB2E4\uC74C\uC5D0\uB3C4 \uAE30\uC5B5\uB429\uB2C8\uB2E4.",
  client: "\uAC70\uB798\uCC98",
  phone: "\uC804\uD654",
  noPhone: "\uC804\uD654 \uC5C6\uC74C",
  noContacts: "\uB4F1\uB85D\uB41C \uAC70\uB798\uCC98 \uB2F4\uB2F9\uC790\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.",
  cancel: "\uCDE8\uC18C",
  save: "\uC800\uC7A5",
  selectAll: "\uC804\uCCB4 \uC120\uD0DD",
  primaryBadge: "\u00B7 \uAE30\uBCF8",
};

type ScAlimtalkClientContactPickerModalProps = {
  open: boolean;
  clientId?: string | number | null;
  clientName: string;
  clients?: ClientMasterLike[];
  onClose: () => void;
  onSaved: () => void;
};

function contactUiKey(contactId: string, phoneNormalized: string) {
  return `${contactId}:${phoneNormalized}`;
}

export function ScAlimtalkClientContactPickerModal({
  open,
  clientId,
  clientName,
  clients = [],
  onClose,
  onSaved,
}: ScAlimtalkClientContactPickerModalProps) {
  const scheduleStub = useMemo(
    () => ({
      clientId,
      clientName,
      projectName: clientName,
    }),
    [clientId, clientName],
  );

  const contacts = useMemo(
    () => listScScheduleClientContacts(clients, scheduleStub),
    [clients, scheduleStub],
  );

  const reachable = useMemo(() => contacts.filter((row) => row.phoneNormalized), [contacts]);

  const clientKey = useMemo(
    () => normalizeScScheduleAlimtalkClientKey(clientId, contacts[0]?.clientName || clientName),
    [clientId, clientName, contacts],
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
  }, [open, clientKey, reachable]);

  useBodyScrollLock(open);

  if (!open || typeof document === "undefined") return null;

  const displayClientName = contacts[0]?.clientName || clientName || "-";

  const toggle = (row: (typeof contacts)[number], checked: boolean) => {
    if (!row.phoneNormalized) return;
    const uiKey = contactUiKey(row.contactId, row.phoneNormalized);
    setSelected((current) => ({ ...current, [uiKey]: checked }));
  };

  const selectAll = () => {
    const next: Record<string, boolean> = {};
    for (const row of reachable) {
      next[contactUiKey(row.contactId, row.phoneNormalized)] = true;
    }
    setSelected(next);
  };

  const handleSave = () => {
    if (!clientKey) {
      onClose();
      return;
    }
    saveScScheduleAlimtalkClientContactPrefs(
      clientKey,
      contacts.map((row) => ({
        contactKey: scScheduleAlimtalkContactPrefKey(row.contactId, row.phoneNormalized, row.name),
        selected: row.phoneNormalized
          ? Boolean(selected[contactUiKey(row.contactId, row.phoneNormalized)])
          : false,
      })),
    );
    onSaved();
    onClose();
  };

  return createPortal(
    <div className="erp-ledger-modal-backdrop erp-csr-cal-alimtalk-modal-backdrop" onClick={onClose}>
      <div
        className="erp-ledger-modal erp-csr-cal-alimtalk-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sc-alimtalk-client-contact-picker-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="sc-alimtalk-client-contact-picker-title" className="text-base font-bold text-slate-900">
              {L.title}
            </h2>
            <p className="mt-1 text-sm text-slate-600">{L.desc}</p>
            <p className="mt-2 text-sm font-semibold text-slate-800">
              {L.client}: {displayClientName}
            </p>
          </div>
          <button type="button" className="rounded-xl p-2 text-slate-400 hover:bg-slate-100" onClick={onClose} aria-label={L.cancel}>
            <X size={18} />
          </button>
        </div>

        {contacts.length === 0 ? (
          <p className="rounded-xl bg-red-50 px-3 py-3 text-sm font-semibold text-red-700">{L.noContacts}</p>
        ) : (
          <>
            {reachable.length > 0 ? (
              <div className="mb-2 flex justify-end">
                <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={selectAll}>
                  {L.selectAll}
                </Button>
              </div>
            ) : null}
            <ul className="space-y-2">
              {contacts.map((row) => {
                const uiKey = contactUiKey(row.contactId, row.phoneNormalized);
                const disabled = !row.phoneNormalized;
                return (
                  <li key={uiKey}>
                    <label
                      className={`erp-csr-cal-alimtalk-contact-row${disabled ? " is-disabled" : ""}`}
                    >
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={Boolean(selected[uiKey])}
                        disabled={disabled}
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
          <Button type="button" variant="outline" className="rounded-xl" onClick={onClose}>
            {L.cancel}
          </Button>
          <Button type="button" className="rounded-xl" onClick={handleSave} disabled={contacts.length === 0}>
            {L.save}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
