import { useEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  buildOvertimeFormulaPreview,
  buildShortShiftFormulaPreview,
  computeShortShiftChargeAmount,
  DEFAULT_SALE_AI_RULES,
  normalizeSaleAiRules,
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
};

function rulesToDraft(rules: SaleAiRules): DraftState {
  return {
    shortShiftMaxHours: String(rules.shortShiftMaxHours),
    shortShiftBaseAmount: String(rules.shortShiftBaseAmount),
    shortShiftHourlyAmount: String(rules.shortShiftHourlyAmount),
    overtimeBaseHour: String(rules.overtimeBaseHour),
    overtimeStartHour: String(rules.overtimeStartHour),
    normalEndHour: String(rules.normalEndHour),
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
  });
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
  const sampleShortCharge = computeShortShiftChargeAmount(2, normalized);

  if (!open) return null;

  const updateDraft = (key: keyof DraftState, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const handleReset = () => {
    setDraft(rulesToDraft(DEFAULT_SALE_AI_RULES));
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
              {"SC \uC2A4\uCF00\uC904 \uAC00\uC838\uC624\uAE30 \u00B7 \uC790\uB3D9 \uCCAD\uAD6C \uACC4\uC0B0 \uACF5\uC2DD\uC785\uB2C8\uB2E4."}
            </p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            {"\uB2EB\uAE30"}
          </Button>
        </div>

        <div className="erp-sale-ai-rules-body">
          <section className="erp-sale-ai-rules-section">
            <h3 className="erp-sale-ai-rules-section-title">{"\uB2E8\uCD95\uADFC\uBB34 \uCCAD\uAD6C"}</h3>
            <div className="erp-sale-ai-rules-grid">
              <label className="erp-sale-ai-rules-field">
                <span>{"\uAE30\uC900 \uC2DC\uAC04 (\uC774\uD558 \uBBF8\uB9CC)"}</span>
                <Input
                  type="number"
                  min={0.5}
                  max={24}
                  step={0.5}
                  value={draft.shortShiftMaxHours}
                  onChange={(e) => updateDraft("shortShiftMaxHours", e.target.value)}
                />
              </label>
              <label className="erp-sale-ai-rules-field">
                <span>{"\uAE30\uBCF8\uAE08 (\uC6D0)"}</span>
                <Input
                  type="number"
                  min={0}
                  step={1000}
                  value={draft.shortShiftBaseAmount}
                  onChange={(e) => updateDraft("shortShiftBaseAmount", e.target.value)}
                />
              </label>
              <label className="erp-sale-ai-rules-field">
                <span>{"\uC2DC\uAC04\uB2F9 \uAE08\uC561 (\uC6D0)"}</span>
                <Input
                  type="number"
                  min={0}
                  step={1000}
                  value={draft.shortShiftHourlyAmount}
                  onChange={(e) => updateDraft("shortShiftHourlyAmount", e.target.value)}
                />
              </label>
            </div>
            <p className="erp-sale-ai-rules-preview">{buildShortShiftFormulaPreview(normalized)}</p>
            <p className="erp-sale-ai-rules-preview-sub">
              {"\uC608: 2\uC2DC\uAC04 \uADFC\uBB34 \u2192 "}
              {sampleShortCharge.toLocaleString("ko-KR")}
              {"\uC6D0"}
            </p>
          </section>

          <section className="erp-sale-ai-rules-section">
            <h3 className="erp-sale-ai-rules-section-title">{"\uC57C\uADFC \uC2DC\uAC04"}</h3>
            <div className="erp-sale-ai-rules-grid">
              <label className="erp-sale-ai-rules-field">
                <span>{"\uC57C\uADFC \uC5C6\uC74C (\uC2DC \uAE4C\uC9C0)"}</span>
                <Input
                  type="number"
                  min={0}
                  max={23}
                  step={1}
                  value={draft.normalEndHour}
                  onChange={(e) => updateDraft("normalEndHour", e.target.value)}
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
                  onChange={(e) => updateDraft("overtimeStartHour", e.target.value)}
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
                  onChange={(e) => updateDraft("overtimeBaseHour", e.target.value)}
                />
              </label>
            </div>
            <p className="erp-sale-ai-rules-preview">{buildOvertimeFormulaPreview(normalized)}</p>
          </section>
        </div>

        <div className="erp-sale-ai-rules-foot">
          <Button type="button" variant="outline" className="rounded-xl" onClick={handleReset} disabled={saving}>
            {"\uAE30\uBCF8\uAC12"}
          </Button>
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
