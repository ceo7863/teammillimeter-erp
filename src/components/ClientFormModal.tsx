import React from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuditField } from "@/components/AuditField";

const YES_NO_OPTIONS = [
  { label: "Y", value: "Y" },
  { label: "N", value: "N" },
];

export type ClientFormState = {
  name: string;
  businessNo: string;
  ceoName: string;
  email: string;
  address: string;
  bizType: string;
  bizClass: string;
  manager: string;
  phone: string;
  constructionCost: string;
  overtimeCost: string;
  vat: string;
  mealIncluded: string;
  depositNameAliases: string;
  customChargeCost: string;
  memo: string;
};

type ClientFormModalProps = {
  open: boolean;
  editingId: number | string | null;
  form: ClientFormState;
  formError: string;
  onClose: () => void;
  onSave: () => void;
  onReset: () => void;
  onUpdate: (key: keyof ClientFormState, value: string) => void;
};

export function ClientFormModal({
  open,
  editingId,
  form,
  formError,
  onClose,
  onSave,
  onReset,
  onUpdate,
}: ClientFormModalProps) {
  if (!open) return null;

  return (
    <div className="erp-ledger-modal-backdrop" onClick={onClose}>
      <div
        className="erp-ledger-modal erp-client-form-modal max-h-[92vh] max-w-5xl overflow-y-auto"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="client-form-modal-title"
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 id="client-form-modal-title" className="erp-text-section font-bold">
              {editingId ? "??? ??" : "??? ??"}
            </h2>
            <p className="erp-text-caption mt-1 text-slate-500">
              {editingId ? "??? ??? ??? ?????." : "? ??? ??? ??? ???."}
            </p>
          </div>
          <button
            type="button"
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"
            onClick={onClose}
            aria-label="??"
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <AuditField label="????" entityType="client" entityId={editingId} field="name">
            <Input value={form.name} onChange={(e) => onUpdate("name", e.target.value)} placeholder="???? (??)" required />
          </AuditField>
          <AuditField label="?????" entityType="client" entityId={editingId} field="businessNo">
            <Input value={form.businessNo} onChange={(e) => onUpdate("businessNo", e.target.value)} placeholder="?????" />
          </AuditField>
          <AuditField label="????" entityType="client" entityId={editingId} field="ceoName">
            <Input value={form.ceoName} onChange={(e) => onUpdate("ceoName", e.target.value)} placeholder="???? (???)" />
          </AuditField>
          <AuditField label="???" entityType="client" entityId={editingId} field="email">
            <Input type="email" value={form.email} onChange={(e) => onUpdate("email", e.target.value)} placeholder="????? ?? ???" />
          </AuditField>
          <AuditField label="??" entityType="client" entityId={editingId} field="bizType">
            <Input value={form.bizType} onChange={(e) => onUpdate("bizType", e.target.value)} placeholder="??" />
          </AuditField>
          <AuditField label="??" entityType="client" entityId={editingId} field="bizClass">
            <Input value={form.bizClass} onChange={(e) => onUpdate("bizClass", e.target.value)} placeholder="??" />
          </AuditField>
          <div className="md:col-span-2">
            <AuditField label="??" entityType="client" entityId={editingId} field="address">
              <Input value={form.address} onChange={(e) => onUpdate("address", e.target.value)} placeholder="??? ?? (???)" />
            </AuditField>
          </div>
          <AuditField label="???" entityType="client" entityId={editingId} field="manager">
            <Input value={form.manager} onChange={(e) => onUpdate("manager", e.target.value)} placeholder="???" />
          </AuditField>
          <AuditField label="???" entityType="client" entityId={editingId} field="phone">
            <Input value={form.phone} onChange={(e) => onUpdate("phone", e.target.value)} placeholder="???" />
          </AuditField>
          <AuditField label="???" entityType="client" entityId={editingId} field="constructionCost">
            <Input inputMode="numeric" value={form.constructionCost} onChange={(e) => onUpdate("constructionCost", e.target.value)} placeholder="??? (??)" required />
          </AuditField>
          <AuditField label="??????(??)" entityType="client" entityId={editingId} field="customChargeCost">
            <Input inputMode="numeric" value={form.customChargeCost} onChange={(e) => onUpdate("customChargeCost", e.target.value)} placeholder="?? ???? ?? ??? ??" />
          </AuditField>
          <AuditField label="???" entityType="client" entityId={editingId} field="overtimeCost">
            <Input inputMode="numeric" value={form.overtimeCost} onChange={(e) => onUpdate("overtimeCost", e.target.value)} placeholder="???" />
          </AuditField>
          <AuditField label="???" entityType="client" entityId={editingId} field="vat">
            <select
              className="erp-input w-full rounded-xl px-3 py-2 text-sm font-semibold"
              value={form.vat}
              onChange={(e) => onUpdate("vat", e.target.value)}
            >
              {YES_NO_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </AuditField>
          <AuditField label="??" entityType="client" entityId={editingId} field="mealIncluded">
            <select
              className="erp-input w-full rounded-xl px-3 py-2 text-sm font-semibold"
              value={form.mealIncluded}
              onChange={(e) => onUpdate("mealIncluded", e.target.value)}
            >
              {YES_NO_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </AuditField>
          <div className="md:col-span-2">
            <AuditField label="??? ??" entityType="client" entityId={editingId} field="depositNameAliases">
              <Input
                value={form.depositNameAliases}
                onChange={(e) => onUpdate("depositNameAliases", e.target.value)}
                placeholder="?? ?? ? ?? ?? (??? ??). ????? ?? ?????."
              />
            </AuditField>
          </div>
          <div className="md:col-span-4">
            <AuditField label="??" entityType="client" entityId={editingId} field="memo">
              <Input value={form.memo} onChange={(e) => onUpdate("memo", e.target.value)} placeholder="??? ??" />
            </AuditField>
          </div>
        </div>

        <div className="mt-5 flex flex-col items-end gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
          {formError ? <p className="mr-auto erp-text-caption font-semibold text-red-600">{formError}</p> : null}
          <Button variant="outline" className="rounded-2xl" onClick={onReset}>
            ???
          </Button>
          <Button className="rounded-2xl" onClick={onSave}>
            {editingId ? "??? ??" : "??? ??"}
          </Button>
        </div>
      </div>
    </div>
  );
}
