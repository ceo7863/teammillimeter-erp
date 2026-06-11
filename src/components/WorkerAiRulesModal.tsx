import { useEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatKRW } from "@/utils/companyLedger";
import {
  DEFAULT_WORKER_AI_RULES,
  normalizeWorkerAiRules,
  resolveWorkerAiProbationFinalPay,
  type WorkerAiRules,
} from "@/utils/workerAiRules";

const POST_PROBATION_GRADE_OPTIONS = ["S", "A", "B", "C", "D"];

const L = {
  title: "\uC2E0\uC785 AI \uADDC\uCE59",
  subtitle:
    "E\uB4F1\uAE09 \uC218\uC2B5\uAE30\uAC04 \uC6D4\uAE09\uACFC \uC218\uC2B5 \uC885\uB8CC \uD6C4 \uC790\uB3D9 \uC870\uC815 \uAE30\uBCF8\uAC12\uC744 \uC124\uC815\uD569\uB2C8\uB2E4. \uAC1C\uBCC4 \uC2DC\uACF5\uC790 \uC218\uC815 \uD654\uBA74\uC5D0\uC11C \uC2DC\uACF5\uC790\uBCC4 \uC608\uC678\uB97C \uC785\uB825\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
  close: "\uB2EB\uAE30",
  probationPayTitle: "\uC218\uC2B5\uAE30\uAC04 \uC6D4\uAE09",
  probationPayBody:
    "E\uB4F1\uAE09 \uC785\uC0AC\uC77C \uAE30\uC900 \uC6D4\uC2E4\uC9C0\uAE09 \uC804\uD45C\uC5D0 \uC801\uC6A9\uB418\uB294 \uACE0\uC815 \uC2E4\uC9C0\uAE09 \uAE08\uC561\uC785\uB2C8\uB2E4.",
  monthlyPay: "\uC6D4\uAE09 \uAE08\uC561 (\uC6D0)",
  payWithVat: "\uBD80\uAC00\uC138 \uD3EC\uD568 \uC9C0\uAE09",
  payWithVatHint: (amount: string) => `\uBD80\uAC00\uC138 10% \uD3EC\uD568 (${amount})`,
  probationMonths: "\uC218\uC2B5 \uAE30\uAC04 (\uAC1C\uC6D4)",
  alertLeadDays: "\uC54C\uB9BC (\uBA87 \uC77C \uC804)",
  postProbationTitle: "\uC218\uC2B5 \uC885\uB8CC \uD6C4 \uC790\uB3D9 \uC870\uC815",
  postProbationBody: (months: number) =>
    `\uC785\uC0AC\uC77C \uAE30\uC900 ${months}\uAC1C\uC6D4 \uC218\uC2B5\uC774 \uB05D\uB098\uBA74 \uC2DC\uACF5\uC790 \uB9C8\uC2A4\uD130\uC758 \uC2DC\uACF5\uBE44\u00B7\uAC1C\uBCC4\uCCAD\uAD6C\uB2E8\uAC00\uB97C \uC790\uB3D9\uC73C\uB85C \uBCC0\uACBD\uD569\uB2C8\uB2E4. 0\uC6D0\uC774\uBA74 \uD574\uB2F9 \uD56D\uBAA9\uC740 \uBCC0\uACBD\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.`,
  autoAdjust: "\uC218\uC2B5 \uC885\uB8CC \uC2DC \uC790\uB3D9 \uC870\uC815 \uC0AC\uC6A9",
  constructionCost: "\uC2DC\uACF5\uBE44 (\uC6D0)",
  customChargeCost: "\uAC1C\uBCC4\uCCAD\uAD6C\uB2E8\uAC00 (\uC6D0)",
  gradeAdjustTitle: "\uC218\uC2B5 \uAE30\uAC04 \u00B7 \uB4F1\uAE09 \uC790\uB3D9 \uC870\uC815",
  gradeAdjustBody:
    "\uC218\uC2B5 \uAE30\uAC04 \uC911 E\uB4F1\uAE09 \uC720\uC9C0\uC640 \uC218\uC2B5 \uC885\uB8CC \uD6C4 \uB4F1\uAE09 \uC790\uB3D9 \uC2B9\uAE09\uC744 \uC124\uC815\uD569\uB2C8\uB2E4.",
  autoAdjustGrade: "\uC218\uC2B5 \uC885\uB8CC \uC2DC \uB4F1\uAE09 \uC790\uB3D9 \uC870\uC815",
  postProbationGrade: "\uC218\uC2B5 \uC885\uB8CC \uD6C4 \uB4F1\uAE09",
  enforceEGrade: "\uC218\uC2B5 \uAE30\uAC04 \uC911 E\uB4F1\uAE09 \uAC15\uC81C",
  reset: "\uAE30\uBCF8\uAC12",
  cancel: "\uC30D\uC18C",
  save: "\uC800\uC7A5",
  saving: "\uC800\uC7A5 \uC911\u2026",
  preview: (net: string, withVat: string, includeVat: boolean) =>
    includeVat
      ? `\uC218\uC2B5 \uC6D4\uAE09 ${net} \u00B7 \uBD80\uAC00\uC138 \uD3EC\uD568 ${withVat}`
      : `\uC218\uC2B5 \uC6D4\uAE09 ${net}`,
};

type WorkerAiRulesModalProps = {
  open: boolean;
  rules: WorkerAiRules;
  saving?: boolean;
  onClose: () => void;
  onSave: (rules: WorkerAiRules) => void | Promise<void>;
};

type DraftState = {
  probationNetPay: string;
  probationPayWithVat: boolean;
  probationMonths: string;
  alertLeadDays: string;
  autoAdjustOnProbationEnd: boolean;
  postProbationConstructionCost: string;
  postProbationCustomChargeCost: string;
  autoAdjustGradeOnProbationEnd: boolean;
  postProbationGrade: string;
  enforceEGradeDuringProbation: boolean;
};

function rulesToDraft(rules: WorkerAiRules): DraftState {
  return {
    probationNetPay: String(rules.probationNetPay),
    probationPayWithVat: rules.probationPayWithVat,
    probationMonths: String(rules.probationMonths),
    alertLeadDays: String(rules.alertLeadDays),
    autoAdjustOnProbationEnd: rules.autoAdjustOnProbationEnd,
    postProbationConstructionCost: String(rules.postProbationConstructionCost || ""),
    postProbationCustomChargeCost: String(rules.postProbationCustomChargeCost || ""),
    autoAdjustGradeOnProbationEnd: rules.autoAdjustGradeOnProbationEnd,
    postProbationGrade: rules.postProbationGrade,
    enforceEGradeDuringProbation: rules.enforceEGradeDuringProbation,
  };
}

function draftToRules(draft: DraftState): WorkerAiRules {
  return normalizeWorkerAiRules({
    probationNetPay: draft.probationNetPay,
    probationPayWithVat: draft.probationPayWithVat,
    probationMonths: draft.probationMonths,
    alertLeadDays: draft.alertLeadDays,
    autoAdjustOnProbationEnd: draft.autoAdjustOnProbationEnd,
    postProbationConstructionCost: draft.postProbationConstructionCost,
    postProbationCustomChargeCost: draft.postProbationCustomChargeCost,
    autoAdjustGradeOnProbationEnd: draft.autoAdjustGradeOnProbationEnd,
    postProbationGrade: draft.postProbationGrade,
    enforceEGradeDuringProbation: draft.enforceEGradeDuringProbation,
  });
}

export function WorkerAiRulesButton({ onClick }: { onClick: () => void }) {
  return (
    <Button type="button" variant="outline" size="sm" className="h-8 rounded-lg gap-1.5" onClick={onClick}>
      <Sparkles size={14} />
      {L.title}
    </Button>
  );
}

export function WorkerAiRulesModal({ open, rules, saving = false, onClose, onSave }: WorkerAiRulesModalProps) {
  const [draft, setDraft] = useState(() => rulesToDraft(rules));

  useEffect(() => {
    if (!open) return;
    setDraft(rulesToDraft(rules));
  }, [open, rules]);

  const normalized = useMemo(() => draftToRules(draft), [draft]);
  const probationFinalPay = useMemo(() => resolveWorkerAiProbationFinalPay(normalized), [normalized]);

  if (!open) return null;

  const updateDraft = <K extends keyof DraftState>(key: K, value: DraftState[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="erp-ledger-modal-backdrop" onClick={onClose}>
      <div
        className="erp-ledger-modal erp-sale-ai-rules-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="worker-ai-rules-title"
      >
        <div className="erp-sale-ai-rules-head">
          <div>
            <h2 id="worker-ai-rules-title" className="text-base font-bold text-slate-900 md:text-lg">
              {L.title}
            </h2>
            <p className="mt-1 text-sm text-slate-500">{L.subtitle}</p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            {L.close}
          </Button>
        </div>

        <div className="erp-sale-ai-rules-body">
          <section className="erp-sale-ai-rules-section">
            <h3 className="text-sm font-bold text-slate-900">{L.probationPayTitle}</h3>
            <p className="mt-1 text-sm text-slate-500">{L.probationPayBody}</p>
            <div className="erp-sale-ai-rules-grid mt-3">
              <label className="erp-sale-ai-rules-field">
                <span>{L.monthlyPay}</span>
                <Input
                  type="number"
                  min={0}
                  step={10000}
                  value={draft.probationNetPay}
                  onChange={(event) => updateDraft("probationNetPay", event.target.value)}
                />
              </label>
              <label className="erp-sale-ai-rules-field">
                <span>{L.payWithVat}</span>
                <label className="mt-2 inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={draft.probationPayWithVat}
                    onChange={(event) => updateDraft("probationPayWithVat", event.target.checked)}
                  />
                  {L.payWithVatHint(formatKRW(probationFinalPay))}
                </label>
              </label>
              <label className="erp-sale-ai-rules-field">
                <span>{L.probationMonths}</span>
                <Input
                  type="number"
                  min={1}
                  max={12}
                  step={1}
                  value={draft.probationMonths}
                  onChange={(event) => updateDraft("probationMonths", event.target.value)}
                />
              </label>
              <label className="erp-sale-ai-rules-field">
                <span>{L.alertLeadDays}</span>
                <Input
                  type="number"
                  min={1}
                  max={30}
                  step={1}
                  value={draft.alertLeadDays}
                  onChange={(event) => updateDraft("alertLeadDays", event.target.value)}
                />
              </label>
            </div>
            <p className="erp-sale-ai-rules-preview mt-3">
              {L.preview(
                formatKRW(normalized.probationNetPay),
                formatKRW(probationFinalPay),
                normalized.probationPayWithVat,
              )}
            </p>
          </section>

          <section className="erp-sale-ai-rules-section">
            <h3 className="text-sm font-bold text-slate-900">{L.postProbationTitle}</h3>
            <p className="mt-1 text-sm text-slate-500">{L.postProbationBody(normalized.probationMonths)}</p>
            <label className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={draft.autoAdjustOnProbationEnd}
                onChange={(event) => updateDraft("autoAdjustOnProbationEnd", event.target.checked)}
              />
              {L.autoAdjust}
            </label>
            <div className="erp-sale-ai-rules-grid mt-3">
              <label className="erp-sale-ai-rules-field">
                <span>{L.constructionCost}</span>
                <Input
                  type="number"
                  min={0}
                  step={10000}
                  value={draft.postProbationConstructionCost}
                  onChange={(event) => updateDraft("postProbationConstructionCost", event.target.value)}
                  disabled={!draft.autoAdjustOnProbationEnd}
                />
              </label>
              <label className="erp-sale-ai-rules-field">
                <span>{L.customChargeCost}</span>
                <Input
                  type="number"
                  min={0}
                  step={10000}
                  value={draft.postProbationCustomChargeCost}
                  onChange={(event) => updateDraft("postProbationCustomChargeCost", event.target.value)}
                  disabled={!draft.autoAdjustOnProbationEnd}
                />
              </label>
            </div>
          </section>

          <section className="erp-sale-ai-rules-section">
            <h3 className="text-sm font-bold text-slate-900">{L.gradeAdjustTitle}</h3>
            <p className="mt-1 text-sm text-slate-500">{L.gradeAdjustBody}</p>
            <label className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={draft.enforceEGradeDuringProbation}
                onChange={(event) => updateDraft("enforceEGradeDuringProbation", event.target.checked)}
              />
              {L.enforceEGrade}
            </label>
            <label className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={draft.autoAdjustGradeOnProbationEnd}
                onChange={(event) => updateDraft("autoAdjustGradeOnProbationEnd", event.target.checked)}
              />
              {L.autoAdjustGrade}
            </label>
            <div className="erp-sale-ai-rules-grid mt-3">
              <label className="erp-sale-ai-rules-field">
                <span>{L.postProbationGrade}</span>
                <select
                  className="erp-input w-full rounded-xl px-3 py-2 text-sm font-semibold"
                  value={draft.postProbationGrade}
                  onChange={(event) => updateDraft("postProbationGrade", event.target.value)}
                  disabled={!draft.autoAdjustGradeOnProbationEnd}
                >
                  {POST_PROBATION_GRADE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>
        </div>

        <div className="erp-sale-ai-rules-foot">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              onClick={() => setDraft(rulesToDraft(DEFAULT_WORKER_AI_RULES))}
              disabled={saving}
            >
              {L.reset}
            </Button>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="rounded-xl" onClick={onClose} disabled={saving}>
              {L.cancel}
            </Button>
            <Button type="button" className="rounded-xl" onClick={() => void onSave(normalized)} disabled={saving}>
              {saving ? L.saving : L.save}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
