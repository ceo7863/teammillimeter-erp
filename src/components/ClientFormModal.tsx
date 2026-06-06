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
              {editingId ? "\uAC70\uB798\uCC98 \uC218\uC815" : "\uAC70\uB798\uCC98 \uB4F1\uB85D"}
            </h2>
            <p className="erp-text-caption mt-1 text-slate-500">
              {editingId
                ? "\uAC70\uB798\uCC98 \uC815\uBCF4\uB97C \uC218\uC815\uD569\uB2C8\uB2E4."
                : "\uC0C8 \uAC70\uB798\uCC98 \uC815\uBCF4\uB97C \uC785\uB825\uD569\uB2C8\uB2E4."}
            </p>
          </div>
          <button
            type="button"
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"
            onClick={onClose}
            aria-label="\uB2EB\uAE30"
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <AuditField label="\uAC70\uB798\uCC98\uBA85" entityType="client" entityId={editingId} field="name">
            <Input
              value={form.name}
              onChange={(e) => onUpdate("name", e.target.value)}
              placeholder="\uAC70\uB798\uCC98\uBA85 (\uD544\uC218)"
              required
            />
          </AuditField>
          <AuditField label="\uC0AC\uC5C5\uC790\uBC88\uD638" entityType="client" entityId={editingId} field="businessNo">
            <Input
              value={form.businessNo}
              onChange={(e) => onUpdate("businessNo", e.target.value)}
              placeholder="\uC0AC\uC5C5\uC790\uBC88\uD638"
            />
          </AuditField>
          <AuditField label="\uB300\uD45C\uC790\uBA85" entityType="client" entityId={editingId} field="ceoName">
            <Input
              value={form.ceoName}
              onChange={(e) => onUpdate("ceoName", e.target.value)}
              placeholder="\uB300\uD45C\uC790\uBA85 (\uC138\uAE08\uACC4\uC0B0\uC11C)"
            />
          </AuditField>
          <AuditField label="\uC774\uBA54\uC77C" entityType="client" entityId={editingId} field="email">
            <Input
              type="email"
              value={form.email}
              onChange={(e) => onUpdate("email", e.target.value)}
              placeholder="\uC138\uAE08\uACC4\uC0B0\uC11C \uBC1C\uC1A1 \uC774\uBA54\uC77C"
            />
          </AuditField>
          <AuditField label="\uC5C5\uD0DC" entityType="client" entityId={editingId} field="bizType">
            <Input value={form.bizType} onChange={(e) => onUpdate("bizType", e.target.value)} placeholder="\uC5C5\uD0DC" />
          </AuditField>
          <AuditField label="\uC5C5\uC885" entityType="client" entityId={editingId} field="bizClass">
            <Input value={form.bizClass} onChange={(e) => onUpdate("bizClass", e.target.value)} placeholder="\uC5C5\uC885" />
          </AuditField>
          <div className="md:col-span-2">
            <AuditField label="\uC8FC\uC18C" entityType="client" entityId={editingId} field="address">
              <Input
                value={form.address}
                onChange={(e) => onUpdate("address", e.target.value)}
                placeholder="\uC0AC\uC5C5\uC7A5 \uC8FC\uC18C (\uC138\uAE08\uACC4\uC0B0\uC11C)"
              />
            </AuditField>
          </div>
          <AuditField label="\uB2F4\uB2F9\uC790" entityType="client" entityId={editingId} field="manager">
            <Input value={form.manager} onChange={(e) => onUpdate("manager", e.target.value)} placeholder="\uB2F4\uB2F9\uC790" />
          </AuditField>
          <AuditField label="\uC5F0\uB77D\uCC98" entityType="client" entityId={editingId} field="phone">
            <Input value={form.phone} onChange={(e) => onUpdate("phone", e.target.value)} placeholder="\uC5F0\uB77D\uCC98" />
          </AuditField>
          <AuditField label="\uC2DC\uACF5\uBE44" entityType="client" entityId={editingId} field="constructionCost">
            <Input
              inputMode="numeric"
              value={form.constructionCost}
              onChange={(e) => onUpdate("constructionCost", e.target.value)}
              placeholder="\uC2DC\uACF5\uBE44 (\uD544\uC218)"
              required
            />
          </AuditField>
          <AuditField label="\uAC1C\uBCC4\uCCAD\uAD6C\uB2E8\uAC00(\uC120\uD0DD)" entityType="client" entityId={editingId} field="customChargeCost">
            <Input
              inputMode="numeric"
              value={form.customChargeCost}
              onChange={(e) => onUpdate("customChargeCost", e.target.value)}
              placeholder="\uD2B9\uC815 \uAC70\uB798\uCC98\uB9CC \uBCC4\uB3C4 \uCCAD\uAD6C\uC2DC \uC785\uB825"
            />
          </AuditField>
          <AuditField label="\uC57C\uADFC\uBE44" entityType="client" entityId={editingId} field="overtimeCost">
            <Input
              inputMode="numeric"
              value={form.overtimeCost}
              onChange={(e) => onUpdate("overtimeCost", e.target.value)}
              placeholder="\uC57C\uADFC\uBE44"
            />
          </AuditField>
          <AuditField label="\uBD80\uAC00\uC138" entityType="client" entityId={editingId} field="vat">
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
          <AuditField label="\uC2DD\uB300" entityType="client" entityId={editingId} field="mealIncluded">
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
            <AuditField label="\uC608\uAE08\uC8FC \uBCC4\uCE59" entityType="client" entityId={editingId} field="depositNameAliases">
              <Input
                value={form.depositNameAliases}
                onChange={(e) => onUpdate("depositNameAliases", e.target.value)}
                placeholder="\uD1B5\uC7A5 \uC785\uAE08 \uC2DC \uD45C\uC2DC \uC774\uB984 (\uC27C\uD45C \uAD6C\uB3C4). \uC608\uAE08\uC8FC\uBA85\uC774 \uC790\uB3D9 \uB9E4\uCE69\uB429\uB2C8\uB2E4."
              />
            </AuditField>
          </div>
          <div className="md:col-span-4">
            <AuditField label="\uBE44\uACE0" entityType="client" entityId={editingId} field="memo">
              <Input
                value={form.memo}
                onChange={(e) => onUpdate("memo", e.target.value)}
                placeholder="\uAC70\uB798\uCC98 \uBE44\uACE0"
              />
            </AuditField>
          </div>
        </div>

        <div className="mt-5 flex flex-col items-end gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
          {formError ? <p className="mr-auto erp-text-caption font-semibold text-red-600">{formError}</p> : null}
          <Button variant="outline" className="rounded-2xl" onClick={onReset}>
            {"\uCD08\uAE30\uD654"}
          </Button>
          <Button className="rounded-2xl" onClick={onSave}>
            {editingId ? "\uAC70\uB798\uCC98 \uC800\uC7A5" : "\uAC70\uB798\uCC98 \uB4F1\uB85D"}
          </Button>
        </div>
      </div>
    </div>
  );
}
