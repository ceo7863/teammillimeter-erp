import React, { useState } from "react";
import { FileSearch, FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuditField } from "@/components/AuditField";
import { ClientBusinessRegImportModal } from "@/components/ClientBusinessRegImportModal";
import { ClientContactsEditor } from "@/components/ClientContactsEditor";
import { CLIENT_AUDIT_FIELDS } from "@/utils/auditLog";
import type { ClientContact } from "@/utils/clientContacts";

const YES_NO_OPTIONS = [
  { label: "Y", value: "Y" },
  { label: "N", value: "N" },
];

const L = {
  editTitle: "\uAC70\uB798\uCC98 \uC218\uC815",
  createTitle: "\uAC70\uB798\uCC98 \uB4F1\uB85D",
  editDesc: "\uAC70\uB798\uCC98 \uC815\uBCF4\uB97C \uC218\uC815\uD569\uB2C8\uB2E4.",
  createDesc: "\uC0C8 \uAC70\uB798\uCC98 \uC815\uBCF4\uB97C \uC785\uB825\uD569\uB2C8\uB2E4.",
  close: "\uB2EB\uAE30",
  reset: "\uCD08\uAE30\uD654",
  save: "\uAC70\uB798\uCC98 \uC800\uC7A5",
  create: "\uAC70\uB798\uCC98 \uB4F1\uB85D",
  namePh: "\uAC70\uB798\uCC98\uBA85 (\uD544\uC218)",
  ceoNamePh: "\uB300\uD45C\uC790\uBA85 (\uC138\uAE08\uACC4\uC0B0\uC11C)",
  emailPh: "\uC138\uAE08\uACC4\uC0B0\uC11C \uBC1C\uC1A1 \uC774\uBA54\uC77C",
  addressPh: "\uC0AC\uC5C5\uC7A5 \uC8FC\uC18C (\uC138\uAE08\uACC4\uC0B0\uC11C)",
  constructionCostPh: "\uC2DC\uACF5\uBE44 (\uD544\uC218)",
  customChargeCostLabel: "\uAC1C\uBCC4\uCCAD\uAD6C\uB2E8\uAC00(\uC120\uD0DD)",
  customChargeCostPh: "\uD2B9\uC815 \uAC70\uB798\uCC98\uB9CC \uBCC4\uB3C4 \uCCAD\uAD6C\uC2DC \uC785\uB825",
  depositAliasesPh:
    "\uD1B5\uC7A5 \uC785\uAE08 \uC2DC \uD45C\uC2DC \uC774\uB984 (\uC27C\uD45C \uAD6C\uB3C4). \uC608\uAE08\uC8FC\uBA85\uC774 \uC790\uB3D9 \uB9E4\uCE69\uB429\uB2C8\uB2E4.",
  taxInvoiceCorpNamePh: "\uBE44\uC6B0\uBA74 \uAC70\uB798\uCC98\uBA85\uC73C\uB85C \uBC1C\uD589 (\uC608: \uC8FC\uC2DD\uD68C\uC0AC OO)",
  memoPh: "\uAC70\uB798\uCC98 \uBE44\uACE0",
  importBusinessReg: "\uC0AC\uC5C5\uC790\uB4F1\uB85D\uC99D\uC5D0\uC11C \uAC00\uC838\uC624\uAE30",
  viewBusinessReg: "\uC0AC\uC5C5\uC790\uB4F1\uB85D\uC99D",
};

function clientFieldLabel(key: keyof ClientFormState): string {
  return CLIENT_AUDIT_FIELDS.find((field) => field.key === key)?.label ?? key;
}

export type ClientFormState = {
  name: string;
  taxInvoiceCorpName: string;
  businessNo: string;
  ceoName: string;
  email: string;
  address: string;
  bizType: string;
  bizClass: string;
  manager: string;
  phone: string;
  contacts: ClientContact[];
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
  onUpdate: (key: keyof ClientFormState, value: ClientFormState[keyof ClientFormState]) => void;
  businessRegAvailable?: boolean;
  onOpenBusinessReg?: () => void;
  onImportApply?: (next: ClientFormState, sourceFile: File | null) => void | Promise<void>;
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
  businessRegAvailable = false,
  onOpenBusinessReg,
  onImportApply,
}: ClientFormModalProps) {
  const [importOpen, setImportOpen] = useState(false);

  if (!open) return null;

  return (
    <>
    <div className="erp-ledger-modal-backdrop" onClick={onClose}>
      <div
        className="erp-ledger-modal erp-ledger-modal--client-form overflow-y-auto"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="client-form-modal-title"
        lang="ko"
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 id="client-form-modal-title" className="erp-text-section font-bold">
              {editingId ? L.editTitle : L.createTitle}
            </h2>
            <p className="erp-text-caption mt-1 text-slate-500">{editingId ? L.editDesc : L.createDesc}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-2xl"
                onClick={() => setImportOpen(true)}
              >
                <FileSearch size={14} className="mr-1" />
                {L.importBusinessReg}
              </Button>
              {businessRegAvailable ? (
                <Button type="button" variant="outline" size="sm" className="rounded-2xl" onClick={onOpenBusinessReg}>
                  <FileText size={14} className="mr-1" />
                  {L.viewBusinessReg}
                </Button>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"
            onClick={onClose}
            aria-label={L.close}
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <AuditField label={clientFieldLabel("name")} entityType="client" entityId={editingId} field="name">
            <Input lang="ko" value={form.name} onChange={(e) => onUpdate("name", e.target.value)} placeholder={L.namePh} required />
          </AuditField>
          <AuditField label={clientFieldLabel("taxInvoiceCorpName")} entityType="client" entityId={editingId} field="taxInvoiceCorpName">
            <Input
              lang="ko"
              value={form.taxInvoiceCorpName}
              onChange={(e) => onUpdate("taxInvoiceCorpName", e.target.value)}
              placeholder={L.taxInvoiceCorpNamePh}
            />
          </AuditField>
          <AuditField label={clientFieldLabel("businessNo")} entityType="client" entityId={editingId} field="businessNo">
            <Input lang="ko" value={form.businessNo} onChange={(e) => onUpdate("businessNo", e.target.value)} placeholder={clientFieldLabel("businessNo")} />
          </AuditField>
          <AuditField label={clientFieldLabel("ceoName")} entityType="client" entityId={editingId} field="ceoName">
            <Input lang="ko" value={form.ceoName} onChange={(e) => onUpdate("ceoName", e.target.value)} placeholder={L.ceoNamePh} />
          </AuditField>
          <AuditField label={clientFieldLabel("email")} entityType="client" entityId={editingId} field="email">
            <Input lang="ko" type="email" value={form.email} onChange={(e) => onUpdate("email", e.target.value)} placeholder={L.emailPh} />
          </AuditField>
          <AuditField label={clientFieldLabel("bizType")} entityType="client" entityId={editingId} field="bizType">
            <Input lang="ko" value={form.bizType} onChange={(e) => onUpdate("bizType", e.target.value)} placeholder={clientFieldLabel("bizType")} />
          </AuditField>
          <AuditField label={clientFieldLabel("bizClass")} entityType="client" entityId={editingId} field="bizClass">
            <Input lang="ko" value={form.bizClass} onChange={(e) => onUpdate("bizClass", e.target.value)} placeholder={clientFieldLabel("bizClass")} />
          </AuditField>
          <div className="md:col-span-2">
            <AuditField label={clientFieldLabel("address")} entityType="client" entityId={editingId} field="address">
              <Input lang="ko" value={form.address} onChange={(e) => onUpdate("address", e.target.value)} placeholder={L.addressPh} />
            </AuditField>
          </div>
          <AuditField label={clientFieldLabel("manager")} entityType="client" entityId={editingId} field="manager">
            <ClientContactsEditor
              contacts={form.contacts}
              onChange={(contacts) => onUpdate("contacts", contacts)}
            />
          </AuditField>
          <AuditField label={clientFieldLabel("constructionCost")} entityType="client" entityId={editingId} field="constructionCost">
            <Input
              lang="ko"
              inputMode="numeric"
              value={form.constructionCost}
              onChange={(e) => onUpdate("constructionCost", e.target.value)}
              placeholder={L.constructionCostPh}
              required
            />
          </AuditField>
          <AuditField label={L.customChargeCostLabel} entityType="client" entityId={editingId} field="customChargeCost">
            <Input
              lang="ko"
              inputMode="numeric"
              value={form.customChargeCost}
              onChange={(e) => onUpdate("customChargeCost", e.target.value)}
              placeholder={L.customChargeCostPh}
            />
          </AuditField>
          <AuditField label={clientFieldLabel("overtimeCost")} entityType="client" entityId={editingId} field="overtimeCost">
            <Input
              lang="ko"
              inputMode="numeric"
              value={form.overtimeCost}
              onChange={(e) => onUpdate("overtimeCost", e.target.value)}
              placeholder={clientFieldLabel("overtimeCost")}
            />
          </AuditField>
          <AuditField label={clientFieldLabel("vat")} entityType="client" entityId={editingId} field="vat">
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
          <AuditField label={clientFieldLabel("mealIncluded")} entityType="client" entityId={editingId} field="mealIncluded">
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
            <AuditField label={clientFieldLabel("depositNameAliases")} entityType="client" entityId={editingId} field="depositNameAliases">
              <Input
                lang="ko"
                value={form.depositNameAliases}
                onChange={(e) => onUpdate("depositNameAliases", e.target.value)}
                placeholder={L.depositAliasesPh}
              />
            </AuditField>
          </div>
          <div className="md:col-span-4">
            <AuditField label={clientFieldLabel("memo")} entityType="client" entityId={editingId} field="memo">
              <Input lang="ko" value={form.memo} onChange={(e) => onUpdate("memo", e.target.value)} placeholder={L.memoPh} />
            </AuditField>
          </div>
        </div>

        <div className="mt-5 flex flex-col items-end gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
          {formError ? <p className="mr-auto erp-text-caption font-semibold text-red-600">{formError}</p> : null}
          <Button variant="outline" className="rounded-2xl" onClick={onReset}>
            {L.reset}
          </Button>
          <Button className="rounded-2xl" onClick={onSave}>
            {editingId ? L.save : L.create}
          </Button>
        </div>
      </div>
    </div>
    <ClientBusinessRegImportModal
      open={importOpen}
      form={form}
      editing={Boolean(editingId)}
      onClose={() => setImportOpen(false)}
      onApply={(next, sourceFile) => {
        void (async () => {
          if (onImportApply) {
            await onImportApply(next, sourceFile);
          } else {
            (Object.keys(next) as Array<keyof ClientFormState>).forEach((key) => {
              if (next[key] !== form[key]) onUpdate(key, next[key]);
            });
          }
          setImportOpen(false);
        })();
      }}
    />
    </>
  );
}
