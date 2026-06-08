import React from "react";
import { Plus, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ClientContact } from "@/utils/clientContacts";
import { newClientContactId } from "@/utils/clientContacts";

const L = {
  desc: "\uC54C\uB9BC\uD1A1 \uBC1C\uC1A1 \uB300\uC0C1 \uB2F4\uB2F9\uC790\uB97C \uB4F1\uB85D\uD569\uB2C8\uB2E4.",
  name: "\uB2F4\uB2F9\uC790\uBA85",
  phone: "\uC804\uD654\uBC88\uD638",
  primary: "\uAE30\uBCF8",
  add: "\uB2F4\uB2F9\uC790 \uCD94\uAC00",
  remove: "\uC0AD\uC81C",
  namePh: "\uB2F4\uB2F9\uC790\uBA85",
  phonePh: "010-0000-0000",
};

type ClientContactsEditorProps = {
  contacts: ClientContact[];
  onChange: (contacts: ClientContact[]) => void;
};

export function ClientContactsEditor({ contacts, onChange }: ClientContactsEditorProps) {
  const rows = contacts.length ? contacts : [{ id: newClientContactId(), name: "", phone: "", isPrimary: true }];

  const updateRow = (index: number, patch: Partial<ClientContact>) => {
    onChange(rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  };

  const setPrimary = (index: number) => {
    onChange(rows.map((row, rowIndex) => ({ ...row, isPrimary: rowIndex === index })));
  };

  const removeRow = (index: number) => {
    const next = rows.filter((_, rowIndex) => rowIndex !== index);
    if (!next.length) {
      onChange([{ id: newClientContactId(), name: "", phone: "", isPrimary: true }]);
      return;
    }
    if (!next.some((row) => row.isPrimary)) next[0] = { ...next[0], isPrimary: true };
    onChange(next);
  };

  const addRow = () => {
    onChange([...rows, { id: newClientContactId(), name: "", phone: "", isPrimary: false }]);
  };

  return (
    <div className="erp-client-contacts-editor">
      <p className="erp-client-contacts-editor-desc">{L.desc}</p>
      <div className="erp-client-contacts-editor-list">
        {rows.map((row, index) => (
          <div key={row.id} className="erp-client-contacts-editor-row">
            <div className="erp-client-contacts-editor-fields">
              <label className="erp-client-contacts-editor-field">
                <span className="erp-client-contacts-editor-label">{L.name}</span>
                <Input
                  lang="ko"
                  value={row.name}
                  onChange={(event) => updateRow(index, { name: event.target.value })}
                  placeholder={L.namePh}
                />
              </label>
              <label className="erp-client-contacts-editor-field erp-client-contacts-editor-field--phone">
                <span className="erp-client-contacts-editor-label">{L.phone}</span>
                <Input
                  lang="ko"
                  inputMode="tel"
                  autoComplete="tel"
                  value={row.phone}
                  onChange={(event) => updateRow(index, { phone: event.target.value })}
                  placeholder={L.phonePh}
                />
              </label>
            </div>
            <div className="erp-client-contacts-editor-actions">
              <Button
                type="button"
                variant={row.isPrimary ? "default" : "outline"}
                size="sm"
                className="h-10 shrink-0 rounded-xl px-3 text-xs"
                onClick={() => setPrimary(index)}
                title={L.primary}
              >
                <Star size={14} className={row.isPrimary ? "mr-1 fill-current" : "mr-1"} />
                {L.primary}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-10 shrink-0 rounded-xl px-3 text-xs"
                onClick={() => removeRow(index)}
                disabled={rows.length === 1}
                aria-label={L.remove}
              >
                <Trash2 size={14} />
              </Button>
            </div>
          </div>
        ))}
      </div>
      <Button type="button" variant="outline" size="sm" className="mt-2 rounded-xl" onClick={addRow}>
        <Plus size={14} className="mr-1" />
        {L.add}
      </Button>
    </div>
  );
}
