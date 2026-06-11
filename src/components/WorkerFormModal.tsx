import React, { memo, useMemo } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuditField } from "@/components/AuditField";
import { KoreanDateInput } from "@/components/KoreanDateInput";
import { useBodyScrollLock } from "@/utils/bodyScrollLock";
import { formatKRW } from "@/utils/receivables";
import {
  DEFAULT_WORKER_AI_RULES,
  normalizeWorkerAiRules,
  resolveEffectiveProbationPay,
  resolveEffectiveProbationPayWithVat,
  resolveEffectivePostProbationValues,
  resolveWorkerAiProbationFinalPay,
  type WorkerAiRules,
} from "@/utils/workerAiRules";
import { isWorkerInProbationPeriod } from "@/utils/workerProbationAutoAdjust";
import { WORKER_CATEGORY_OPTIONS } from "@/utils/workerPayments";
import { WorkerPhotoField } from "@/components/WorkerPhotoField";
import { calculateWorkerPaymentVat } from "@/utils/workerMonthlyPayments";

const WORKER_GRADE_OPTIONS = ["S", "A", "B", "C", "D", "E"];
const POST_PROBATION_GRADE_OPTIONS = ["S", "A", "B", "C", "D"];

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
  gradeProbationHint: "\uC218\uC2B5 \uAE30\uAC04 \uC911\uC774\uBBC0\uB85C E\uB4F1\uAE09\uC774 \uACE0\uC815\uB429\uB2C8\uB2E4.",
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
  probationSectionTitle: "\uAC1C\uBCC4 \uC218\uC2B5 \uC124\uC815",
  probationSectionBody:
    "\uBE44\uC6CC \uB450\uBA74 \uC804\uC5ED AI \uADDC\uCE59\uC774 \uAE30\uBCF8\uAC12\uC785\uB2C8\uB2E4. \uAC1C\uBCC4 \uAC12\uC744 \uC785\uB825\uD558\uBA74 \uD574\uB2F9 \uC2DC\uACF5\uC790\uC5D0\uB9CC \uC801\uC6A9\uB429\uB2C8\uB2E4.",
  probationNetPayLabel: "\uC218\uC2B5 \uC6D4\uAE09 (\uC6D0)",
  probationNetPayPh: (amount: string) => `\uC804\uC5ED \uAE30\uBCF8 ${amount}`,
  probationPayWithVatLabel: "\uC218\uC2B5 \uBD80\uAC00\uC138 \uD3EC\uD7A8",
  probationPayWithVatUseGlobal: "\uC804\uC5ED \uADDC\uCE59 \uC0AC\uC6A9",
  probationPayWithVatHint: (amount: string) => `\uBD80\uAC00\uC138 10% \uD3EC\uD7A8 (${amount})`,
  postProbationConstructionCostLabel: "\uC218\uC2B5 \uC885\uB8CC \uC2DC\uACF5\uBE44 (\uC6D0)",
  postProbationConstructionCostPh: (amount: string) => `\uC804\uC5ED \uAE30\uBCF8 ${amount}`,
  postProbationCustomChargeCostLabel: "\uC218\uC2B5 \uC885\uB8CC \uAC1C\uBCC4\uCCAD\uAD6C\uB2E8\uAC00 (\uC6D0)",
  postProbationCustomChargeCostPh: (amount: string) => `\uC804\uC5ED \uAE30\uBCF8 ${amount}`,
  postProbationGradeLabel: "\uC218\uC2B5 \uC885\uB8CC \uB4F1\uAE09",
  postProbationGradeNone: "\uC804\uC5ED \uADDC\uCE59 \uC0AC\uC6A9",
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
  probationNetPay: string;
  probationPayWithVatUseGlobal: boolean;
  probationPayWithVat: boolean;
  postProbationConstructionCost: string;
  postProbationCustomChargeCost: string;
  postProbationGrade: string;
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
    probationNetPay: "",
    probationPayWithVatUseGlobal: true,
    probationPayWithVat: DEFAULT_WORKER_AI_RULES.probationPayWithVat,
    postProbationConstructionCost: "",
    postProbationCustomChargeCost: "",
    postProbationGrade: "",
  };
}

type WorkerFormModalProps = {
  open: boolean;
  editingId: number | string | null;
  form: WorkerFormState;
  formError: string;
  workerAiRules?: WorkerAiRules;
  onClose: () => void;
  onSave: () => void;
  onReset: () => void;
  onUpdate: (key: keyof WorkerFormState, value: WorkerFormState[keyof WorkerFormState]) => void;
  workerPhotoPreviewUrl?: string | null;
  workerPhotoHasSaved?: boolean;
  workerPhotoUploading?: boolean;
  onWorkerPhotoSelect?: (file: File) => void;
  onWorkerPhotoDelete?: () => void;
};

export const WorkerFormModal = memo(function WorkerFormModal({
  open,
  editingId,
  form,
  formError,
  workerAiRules = DEFAULT_WORKER_AI_RULES,
  onClose,
  onSave,
  onReset,
  onUpdate,
  workerPhotoPreviewUrl = null,
  workerPhotoHasSaved = false,
  workerPhotoUploading = false,
  onWorkerPhotoSelect,
  onWorkerPhotoDelete,
}: WorkerFormModalProps) {
  useBodyScrollLock(open);

  const rules = useMemo(() => normalizeWorkerAiRules(workerAiRules), [workerAiRules]);
  const isInProbation = useMemo(
    () => Boolean(form.hireDate && isWorkerInProbationPeriod({ hireDate: form.hireDate }, rules)),
    [form.hireDate, rules],
  );

  const globalProbationNetPay = resolveEffectiveProbationPay(undefined, rules);
  const globalProbationFinalPay = resolveWorkerAiProbationFinalPay(rules);
  const previewProbationNetPay = form.probationNetPay.trim()
    ? Number(String(form.probationNetPay).replace(/[^0-9.-]/g, "")) || globalProbationNetPay
    : globalProbationNetPay;
  const previewPayWithVat = form.probationPayWithVatUseGlobal
    ? resolveEffectiveProbationPayWithVat(undefined, rules)
    : form.probationPayWithVat;
  const previewProbationFinalPay = calculateWorkerPaymentVat(previewProbationNetPay, previewPayWithVat).finalPayAmount;
  const globalPostProbation = resolveEffectivePostProbationValues(undefined, rules);

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

        {onWorkerPhotoSelect ? (
          <WorkerPhotoField
            previewUrl={workerPhotoPreviewUrl}
            hasPhoto={workerPhotoHasSaved || Boolean(workerPhotoPreviewUrl)}
            uploading={workerPhotoUploading}
            createMode={editingId == null}
            onSelectFile={onWorkerPhotoSelect}
            onDelete={onWorkerPhotoDelete}
          />
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <AuditField label={L.nameLabel} entityType="worker" entityId={editingId} field="name">
            <Input value={form.name} onChange={(e) => onUpdate("name", e.target.value)} placeholder={L.namePh} required />
          </AuditField>
          <AuditField label={L.gradeLabel} entityType="worker" entityId={editingId} field="grade">
            <select
              className="erp-input w-full rounded-xl px-3 py-2 text-sm font-semibold"
              value={isInProbation ? "E" : form.grade}
              onChange={(e) => onUpdate("grade", e.target.value)}
              disabled={isInProbation}
            >
              <option value="">{L.gradeNone}</option>
              {WORKER_GRADE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            {isInProbation ? <p className="mt-1 erp-text-caption text-amber-700">{L.gradeProbationHint}</p> : null}
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

          <div className="sm:col-span-2 xl:col-span-4 border-t border-slate-100 pt-4">
            <h3 className="text-sm font-bold text-slate-900">{L.probationSectionTitle}</h3>
            <p className="mt-1 erp-text-caption text-slate-500">{L.probationSectionBody}</p>
          </div>
          <AuditField label={L.probationNetPayLabel} entityType="worker" entityId={editingId} field="probationNetPay">
            <Input
              inputMode="numeric"
              value={form.probationNetPay}
              onChange={(e) => onUpdate("probationNetPay", e.target.value)}
              placeholder={L.probationNetPayPh(formatKRW(globalProbationNetPay))}
            />
          </AuditField>
          <AuditField
            label={L.probationPayWithVatLabel}
            entityType="worker"
            entityId={editingId}
            field="probationPayWithVat"
          >
            <label className="mt-2 inline-flex items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={form.probationPayWithVatUseGlobal}
                onChange={(event) => onUpdate("probationPayWithVatUseGlobal", event.target.checked)}
              />
              {L.probationPayWithVatUseGlobal}
            </label>
            {!form.probationPayWithVatUseGlobal ? (
              <label className="mt-2 inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={form.probationPayWithVat}
                  onChange={(event) => onUpdate("probationPayWithVat", event.target.checked)}
                />
                {L.probationPayWithVatHint(formatKRW(previewProbationFinalPay))}
              </label>
            ) : (
              <p className="mt-2 erp-text-caption text-slate-500">
                {L.probationPayWithVatHint(formatKRW(globalProbationFinalPay))}
              </p>
            )}
          </AuditField>
          <AuditField
            label={L.postProbationConstructionCostLabel}
            entityType="worker"
            entityId={editingId}
            field="postProbationConstructionCost"
          >
            <Input
              inputMode="numeric"
              value={form.postProbationConstructionCost}
              onChange={(e) => onUpdate("postProbationConstructionCost", e.target.value)}
              placeholder={L.postProbationConstructionCostPh(formatKRW(globalPostProbation.postProbationConstructionCost))}
            />
          </AuditField>
          <AuditField
            label={L.postProbationCustomChargeCostLabel}
            entityType="worker"
            entityId={editingId}
            field="postProbationCustomChargeCost"
          >
            <Input
              inputMode="numeric"
              value={form.postProbationCustomChargeCost}
              onChange={(e) => onUpdate("postProbationCustomChargeCost", e.target.value)}
              placeholder={L.postProbationCustomChargeCostPh(formatKRW(globalPostProbation.postProbationCustomChargeCost))}
            />
          </AuditField>
          <AuditField
            label={L.postProbationGradeLabel}
            entityType="worker"
            entityId={editingId}
            field="postProbationGrade"
          >
            <select
              className="erp-input w-full rounded-xl px-3 py-2 text-sm font-semibold"
              value={form.postProbationGrade}
              onChange={(e) => onUpdate("postProbationGrade", e.target.value)}
            >
              <option value="">{L.postProbationGradeNone}</option>
              {POST_PROBATION_GRADE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </AuditField>
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
