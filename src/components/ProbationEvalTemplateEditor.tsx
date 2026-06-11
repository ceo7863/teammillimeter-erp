import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createDefaultProbationEvalTemplate,
  normalizeProbationEvalTemplates,
  type ProbationEvalQuestion,
  type ProbationEvalQuestionType,
  type ProbationEvalTemplate,
} from "@/utils/probationEval";

const L = {
  title: "\uD3C9\uAC00 \uC591\uC2DD \uAD00\uB9AC",
  addQuestion: "\uD56D\uBAA9 \uCD94\uAC00",
  save: "\uC591\uC2DD \uC800\uC7A5",
  saving: "\uC800\uC7A5 \uC911...",
  label: "\uC9C8\uBB38",
  type: "\uC720\uD615",
  weight: "\uAC00\uC911\uCE58",
  required: "\uD544\uC218",
  active: "\uC0AC\uC6A9",
  scale5: "5\uC810 \uCCAD\uB3C4",
  yesno: "\uC608/\uC544\uB2C8\uC624",
  checkbox: "\uCCB4\uD06C",
  moveUp: "\uC704",
  moveDown: "\uC544\uB798",
  remove: "\uC0AD\uC81C",
};

type ProbationEvalTemplateEditorProps = {
  templates: ProbationEvalTemplate[];
  activeTemplateId: string;
  saving?: boolean;
  onSave: (templates: ProbationEvalTemplate[]) => void | Promise<void>;
};

function newQuestion(sortOrder: number): ProbationEvalQuestion {
  return {
    id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    label: "\uC0C8 \uC9C8\uBB38",
    type: "scale5",
    required: true,
    weight: 1,
    sortOrder,
    active: true,
  };
}

export function ProbationEvalTemplateEditor({
  templates,
  activeTemplateId,
  saving = false,
  onSave,
}: ProbationEvalTemplateEditorProps) {
  const normalized = useMemo(() => normalizeProbationEvalTemplates(templates), [templates]);
  const [draft, setDraft] = useState<ProbationEvalTemplate>(() => {
    return normalized.find((row) => row.id === activeTemplateId) || normalized[0] || createDefaultProbationEvalTemplate();
  });

  const updateQuestion = (index: number, patch: Partial<ProbationEvalQuestion>) => {
    setDraft((prev) => {
      const questions = prev.questions.map((row, idx) => (idx === index ? { ...row, ...patch } : row));
      return { ...prev, questions };
    });
  };

  const moveQuestion = (index: number, direction: -1 | 1) => {
    setDraft((prev) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= prev.questions.length) return prev;
      const questions = [...prev.questions];
      const temp = questions[index];
      questions[index] = questions[nextIndex];
      questions[nextIndex] = temp;
      return {
        ...prev,
        questions: questions.map((row, idx) => ({ ...row, sortOrder: idx + 1 })),
      };
    });
  };

  const removeQuestion = (index: number) => {
    setDraft((prev) => ({
      ...prev,
      questions: prev.questions.filter((_, idx) => idx !== index).map((row, idx) => ({ ...row, sortOrder: idx + 1 })),
    }));
  };

  const addQuestion = () => {
    setDraft((prev) => ({
      ...prev,
      questions: [...prev.questions, newQuestion(prev.questions.length + 1)],
    }));
  };

  const handleSave = () => {
    const nextTemplates = normalized.map((row) => (row.id === draft.id ? { ...draft, version: row.version + 1 } : row));
    if (!nextTemplates.some((row) => row.id === draft.id)) {
      nextTemplates.push({ ...draft, version: 1 });
    }
    void onSave(nextTemplates);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-900">{L.title}</h3>
          <p className="text-sm text-slate-500">{draft.name}</p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" className="rounded-lg" onClick={addQuestion}>
            {L.addQuestion}
          </Button>
          <Button type="button" size="sm" className="rounded-lg" onClick={handleSave} disabled={saving}>
            {saving ? L.saving : L.save}
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {draft.questions.map((question, index) => (
          <div key={question.id} className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
            <div className="grid gap-2 md:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="font-semibold text-slate-600">{L.label}</span>
                <Input
                  value={question.label}
                  onChange={(event) => updateQuestion(index, { label: event.target.value })}
                  className="rounded-lg"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-semibold text-slate-600">{L.type}</span>
                <select
                  className="erp-input w-full rounded-lg px-3 py-2 text-sm"
                  value={question.type}
                  onChange={(event) =>
                    updateQuestion(index, { type: event.target.value as ProbationEvalQuestionType })
                  }
                >
                  <option value="scale5">{L.scale5}</option>
                  <option value="yesno">{L.yesno}</option>
                  <option value="checkbox">{L.checkbox}</option>
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-semibold text-slate-600">{L.weight}</span>
                <Input
                  type="number"
                  min={0.1}
                  step={0.1}
                  value={question.weight}
                  onChange={(event) => updateQuestion(index, { weight: Number(event.target.value) || 1 })}
                  className="rounded-lg"
                />
              </label>
              <div className="flex flex-wrap items-end gap-4 text-sm">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={question.required}
                    onChange={(event) => updateQuestion(index, { required: event.target.checked })}
                  />
                  {L.required}
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={question.active}
                    onChange={(event) => updateQuestion(index, { active: event.target.checked })}
                  />
                  {L.active}
                </label>
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => moveQuestion(index, -1)}>
                {L.moveUp}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => moveQuestion(index, 1)}>
                {L.moveDown}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => removeQuestion(index)}>
                {L.remove}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
