import { useMemo, useState } from "react";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { WorkerHrRecordModal } from "@/components/WorkerHrRecordModal";
import type { CompanyProfile } from "@/utils/companyProfile";
import { DEFAULT_COMPANY_PROFILE } from "@/utils/companyProfile";
import {
  buildWorkerHrRecordList,
  formatHrScore,
  type WorkerHrRecordListRow,
} from "@/utils/probationEvalHrRecord";
import type { ProbationEvalRequest, ProbationEvalTemplate } from "@/utils/probationEval";
import type { WorkerMasterLike } from "@/utils/workerPayments";

const L = {
  title: "\uD300\uC6D0 \uC778\uC0AC\uAE30\uB85D\uBD80",
  desc: "\uD300\uC6D0\uC758 \uC218\uC2B5 \uD3C9\uAC00 \uC774\uB825\uC744 \uAE30\uAC04\uBCC4\uB85C \uC870\uD68C\uD558\uACE0 \uC778\uC0AC\uAE30\uB85D\uBD80\uB97C \uC5F4 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
  dateFrom: "\uC2DC\uC791\uC77C",
  dateTo: "\uC885\uB8CC\uC77C",
  search: "\uC774\uB984, \uB4F1\uAE09, \uC785\uC0AC\uC77C \uAC80\uC0C9",
  includeInactive: "\uBE44\uD65C\uC131 \uD3EC\uD568",
  name: "\uC774\uB984",
  grade: "\uB4F1\uAE09",
  hireDate: "\uC785\uC0AC\uC77C",
  status: "\uC0C1\uD0DC",
  evalCount: "\uD3C9\uAC00\uAC74\uC218",
  submittedCount: "\uC81C\uCD9C\uAC74\uC218",
  averageScore: "\uD3C9\uADE0\uC810\uC218",
  action: "\uBCF4\uAE30",
  active: "\uD65C\uC131",
  inactive: "\uBE44\uD65C\uC131",
  noData: "\uD574\uB2F9 \uC870\uAC74\uC758 \uD300\uC6D0\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  rowCount: "\uCD1D",
};

type WorkerHrRecordPanelProps = {
  workers: WorkerMasterLike[];
  requests: ProbationEvalRequest[];
  templates: ProbationEvalTemplate[];
  companyProfile?: CompanyProfile;
};

function todayISO() {
  const now = new Date();
  const kst = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  return `${kst.getFullYear()}-${String(kst.getMonth() + 1).padStart(2, "0")}-${String(kst.getDate()).padStart(2, "0")}`;
}

type SelectedWorker = {
  workerId: string;
  workerName: string;
};

export function WorkerHrRecordPanel({
  workers,
  requests,
  templates,
  companyProfile,
}: WorkerHrRecordPanelProps) {
  const [dateFrom, setDateFrom] = useState(() => {
    const base = new Date(`${todayISO()}T12:00:00+09:00`);
    base.setDate(base.getDate() - 30);
    return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(base.getDate()).padStart(2, "0")}`;
  });
  const [dateTo, setDateTo] = useState(todayISO);
  const [query, setQuery] = useState("");
  const [includeInactive, setIncludeInactive] = useState(true);
  const [selectedWorker, setSelectedWorker] = useState<SelectedWorker | null>(null);
  const [hrRecordOpen, setHrRecordOpen] = useState(false);

  const resolvedCompanyProfile = companyProfile || DEFAULT_COMPANY_PROFILE;

  const rows = useMemo(
    () =>
      buildWorkerHrRecordList({
        workers,
        requests,
        dateFrom,
        dateTo,
        query,
        includeInactive,
      }),
    [workers, requests, dateFrom, dateTo, query, includeInactive],
  );

  const openHrRecord = (row: WorkerHrRecordListRow) => {
    setSelectedWorker({ workerId: row.workerId, workerName: row.workerName });
    setHrRecordOpen(true);
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-bold text-slate-900">{L.title}</h3>
        <p className="text-sm text-slate-500">{L.desc}</p>
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
          <span className="font-semibold text-slate-600">{L.search}</span>
          <Input value={query} onChange={(event) => setQuery(event.target.value)} className="rounded-lg" />
        </label>
      </div>

      <label className="inline-flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          className="rounded border-slate-300"
          checked={includeInactive}
          onChange={(event) => setIncludeInactive(event.target.checked)}
        />
        <span>{L.includeInactive}</span>
      </label>

      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-4 md:p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h4 className="text-sm font-bold text-slate-900">{L.title}</h4>
            <span className="text-xs text-slate-500">
              {L.rowCount} {rows.length}
            </span>
          </div>
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="py-2 pr-3">{L.name}</th>
                  <th className="py-2 pr-3">{L.grade}</th>
                  <th className="py-2 pr-3">{L.hireDate}</th>
                  <th className="py-2 pr-3">{L.status}</th>
                  <th className="py-2 pr-3 text-right">{L.evalCount}</th>
                  <th className="py-2 pr-3 text-right">{L.submittedCount}</th>
                  <th className="py-2 pr-3 text-right">{L.averageScore}</th>
                  <th className="py-2 pr-3">{L.action}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.workerId || row.workerName} className="border-b border-slate-100">
                    <td className="py-2 pr-3 font-semibold text-slate-900">{row.workerName}</td>
                    <td className="py-2 pr-3">{row.grade || "\u2014"}</td>
                    <td className="py-2 pr-3">{row.hireDate || "\u2014"}</td>
                    <td className="py-2 pr-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                          row.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {row.isActive ? L.active : L.inactive}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-right">{row.evalCount}</td>
                    <td className="py-2 pr-3 text-right">{row.submittedCount}</td>
                    <td className="py-2 pr-3 text-right">{formatHrScore(row.averageScore)}</td>
                    <td className="py-2 pr-3">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="rounded-lg text-xs"
                        onClick={() => openHrRecord(row)}
                      >
                        <FileText size={13} className="mr-1" />
                        {L.action}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length && <p className="py-4 text-sm text-slate-500">{L.noData}</p>}
          </div>
        </CardContent>
      </Card>

      {selectedWorker ? (
        <WorkerHrRecordModal
          open={hrRecordOpen}
          onClose={() => setHrRecordOpen(false)}
          workerId={selectedWorker.workerId}
          workerName={selectedWorker.workerName}
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
