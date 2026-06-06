import React, { memo, useEffect, useState } from "react";
import { X } from "lucide-react";
import { AutocompleteSelect } from "@/components/AutocompleteInput";
import { Button } from "@/components/ui/button";
import type { AccountCodeAutocompleteOption } from "@/utils/accountCodeTree";

export type AccountSubjectEditModalLabels = {
  title: string;
  accountSubject: string;
  placeholder: string;
  cancel: string;
  save: string;
  required: string;
};

type AccountSubjectEditModalProps = {
  txId: string;
  initialDraft: string;
  options: AccountCodeAutocompleteOption[];
  labels: AccountSubjectEditModalLabels;
  onSave: (accountCode: string) => void;
  onClose: () => void;
};

export const AccountSubjectEditModal = memo(function AccountSubjectEditModal({
  txId,
  initialDraft,
  options,
  labels,
  onSave,
  onClose,
}: AccountSubjectEditModalProps) {
  const [draft, setDraft] = useState(initialDraft);
  const [error, setError] = useState("");

  useEffect(() => {
    setDraft(initialDraft);
    setError("");
  }, [txId, initialDraft]);

  const handleSave = () => {
    const accountCode = draft.trim();
    if (!accountCode) {
      setError(labels.required);
      return;
    }
    onSave(accountCode);
  };

  return (
    <div
      className="erp-ledger-modal-backdrop erp-ledger-modal-backdrop--elevated"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="erp-ledger-modal max-w-lg"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={labels.title}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="erp-text-section font-bold">{labels.title}</h2>
          <button
            type="button"
            className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"
            onClick={onClose}
            aria-label={labels.cancel}
          >
            <X size={18} />
          </button>
        </div>
        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-slate-700">{labels.accountSubject}</span>
          <AutocompleteSelect
            value={draft}
            options={options}
            placeholder={labels.placeholder}
            compact={false}
            onChange={(value) => {
              setError("");
              setDraft(value);
            }}
            renderSub={(raw) => {
              const item = raw as AccountCodeAutocompleteOption | null;
              return item?.parentGroup || "";
            }}
            inputProps={{ className: "rounded-xl" }}
          />
        </label>
        {error ? <p className="mt-3 text-sm font-semibold text-red-600">{error}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" className="rounded-2xl" onClick={onClose}>
            {labels.cancel}
          </Button>
          <Button type="button" className="rounded-2xl" onClick={handleSave}>
            {labels.save}
          </Button>
        </div>
      </div>
    </div>
  );
});
