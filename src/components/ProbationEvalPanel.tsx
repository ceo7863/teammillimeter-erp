import { useMemo, useState } from "react";
import { BarChart3, ClipboardList, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  aggregateByQuestion,
  aggregateByWorker,
  dailyCompletionRate,
} from "@/utils/probationEvalAnalytics";
import {
  DEFAULT_PROBATION_EVAL_TEMPLATE_ID,
  normalizeProbationEvalTemplates,
  resolveActiveProbationEvalTemplate,
  type ProbationEvalQuestion,
  type ProbationEvalRequest,
  type ProbationEvalTemplate,
} from "@/utils/probationEval";
import { triggerProbationEvalNotify } from "@/utils/probationEvalApi";
import type { WorkerAiRules } from "@/utils/workerAiRules";

const L = {
  title: "\uC218\uC2B5 \uD3C9\uAC00",
  desc: "\uC218\uC2B5 \uAE30\uAC04 \uC77C\uC77C \uD3C9\uAC00 \uC591\uC2DD\uACFC \uC131\uACFC \uB300\uC2DC\uBCF4\uB4DC\uC785\uB2C8\uB2E4.",
  completion: "\uC624\uB298 \uC644\uB958",
  totalRequests: "\uC804\uCCB4 \uC694\uCCAD",
  submitted: "\uC81C\uCD9C \uC644\uB958",
  avgScore: "\uD3C9\uADE0 \uC810\uC218",
  workerScores: "\uC2DC\uACF5\uC790\uBCC4 \uC131\uACFC",
  questionScores: "\uD56D\uBAA9\uBCC4 \uD3C9\uADE0",
  templateTitle: "\uD3C9\uAC00 \uC591\uC2DD",
  templateName: "\uC591\uC2DD \uC774\uB984",
  saveTemplate: "\uC591\uC2DD \uC800\uC7A5",
  saving: "\uC800\uC7A5 \uC911\u2026",
  sendToday: "\uC624\uB298 \uD3C9\uAC00 \uBC1C\uC1A1",
  sending: "\uBC1C\uC1A1 \uC911\u2026",
  sendOk: "\uD3C9\uAC00 \uC694\uCCAD \uBC1C\uC1A1\uC774 \uC644\uB8CC\uB418\uC5C8\uC2B5\uB2C8\uB2E4.",
  sendFail: "\uBC1C\uC1A1\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.",
  noWorkers: "\uC218\uC2B5 \uC911 \uC2DC\uACF5\uC790 \uD3C9\uAC00 \uB370\uC774\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.",
  noQuestions: "\uC591\uC2DD \uD56D\uBAA9\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  requests: "\uCD5C\uADFC \uC694\uCCAD",
  status: "\uC0C1\uD0DC",
  worker: "\uB300\uC0C1",
  evaluator: "\uD3C9\uAC00\uC790",
  date: "\uADDC\uC5F4\uC77C",
  site: "\uD604\uC7A5",
  score: "\uC810\uC218",
  active: "\uC0AC\uC6A9",
  label: "\uD56D\uBAA9",
  weight: "\uAC00\uC911\uCE58",
  type: "\uC720\uD615",
};

type ProbationEvalPanelProps = {
  workerAiRules: WorkerAiRules;
  templates: ProbationEvalTemplate[];
  requests: ProbationEvalRequest[];
  saving?: boolean;
  onSaveTemplates: (templates: ProbationEvalTemplate[]) => void | Promise<void>;
  onRefresh?: () => void | Promise<void>;
};

function todayISO() {
  const now = new Date();
  const kst = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  return `${kst.getFullYear()}-${String(kst.getMonth() + 1).padStart(2, "0")}-${String(kst.getDate()).padStart(2, "0")}`;
}

export function ProbationEvalPanel({
  workerAiRules,
  templates,
  requests,
  saving = false,
  onSaveTemplates,
  onRefresh,
}: ProbationEvalPanelProps) {
  const [sending, setSending] = useState(false);
  const [sendMessage, setSendMessage] = useState("");

  const normalizedTemplates = useMemo(() => normalizeProbationEvalTemplates(templates), [templates]);
  const activeTemplate = useMemo(
    () => resolveActiveProbationEvalTemplate(normalizedTemplates, workerAiRules.probationEvalTemplateId),
    [normalizedTemplates, workerAiRules.probationEvalTemplateId],
  );
  const [draft, setDraft] = useState(() => activeTemplate);

  const workerRows = useMemo(() => aggregateByWorker(requests), [requests]);
  const questionRows = useMemo(
    () => aggregateByQuestion(requests, activeTemplate),
    [requests, activeTemplate],
  );
  const completion = useMemo(() => dailyCompletionRate(requests, todayISO()), [requests]);
  const recentRequests = useMemo(
    () =>
      [...requests]
        .sort((a, b) => String(b.workDate || "").localeCompare(String(a.workDate || "")))
        .slice(0, 20),
    [requests],
  );

  const updateQuestion = (index: number, patch: Partial<ProbationEvalQuestion>) => {
    setDraft((prev) => ({
      ...prev,
      questions: prev.questions.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
    }));
  };

  const handleSaveTemplate = () => {
    const next = normalizedTemplates.map((row) =>
      row.id === draft.id ? { ...draft, version: (draft.version || 1) + 1 } : row,
    );
    if (!next.some((row) => row.id === draft.id)) {
      next.unshift(draft);
    }
    void onSaveTemplates(next);
  };

  const handleSendToday = async () => {
    setSending(true);
    setSendMessage("");
    try {
      const result = await triggerProbationEvalNotify(todayISO());
      setSendMessage(
        result.skipped
          ? String(result.reason || L.sendFail)
          : `${L.sendOk} (${result.created ?? 0}\uAC74 \uC0DD\uC131, ${result.sent ?? 0}\uAC74 \uBC1C\uC1A1)`,
      );
      await onRefresh?.();
    } catch (error) {
      setSendMessage(error instanceof Error ? error.message : L.sendFail);
    } finally {
      setSending(false);
    }
  };

  if (!workerAiRules.probationEvalEnabled) {
    return (
      <Card className="mt-4 rounded-2xl border-slate-200 shadow-sm">
        <CardContent className="p-4 text-sm text-slate-500">
          {"\uC218\uC2B5 \uD3C9\uAC00\uAC00 \uBE44\uD65C\uC131\uD654\uB418\uC5B4 \uC788\uC2B5\uB2C8\uB2E4. \uC2E0\uC785 AI \uADDC\uCE59\uC5D0\uC11C \uD65C\uC131\uD654\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4."}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="erp-text-section flex items-center gap-2">
            <BarChart3 size={18} />
            {L.title}
          </h2>
          <p className="erp-text-caption mt-1 text-slate-500">{L.desc}</p>
        </div>
        <Button type="button" className="rounded-2xl" onClick={() => void handleSendToday()} disabled={sending}>
          <Send size={16} className="mr-2" />
          {sending ? L.sending : L.sendToday}
        </Button>
      </div>

      {sendMessage ? <p className="text-sm text-slate-600">{sendMessage}</p> : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-4">
            <div className="erp-text-caption text-slate-500">{L.completion}</div>
            <div className="mt-1 text-2xl font-black text-blue-700">{completion.rate}%</div>
            <div className="erp-text-caption mt-1 text-slate-500">
              {completion.submitted}/{completion.total}
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-4">
            <div className="erp-text-caption text-slate-500">{L.totalRequests}</div>
            <div className="mt-1 text-2xl font-black text-slate-900">{requests.length}</div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-4">
            <div className="erp-text-caption text-slate-500">{L.submitted}</div>
            <div className="mt-1 text-2xl font-black text-emerald-700">
              {requests.filter((row) => row.status === "submitted").length}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-4">
            <h3 className="text-sm font-bold text-slate-900">{L.workerScores}</h3>
            {workerRows.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">{L.noWorkers}</p>
            ) : (
              <div className="erp-table-wrap mt-3">
                <table className="erp-table">
                  <thead className="bg-slate-100 text-slate-600">
                    <tr>
                      <th className="text-left">{L.worker}</th>
                      <th className="text-right">{L.submitted}</th>
                      <th className="text-right">{L.avgScore}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workerRows.map((row) => (
                      <tr key={row.probationWorkerId} className="border-t">
                        <td>{row.probationWorkerName}</td>
                        <td className="text-right">
                          {row.submittedCount}/{row.requestCount}
                        </td>
                        <td className="text-right font-semibold">
                          {row.submittedCount ? row.averageScore.toFixed(1) : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-4">
            <h3 className="text-sm font-bold text-slate-900">{L.questionScores}</h3>
            {questionRows.every((row) => !row.responseCount) ? (
              <p className="mt-3 text-sm text-slate-500">{L.noQuestions}</p>
            ) : (
              <div className="erp-table-wrap mt-3">
                <table className="erp-table">
                  <thead className="bg-slate-100 text-slate-600">
                    <tr>
                      <th className="text-left">{L.label}</th>
                      <th className="text-right">{L.avgScore}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {questionRows.map((row) => (
                      <tr key={row.questionId} className="border-t">
                        <td>{row.label}</td>
                        <td className="text-right font-semibold">
                          {row.responseCount ? row.averageScore.toFixed(1) : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-4">
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <ClipboardList size={16} />
            {L.templateTitle}
          </h3>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="erp-sale-ai-rules-field">
              <span>{L.templateName}</span>
              <Input
                value={draft.name}
                onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
              />
            </label>
          </div>
          <div className="erp-table-wrap mt-3">
            <table className="erp-table">
              <thead className="bg-slate-100 text-slate-600">
                <tr>
                  <th className="text-left">{L.label}</th>
                  <th className="text-left">{L.type}</th>
                  <th className="text-right">{L.weight}</th>
                  <th className="text-center">{L.active}</th>
                </tr>
              </thead>
              <tbody>
                {draft.questions.map((question, index) => (
                  <tr key={question.id} className="border-t">
                    <td>
                      <Input
                        value={question.label}
                        onChange={(event) => updateQuestion(index, { label: event.target.value })}
                      />
                    </td>
                    <td>{question.type}</td>
                    <td className="text-right">
                      <Input
                        type="number"
                        min={0.1}
                        step={0.1}
                        className="text-right"
                        value={question.weight}
                        onChange={(event) =>
                          updateQuestion(index, { weight: Number(event.target.value) || 1 })
                        }
                      />
                    </td>
                    <td className="text-center">
                      <input
                        type="checkbox"
                        checked={question.active}
                        onChange={(event) => updateQuestion(index, { active: event.target.checked })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex justify-end">
            <Button type="button" className="rounded-xl" onClick={handleSaveTemplate} disabled={saving}>
              {saving ? L.saving : L.saveTemplate}
            </Button>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            {DEFAULT_PROBATION_EVAL_TEMPLATE_ID} / v{draft.version}
          </p>
        </CardContent>
      </Card>

      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-4">
          <h3 className="text-sm font-bold text-slate-900">{L.requests}</h3>
          <div className="erp-table-wrap mt-3">
            <table className="erp-table">
              <thead className="bg-slate-100 text-slate-600">
                <tr>
                  <th className="text-left">{L.date}</th>
                  <th className="text-left">{L.site}</th>
                  <th className="text-left">{L.worker}</th>
                  <th className="text-left">{L.evaluator}</th>
                  <th className="text-center">{L.status}</th>
                  <th className="text-right">{L.score}</th>
                </tr>
              </thead>
              <tbody>
                {recentRequests.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-slate-500">
                      {L.noWorkers}
                    </td>
                  </tr>
                ) : (
                  recentRequests.map((row) => (
                    <tr key={row.id} className="border-t">
                      <td className="whitespace-nowrap">{row.workDate}</td>
                      <td>{row.siteName || "-"}</td>
                      <td>{row.probationWorkerName}</td>
                      <td>{row.evaluatorName}</td>
                      <td className="text-center">{row.status}</td>
                      <td className="text-right">{row.totalScore ?? "-"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
