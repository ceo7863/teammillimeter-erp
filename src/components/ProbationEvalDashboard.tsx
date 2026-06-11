import { useMemo, useState } from "react";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WorkerHrRecordModal } from "@/components/WorkerHrRecordModal";
import type { CompanyProfile } from "@/utils/companyProfile";
import { DEFAULT_COMPANY_PROFILE } from "@/utils/companyProfile";
import {
  aggregateByQuestion,
  aggregateByWorker,
  dailyCompletionRate,
  dailyTrend,
} from "@/utils/probationEvalAnalytics";
import {
  normalizeProbationEvalRequests,
  resolveActiveProbationEvalTemplate,
  type ProbationEvalRequest,
  type ProbationEvalTemplate,
} from "@/utils/probationEval";
import { resolveWorkerForEval } from "@/utils/probationEvalHrRecord";
import { normalizeWorkerCategory, WORKER_CATEGORY_OUTSOURCE } from "@/utils/workerPayments";

const L = {
  title: "\uC218\uC2B5 \uD3C9\uAC00 \uB300\uC2DC\uBCF4\uB4DC",
  dateFrom: "\uC2DC\uC791\uC77C",
  dateTo: "\uC885\uB8CC\uC77C",
  workerFilter: "\uC2DC\uACF5\uC790 \uC774\uB984 \uAC80\uC0C9",
  completion: "\uC644\uB8CC\uC728",
  workerScores: "\uC2DC\uACF5\uC790\uBCC4 \uD3C9\uADE0 \uC810\uC218",
  questionAvg: "\uBB38\uD56D\uBCC4 \uD3C9\uADE0",
  requests: "\uD3C9\uAC00 \uC694\uCCAD \uBAA9\uB85D",
  status: {
    pending: "\uB300\uAE30",
    sent: "\uBC1C\uC1A1\uC644\uB8CC",
    submitted: "\uC81C\uCD9C\uC644\uB8CC",
    expired: "\uB9CC\uB8CC",
  },
  noData: "\uD574\uB2F9 \uAE30\uAC04 \uB370\uC774\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.",
  trendTitle: "\uC77C\uBCC4 \uC810\uC218 \uCD94\uC774",
  hrRecord: "\uC778\uC0AC\uAE30\uB85D\uBD80",
  hrRecordHint: "\uC2DC\uACF5\uC790 \uC120\uD0DD \uD6C4 \uC778\uC0AC\uAE30\uB85D\uBD80\uB97C \uC5F4 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
  hrRecordSelectFirst: "\uD558\uB2E8 \uBAA9\uB85D\uC5D0\uC11C \uC2DC\uACF5\uC790\uB97C \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.",
  hrRecordOpen: "\uBCF4\uAE30",
};

type ProbationEvalDashboardProps = {
  requests: ProbationEvalRequest[];
  templates: ProbationEvalTemplate[];
  workers?: import("@/utils/workerPayments").WorkerMasterLike[];
  companyProfile?: CompanyProfile;
};

function todayISO() {
  const now = new Date();
  const kst = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  return `${kst.getFullYear()}-${String(kst.getMonth() + 1).padStart(2, "0")}-${String(kst.getDate()).padStart(2, "0")}`;
}

export function ProbationEvalDashboard({
  requests,
  templates,
  workers = [],
  companyProfile,
}: ProbationEvalDashboardProps) {
  const [dateFrom, setDateFrom] = useState(() => {
    const base = new Date(`${todayISO()}T12:00:00+09:00`);
    base.setDate(base.getDate() - 30);
    return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(base.getDate()).padStart(2, "0")}`;
  });
  const [dateTo, setDateTo] = useState(todayISO);
  const [workerQuery, setWorkerQuery] = useState("");
  const [selectedWorkerId, setSelectedWorkerId] = useState("");
  const [hrRecordOpen, setHrRecordOpen] = useState(false);

  const normalizedRequests = useMemo(() => normalizeProbationEvalRequests(requests), [requests]);
  const template = useMemo(() => resolveActiveProbationEvalTemplate(templates), [templates]);

  const filteredRequests = useMemo(() => {
    const from = dateFrom.slice(0, 10);
    const to = dateTo.slice(0, 10);
    const q = workerQuery.trim().toLowerCase();
    return normalizedRequests.filter((row) => {
      if (row.workDate < from || row.workDate > to) return false;
      if (q && !row.probationWorkerName.toLowerCase().includes(q)) return false;
      if (selectedWorkerId && row.probationWorkerId !== selectedWorkerId) return false;
      return true;
    });
  }, [dateFrom, dateTo, normalizedRequests, selectedWorkerId, workerQuery]);

  const completion = useMemo(() => dailyCompletionRate(filteredRequests), [filteredRequests]);
  const workerAggregates = useMemo(() => aggregateByWorker(filteredRequests), [filteredRequests]);
  const questionAggregates = useMemo(
    () => aggregateByQuestion(filteredRequests, template),
    [filteredRequests, template],
  );
  const trend = useMemo(
    () => (selectedWorkerId ? dailyTrend(selectedWorkerId, filteredRequests) : []),
    [filteredRequests, selectedWorkerId],
  );

  const selectedWorkerName =
    workerAggregates.find((row) => row.probationWorkerId === selectedWorkerId)?.probationWorkerName || "";

  const resolvedCompanyProfile = companyProfile || DEFAULT_COMPANY_PROFILE;

  const isTeamHrRecordWorker = (workerId: string, workerName: string) => {
    const worker = resolveWorkerForEval(workers, workerId, workerName);
    if (!worker) return true;
    return normalizeWorkerCategory(worker.category) !== WORKER_CATEGORY_OUTSOURCE;
  };

  const openHrRecord = (workerId: string, workerName: string) => {
    setSelectedWorkerId(workerId);
    setHrRecordOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900">{L.title}</h3>
          <p className="text-sm text-slate-500">
            {L.completion}: {completion.submitted}/{completion.total} ({completion.rate}%)
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Button
            type="button"
            size="sm"
            className="rounded-lg"
            disabled={!selectedWorkerId || !isTeamHrRecordWorker(selectedWorkerId, selectedWorkerName)}
            onClick={() => setHrRecordOpen(true)}
          >
            <FileText size={14} className="mr-1.5" />
            {L.hrRecord}
          </Button>
          <p className="text-xs text-slate-400">
            {selectedWorkerId ? L.hrRecordHint : L.hrRecordSelectFirst}
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <label className="space-y-1 text-sm">
          <span className="font-semibold text-slate-600">{L.dateFrom}</span>
          <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="rounded-lg" />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-semibold text-slate-600">{L.dateTo}</span>
          <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="rounded-lg" />
        </label>
        <label className="space-y-1 text-sm md:col-span-2">
          <span className="font-semibold text-slate-600">{L.workerFilter}</span>
          <Input value={workerQuery} onChange={(event) => setWorkerQuery(event.target.value)} className="rounded-lg" />
        </label>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h4 className="text-sm font-bold text-slate-900 mb-3">{L.workerScores}</h4>
          {workerAggregates.length ? (
            <div className="space-y-2 max-h-64 overflow-auto">
              {workerAggregates.map((row) => (
                <div
                  key={row.probationWorkerId}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${
                    selectedWorkerId === row.probationWorkerId
                      ? "border-blue-500 bg-blue-50"
                      : "border-slate-200"
                  }`}
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left text-sm hover:opacity-90"
                    onClick={() =>
                      setSelectedWorkerId((prev) =>
                        prev === row.probationWorkerId ? "" : row.probationWorkerId,
                      )
                    }
                  >
                    <div className="font-semibold text-slate-900">{row.probationWorkerName}</div>
                    <div className="text-xs text-slate-500">
                      {row.submittedCount}/{row.requestCount} {"\u00B7"} avg {Math.round(row.averageScore * 10) / 10}
                    </div>
                  </button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="shrink-0 rounded-lg text-xs"
                    disabled={!isTeamHrRecordWorker(row.probationWorkerId, row.probationWorkerName)}
                    onClick={() => openHrRecord(row.probationWorkerId, row.probationWorkerName)}
                  >
                    <FileText size={13} className="mr-1" />
                    {L.hrRecordOpen}
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">{L.noData}</p>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h4 className="text-sm font-bold text-slate-900 mb-3">{L.questionAvg}</h4>
          {questionAggregates.some((row) => row.responseCount > 0) ? (
            <div className="space-y-2">
              {questionAggregates.map((row) => (
                <div key={row.questionId} className="flex items-center justify-between text-sm">
                  <span className="text-slate-700">{row.label}</span>
                  <span className="font-semibold text-slate-900">
                    {row.responseCount ? Math.round(row.averageScore * 10) / 10 : "-"}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">{L.noData}</p>
          )}
        </section>
      </div>

      {selectedWorkerId && trend.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h4 className="text-sm font-bold text-slate-900 mb-3">{L.trendTitle}</h4>
          <div className="flex flex-wrap gap-2">
            {trend.map((point) => (
              <div key={point.workDate} className="rounded-lg border border-slate-200 px-3 py-2 text-xs">
                <div className="text-slate-500">{point.workDate}</div>
                <div className="font-bold text-slate-900">{Math.round(point.averageScore * 10) / 10}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h4 className="text-sm font-bold text-slate-900 mb-3">{L.requests}</h4>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="py-2 pr-3">{"\uB0A0\uC9DC"}</th>
                <th className="py-2 pr-3">{"\uD604\uC7A5"}</th>
                <th className="py-2 pr-3">{"\uC218\uC2B5\uC790"}</th>
                <th className="py-2 pr-3">{"\uD3C9\uAC00\uC790"}</th>
                <th className="py-2 pr-3">{"\uC0C1\uD0DC"}</th>
                <th className="py-2 pr-3">{"\uC810\uC218"}</th>
              </tr>
            </thead>
            <tbody>
              {filteredRequests.map((row) => (
                <tr key={row.id} className="border-b border-slate-100">
                  <td className="py-2 pr-3">{row.workDate}</td>
                  <td className="py-2 pr-3">{row.siteName || "-"}</td>
                  <td className="py-2 pr-3">{row.probationWorkerName}</td>
                  <td className="py-2 pr-3">{row.evaluatorName}</td>
                  <td className="py-2 pr-3">{L.status[row.status as keyof typeof L.status] || row.status}</td>
                  <td className="py-2 pr-3">{row.totalScore ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filteredRequests.length && <p className="py-4 text-sm text-slate-500">{L.noData}</p>}
        </div>
      </section>

      {selectedWorkerId ? (
        <WorkerHrRecordModal
          open={hrRecordOpen}
          onClose={() => setHrRecordOpen(false)}
          workerId={selectedWorkerId}
          workerName={selectedWorkerName}
          dateFrom={dateFrom}
          dateTo={dateTo}
          workers={workers}
          requests={requests}
          templates={templates}
          companyProfile={resolvedCompanyProfile}
        />
      ) : null}
    </div>
  );
}
