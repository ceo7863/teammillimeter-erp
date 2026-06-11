import { useEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  buildSaleAiRuleFormPreview,
  DEFAULT_SALE_AI_RULE_FORM_TEXTS,
  DEFAULT_SALE_AI_RULES,
  normalizeSaleAiRules,
  type SaleAiRuleFormTexts,
  type SaleAiRules,
} from "@/utils/saleAiRules";

type SaleAiRulesModalProps = {
  open: boolean;
  rules: SaleAiRules;
  saving?: boolean;
  onClose: () => void;
  onSave: (rules: SaleAiRules) => void | Promise<void>;
};

type DraftState = {
  shortShiftMaxHours: string;
  shortShiftBaseAmount: string;
  shortShiftHourlyAmount: string;
  overtimeBaseHour: string;
  overtimeStartHour: string;
  normalEndHour: string;
  formTexts: SaleAiRuleFormTexts;
};

function rulesToDraft(rules: SaleAiRules): DraftState {
  return {
    shortShiftMaxHours: String(rules.shortShiftMaxHours),
    shortShiftBaseAmount: String(rules.shortShiftBaseAmount),
    shortShiftHourlyAmount: String(rules.shortShiftHourlyAmount),
    overtimeBaseHour: String(rules.overtimeBaseHour),
    overtimeStartHour: String(rules.overtimeStartHour),
    normalEndHour: String(rules.normalEndHour),
    formTexts: { ...rules.formTexts },
  };
}

function draftToRules(draft: DraftState): SaleAiRules {
  return normalizeSaleAiRules({
    shortShiftMaxHours: draft.shortShiftMaxHours,
    shortShiftBaseAmount: draft.shortShiftBaseAmount,
    shortShiftHourlyAmount: draft.shortShiftHourlyAmount,
    overtimeBaseHour: draft.overtimeBaseHour,
    overtimeStartHour: draft.overtimeStartHour,
    normalEndHour: draft.normalEndHour,
    formTexts: draft.formTexts,
  });
}

function RuleTextArea({
  label,
  hint,
  value,
  onChange,
  rows = 3,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
}) {
  return (
    <label className="erp-sale-ai-rules-field erp-sale-ai-rules-field--wide">
      <span>{label}</span>
      {hint ? <span className="erp-sale-ai-rules-field-hint">{hint}</span> : null}
      <textarea
        className="erp-sale-ai-rules-textarea"
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

export function SaleAiRulesButton({ onClick }: { onClick: () => void }) {
  return (
    <Button type="button" variant="outline" size="sm" className="h-8 rounded-lg gap-1.5" onClick={onClick}>
      <Sparkles size={14} />
      {"AI \uADDC\uCE59"}
    </Button>
  );
}

export function SaleAiRulesModal({ open, rules, saving = false, onClose, onSave }: SaleAiRulesModalProps) {
  const [draft, setDraft] = useState(() => rulesToDraft(rules));

  useEffect(() => {
    if (!open) return;
    setDraft(rulesToDraft(rules));
  }, [open, rules]);

  const normalized = useMemo(() => draftToRules(draft), [draft]);
  const preview = useMemo(() => buildSaleAiRuleFormPreview(normalized), [normalized]);

  if (!open) return null;

  const updateDraft = (key: keyof Omit<DraftState, "formTexts">, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const updateFormText = (key: keyof SaleAiRuleFormTexts, value: string) => {
    setDraft((prev) => ({
      ...prev,
      formTexts: { ...prev.formTexts, [key]: value },
    }));
  };

  const handleReset = () => {
    setDraft(rulesToDraft(DEFAULT_SALE_AI_RULES));
  };

  const handleResetTexts = () => {
    setDraft((prev) => ({
      ...prev,
      formTexts: { ...DEFAULT_SALE_AI_RULE_FORM_TEXTS },
    }));
  };

  const handleSave = () => {
    void onSave(normalized);
  };

  return (
    <div className="erp-ledger-modal-backdrop" onClick={onClose}>
      <div
        className="erp-ledger-modal erp-sale-ai-rules-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sale-ai-rules-title"
      >
        <div className="erp-sale-ai-rules-head">
          <div>
            <h2 id="sale-ai-rules-title" className="text-base font-bold text-slate-900 md:text-lg">
              {"AI \uADDC\uCE59"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {"SC \uC77C\uC815 \u2192 \uB9E4\uCD9C \uC804\uD45C \uC790\uB3D9 \uACC4\uC0B0 \uADDC\uCE59\uACFC \uC11C\uC2DD\uC744 \uC124\uC815\uD569\uB2C8\uB2E4."}
            </p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            {"\uB2EB\uAE30"}
          </Button>
        </div>

        <div className="erp-sale-ai-rules-body">
          <section className="erp-sale-ai-rules-section">
            <RuleTextArea
              label={"\uC804\uCCB4 \uC548\uB0B4 \uBB38\uAD6C"}
              hint={"\uADDC\uCE59 \uC804\uCCB4 \uC124\uBA85"}
              value={draft.formTexts.intro}
              onChange={(value) => updateFormText("intro", value)}
              rows={2}
            />
            <p className="erp-sale-ai-rules-preview">{preview.intro}</p>
          </section>

          <section className="erp-sale-ai-rules-section">
            <div className="erp-sale-ai-rules-section-head">
              <Input
                className="erp-sale-ai-rules-title-input"
                value={draft.formTexts.shortShiftTitle}
                onChange={(event) => updateFormText("shortShiftTitle", event.target.value)}
              />
            </div>

            <RuleTextArea
              label={"\uADDC\uCE59 \uC124\uBA85"}
              value={draft.formTexts.shortShiftBody}
              onChange={(value) => updateFormText("shortShiftBody", value)}
            />
            <p className="erp-sale-ai-rules-preview">{preview.shortShiftBody}</p>

            <div className="erp-sale-ai-rules-grid">
              <label className="erp-sale-ai-rules-field">
                <span>{"\uAE30\uC900 \uC2DC\uAC04 (\uC774\uD558)"}</span>
                <Input
                  type="number"
                  min={0.5}
                  max={24}
                  step={0.5}
                  value={draft.shortShiftMaxHours}
                  onChange={(event) => updateDraft("shortShiftMaxHours", event.target.value)}
                />
              </label>
              <label className="erp-sale-ai-rules-field">
                <span>{"\uAE30\uBCF8\uAE08 (\uC6D0)"}</span>
                <Input
                  type="number"
                  min={0}
                  step={1000}
                  value={draft.shortShiftBaseAmount}
                  onChange={(event) => updateDraft("shortShiftBaseAmount", event.target.value)}
                />
              </label>
              <label className="erp-sale-ai-rules-field">
                <span>{"\uC2DC\uAC04\uB2F9 \uAE08\uC561 (\uC6D0)"}</span>
                <Input
                  type="number"
                  min={0}
                  step={1000}
                  value={draft.shortShiftHourlyAmount}
                  onChange={(event) => updateDraft("shortShiftHourlyAmount", event.target.value)}
                />
              </label>
            </div>

            <RuleTextArea
              label={"\uACF5\uC2DD \uC11C\uC2DD"}
              hint={"{maxHours}, {base}, {hourly} \uC0AC\uC6A9 \uAC00\uB2A5"}
              value={draft.formTexts.shortShiftFormula}
              onChange={(value) => updateFormText("shortShiftFormula", value)}
              rows={2}
            />
            <p className="erp-sale-ai-rules-preview">{preview.shortShiftFormula}</p>
            <p className="erp-sale-ai-rules-preview-sub">{preview.shortShiftExample}</p>

            <RuleTextArea
              label={"\uC0C1\uD55C \uADDC\uCE59"}
              value={draft.formTexts.shortShiftCapRule}
              onChange={(value) => updateFormText("shortShiftCapRule", value)}
              rows={2}
            />
            <p className="erp-sale-ai-rules-preview">{preview.shortShiftCapRule}</p>
            <p className="erp-sale-ai-rules-preview-sub">{preview.shortShiftCapExample}</p>

            <RuleTextArea
              label={"\uC9C0\uAE09 \uADDC\uCE59"}
              value={draft.formTexts.shortShiftPayRule}
              onChange={(value) => updateFormText("shortShiftPayRule", value)}
              rows={2}
            />
            <p className="erp-sale-ai-rules-preview">{preview.shortShiftPayRule}</p>
            <p className="erp-sale-ai-rules-preview-sub">{preview.shortShiftPayExample}</p>

            <RuleTextArea
              label={"\uB9CC\uC6D0 \uB2E8\uC704 \uC808\uC0AD \uADDC\uCE59"}
              hint={"{maxHours} \uC0AC\uC6A9 \uAC00\uB2A5"}
              value={draft.formTexts.shortShiftManwonRule}
              onChange={(value) => updateFormText("shortShiftManwonRule", value)}
              rows={2}
            />
            <p className="erp-sale-ai-rules-preview">{preview.shortShiftManwonRule}</p>
            <p className="erp-sale-ai-rules-preview-sub">{preview.shortShiftManwonExample}</p>
          </section>

          <section className="erp-sale-ai-rules-section">
            <div className="erp-sale-ai-rules-section-head">
              <Input
                className="erp-sale-ai-rules-title-input"
                value={draft.formTexts.overtimeTitle}
                onChange={(event) => updateFormText("overtimeTitle", event.target.value)}
              />
            </div>

            <RuleTextArea
              label={"\uADDC\uCE59 \uC124\uBA85"}
              value={draft.formTexts.overtimeBody}
              onChange={(value) => updateFormText("overtimeBody", value)}
            />
            <p className="erp-sale-ai-rules-preview">{preview.overtimeBody}</p>

            <div className="erp-sale-ai-rules-grid">
              <label className="erp-sale-ai-rules-field">
                <span>{"\uC57C\uADFC \uC5C6\uC74C (\uC2DC \uAE4C\uC9C0)"}</span>
                <Input
                  type="number"
                  min={0}
                  max={23}
                  step={1}
                  value={draft.normalEndHour}
                  onChange={(event) => updateDraft("normalEndHour", event.target.value)}
                />
              </label>
              <label className="erp-sale-ai-rules-field">
                <span>{"\uC57C\uADFC \uC2DC\uC791 (\uC2DC\uBD80\uD130)"}</span>
                <Input
                  type="number"
                  min={0}
                  max={23}
                  step={1}
                  value={draft.overtimeStartHour}
                  onChange={(event) => updateDraft("overtimeStartHour", event.target.value)}
                />
              </label>
              <label className="erp-sale-ai-rules-field">
                <span>{"\uC57C\uADFC \uAE30\uC900 (\uC885\uB8CC\u2212N\uC2DC\uAC04)"}</span>
                <Input
                  type="number"
                  min={0}
                  max={23}
                  step={1}
                  value={draft.overtimeBaseHour}
                  onChange={(event) => updateDraft("overtimeBaseHour", event.target.value)}
                />
              </label>
            </div>

            <RuleTextArea
              label={"\uACF5\uC2DD \uC11C\uC2DD"}
              hint={"{normalEnd}, {overtimeStart}, {overtimeBase} \uC0AC\uC6A9 \uAC00\uB2A5"}
              value={draft.formTexts.overtimeFormula}
              onChange={(value) => updateFormText("overtimeFormula", value)}
              rows={2}
            />
            <p className="erp-sale-ai-rules-preview">{preview.overtimeFormula}</p>
          </section>
        </div>

        <div className="erp-sale-ai-rules-foot">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" className="rounded-xl" onClick={handleReset} disabled={saving}>
              {"\uAE30\uBCF8\uAC12 \uC804\uCCB4"}
            </Button>
            <Button type="button" variant="outline" className="rounded-xl" onClick={handleResetTexts} disabled={saving}>
              {"\uC11C\uC2DD \uAE30\uBCF8\uAC12"}
            </Button>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="rounded-xl" onClick={onClose} disabled={saving}>
              {"\uC30D\uC18C"}
            </Button>
            <Button type="button" className="rounded-xl" onClick={handleSave} disabled={saving}>
              {saving ? "\uC800\uC7A5 \uC911\u2026" : "\uC800\uC7A5"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
