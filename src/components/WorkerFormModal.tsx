import React, { memo } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuditField } from "@/components/AuditField";
import { KoreanDateInput } from "@/components/KoreanDateInput";
import { useBodyScrollLock } from "@/utils/bodyScrollLock";
import { WORKER_CATEGORY_OPTIONS } from "@/utils/workerPayments";

const WORKER_GRADE_OPTIONS = ["S", "A", "B", "C", "D", "E"];

const L = {
  editTitle: "\uC2DC\uACF5\uC790 \uC218\uC815",
  createTitle: "\uC2DC\uACF5\uC790 \uB4F1\uB85D",
  close: "\uB2EB\uAE30",
  reset: "\uCD08\uAE30\uD654",
  save: "\uC2DC\uACF5\uC790 \uC218\uC815",
  create: "\uC2DC\uACF5\uC790 \uC800\uC7A5",
  nameLabel: "\uC2DC\uACF5\uC790\uBA85",
  namePh: "\uC2DC\uACF5\uC790\uBA85 (\uD544\uC218)",
  depositAliasesPh: "\uD1B5\uC7A5 \uC785\u00B7\uCD9C\uAE08 \uC2DC \uD45C\uC2DC \uC774\uB984 (\uC27C\uD45C \uAD6C\uB3C4)",
  businessNoPh: "123-45-67890",
  vehicleNoPh: "12\uAC003456",
  constructionCostPh: "\uC2DC\uACF5\uBE44 (\uD544\uC218)",
  customChargeCostPh: "\uBE44\uC6CC\uB450\uBA74 \uAC70\uB798\uCC98 \uAE30\uBCF8\uB2E8\uAC00 \uC801\uC6A9",
  overtimeCostPh: "\uC57C\uADFC\uBE44",
  feeRatePh: "10",
  portalLoginIdPh: "\uC601\uBB38\u00B7\uC22B\uC790 (\uC608: kim123)",
  portalPasswordCreatePh: "\uCD08\uAE30 \uBE44\uBC00\uBC88\uD638",
  portalPasswordEditPh: "\uBCC0\uACBD \uC2DC\uC5D0\uB9CC \uC785\uB825",
  portalHint:
    "\uC2DC\uACF5\uC790\uAC00 \uB85C\uADF8\uC778 \uD654\uBA74 \u300C\uC2DC\uACF5\uB0B4\uC5ED\uC11C\u300D \uD0ED\uC5D0\uC11C \uBCF8\uC778 \uC6D4\uBCC4 \uC2DC\uACF5\uB0B4\uC5ED\uC11C\uB97C \uC870\uD68C\uD560 \uB54C \uC0AC\uC6A9\uD569\uB2C8\uB2E4. \uBE44\uBC00\uBC88\uD638\uB294 \uC800\uC7A5 \uD6C4 \uC11C\uBC84\uC5D0\uB9CC \uC554\uD638\uD654\uB418\uC5B4 \uBCF4\uAD00\uB429\uB2C8\uB2E4.",
  gradeLabel: "\uC2DC\uACF5\uB4F1\uAE09",
  gradeNone: "\uC120\uD0DD \uC548 \uD568",
  categoryLabel: "\uAD6C\uBD84",
  hireDateLabel: "\uC785\uC0AC\uC77C",
  bankLabel: "\uC740\uD589\uBA85",
  bankPh: "\uC740\uD589\uBA85",
  accountLabel: "\uACC4\uC88C\uBC88\uD638",
  accountPh: "\uACC4\uC88C\uBC88\uD638",
  depositAliasesLabel: "\uC608\uAE08\uC8FC \uBCC4\uCE6D",
  phoneLabel: "\uC5F0\uB77D\uCC98",
  phonePh: "\uC5F0\uB77D\uCC98",
  businessNoLabel: "\uC0AC\uC5C5\uC790\uB4F1\uB85D\uBC88\uD638",
  vehicleNoLabel: "\uCC28\uB7C9\uBC88\uD638",
  addressLabel: "\uC8FC\uC18C",
  addressPh: "\uC8FC\uC18C",
  constructionCostLabel: "\uC2DC\uACF5\uBE44",
  customChargeCostLabel: "\uAC1C\uBCC4\uCCAD\uAD6C\uB2E8\uAC00",
  overtimeCostLabel: "\uC57C\uADFC\uBE44",
  feeRateLabel: "\uC218\uC218\uB8CC\uC728(%)",
  memoLabel: "\uBE44\uACE0",
  memoPh: "\uBE44\uACE0",
  portalLoginIdLabel: "\uD3EC\uD138 \uB85C\uADF8\uC778 ID",
  portalPasswordLabel: "\uD3EC\uD138 \uBE44\uBC00\uBC88\uD638",
};

export type WorkerFormState = {
  name: string;
  grade: string;
  category: string;
  hireDate: string;
  bank: string;
  account: string;
  phone: string;
  businessNo: string;
  address: string;
  vehicleNo: string;
  constructionCost: string;
  customChargeCost: string;
  overtimeCost: string;
  feeRate: string;
  depositNameAliases: string;
  memo: string;
  portalLoginId: string;
  portalPassword: string;
};

export function createEmptyWorkerForm(): WorkerFormState {
  return {
    name: "",
    grade: "",
    category: "\uD300\uC6D0",
    hireDate: "",
    bank: "",
    account: "",
    phone: "",
    businessNo: "",
    address: "",
    vehicleNo: "",
    constructionCost: "",
    customChargeCost: "",
    overtimeCost: "30000",
    feeRate: "10",
    depositNameAliases: "",
    memo: "",
    portalLoginId: "",
    portalPassword: "",
  };
}

type WorkerFormModalProps = {
  open: boolean;
  editingId: number | string | null;
  form: WorkerFormState;
  formError: string;
  onClose: () => void;
  onSave: () => void;
  onReset: () => void;
  onUpdate: (key: keyof WorkerFormState, value: WorkerFormState[keyof WorkerFormState]) => void;
};

export const WorkerFormModal = memo(function WorkerFormModal({
  open,
  editingId,
  form,
  formError,
  onClose,
  onSave,
  onReset,
  onUpdate,
}: WorkerFormModalProps) {
  useBodyScrollLock(open);

  if (!open) return null;

  return (
    <div className="erp-ledger-modal-backdrop" onClick={onClose}>
      <div
        className="erp-ledger-modal erp-ledger-modal--client-form overflow-y-auto"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="worker-form-modal-title"
        lang="ko"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id="worker-form-modal-title" className="erp-text-section font-bold">
            {editingId ? L.editTitle : L.createTitle}
          </h2>
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
          <AuditField label={L.nameLabel} entityType="worker" entityId={editingId} field="name">
            <Input value={form.name} onChange={(e) => onUpdate("name", e.target.value)} placeholder={L.namePh} required />
          </AuditField>
          <AuditField label={L.gradeLabel} entityType="worker" entityId={editingId} field="grade">
            <select
              className="erp-input w-full rounded-xl px-3 py-2 text-sm font-semibold"
              value={form.grade}
              onChange={(e) => onUpdate("grade", e.target.value)}
            >
              <option value="">{L.gradeNone}</option>
              {WORKER_GRADE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </AuditField>
          <AuditField label={L.categoryLabel} entityType="worker" entityId={editingId} field="category">
            <select
              className="erp-input w-full rounded-xl px-3 py-2 text-sm font-semibold"
              value={form.category}
              onChange={(e) => onUpdate("category", e.target.value)}
              required
            >
              {WORKER_CATEGORY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </AuditField>
          <AuditField label={L.hireDateLabel} entityType="worker" entityId={editingId} field="hireDate">
            <KoreanDateInput
              className="erp-input w-full rounded-xl px-3 py-2 text-sm font-semibold"
              value={form.hireDate}
              onChange={(e) => onUpdate("hireDate", e.target.value)}
            />
          </AuditField>
          <AuditField label={L.bankLabel} entityType="worker" entityId={editingId} field="bank">
            <Input value={form.bank} onChange={(e) => onUpdate("bank", e.target.value)} placeholder={L.bankPh} />
          </AuditField>
          <AuditField label={L.accountLabel} entityType="worker" entityId={editingId} field="account">
            <Input value={form.account} onChange={(e) => onUpdate("account", e.target.value)} placeholder={L.accountPh} />
          </AuditField>
          <div className="sm:col-span-2">
            <AuditField label={L.depositAliasesLabel} entityType="worker" entityId={editingId} field="depositNameAliases">
              <Input
                value={form.depositNameAliases}
                onChange={(e) => onUpdate("depositNameAliases", e.target.value)}
                placeholder={L.depositAliasesPh}
              />
            </AuditField>
          </div>
          <AuditField label={L.phoneLabel} entityType="worker" entityId={editingId} field="phone">
            <Input value={form.phone} onChange={(e) => onUpdate("phone", e.target.value)} placeholder={L.phonePh} />
          </AuditField>
          <AuditField label={L.businessNoLabel} entityType="worker" entityId={editingId} field="businessNo">
            <Input
              value={form.businessNo}
              onChange={(e) => onUpdate("businessNo", e.target.value)}
              placeholder={L.businessNoPh}
            />
          </AuditField>
          <AuditField label={L.vehicleNoLabel} entityType="worker" entityId={editingId} field="vehicleNo">
            <Input
              value={form.vehicleNo}
              onChange={(e) => onUpdate("vehicleNo", e.target.value)}
              placeholder={L.vehicleNoPh}
            />
          </AuditField>
          <div className="sm:col-span-2 xl:col-span-4">
            <AuditField label={L.addressLabel} entityType="worker" entityId={editingId} field="address">
              <Input value={form.address} onChange={(e) => onUpdate("address", e.target.value)} placeholder={L.addressPh} />
            </AuditField>
          </div>
          <AuditField label={L.constructionCostLabel} entityType="worker" entityId={editingId} field="constructionCost">
            <Input
              inputMode="numeric"
              value={form.constructionCost}
              onChange={(e) => onUpdate("constructionCost", e.target.value)}
              placeholder={L.constructionCostPh}
              required
            />
          </AuditField>
          <AuditField label={L.customChargeCostLabel} entityType="worker" entityId={editingId} field="customChargeCost">
            <Input
              inputMode="numeric"
              value={form.customChargeCost}
              onChange={(e) => onUpdate("customChargeCost", e.target.value)}
              placeholder={L.customChargeCostPh}
            />
          </AuditField>
          <AuditField label={L.overtimeCostLabel} entityType="worker" entityId={editingId} field="overtimeCost">
            <Input
              inputMode="numeric"
              value={form.overtimeCost}
              onChange={(e) => onUpdate("overtimeCost", e.target.value)}
              placeholder={L.overtimeCostPh}
            />
          </AuditField>
          <AuditField label={L.feeRateLabel} entityType="worker" entityId={editingId} field="feeRate">
            <Input
              inputMode="decimal"
              value={form.feeRate}
              onChange={(e) => onUpdate("feeRate", e.target.value)}
              placeholder={L.feeRatePh}
            />
          </AuditField>
          <div className="md:col-span-1">
            <AuditField label={L.memoLabel} entityType="worker" entityId={editingId} field="memo">
              <Input value={form.memo} onChange={(e) => onUpdate("memo", e.target.value)} placeholder={L.memoPh} />
            </AuditField>
          </div>
          <AuditField label={L.portalLoginIdLabel} entityType="worker" entityId={editingId} field="portalLoginId">
            <Input
              value={form.portalLoginId}
              onChange={(e) => onUpdate("portalLoginId", e.target.value.replace(/[^a-zA-Z0-9]/gi, "").toLowerCase())}
              placeholder={L.portalLoginIdPh}
              autoComplete="off"
            />
          </AuditField>
          <AuditField label={L.portalPasswordLabel} entityType="worker" entityId={editingId} field="portalPassword">
            <Input
              type="password"
              value={form.portalPassword}
              onChange={(e) => onUpdate("portalPassword", e.target.value)}
              placeholder={editingId ? L.portalPasswordEditPh : L.portalPasswordCreatePh}
              autoComplete="new-password"
            />
          </AuditField>
          <div className="sm:col-span-2 xl:col-span-4">
            <p className="erp-text-caption text-slate-500">{L.portalHint}</p>
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
  );
});
