import { Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EvalQuestionBarChart, EvalRadarChart, EvalTrendChart } from "@/components/WorkerHrRecordCharts";
import type { CompanyProfile } from "@/utils/companyProfile";
import {
  formatHrScore,
  type WorkerHrRecordData,
  type WorkerProfileExtended,
} from "@/utils/probationEvalHrRecord";
import { WORKER_CATEGORY_OUTSOURCE } from "@/utils/workerPayments";
import "@/styles/worker-hr-record.css";

const L = {
  title: "\uC778\uC0AC\uAE30\uB85D\uBD80",
  subtitle: "\uC218\uC2B5 \u00B7 \uC77C\uC77C\uD604\uC7A5\uD3C9\uAC00 \uC885\uD569",
  personal: "\uC778\uC801\uC0AC\uD56D",
  evalSummary: "\uD3C9\uAC00 \uC694\uC57D",
  competency: "\uC5ED\uB7C9 \uD504\uB85C\uD30C\uC77C",
  trend: "\uC77C\uBCC4 \uC810\uC218 \uCD94\uC774",
  questionDetail: "\uD56D\uBAA9\uBCC4 \uD3C9\uADE0",
  history: "\uD3C9\uAC00 \uC774\uB825",
  promotion: "\uC9C4\uAE09\uD3C9\uAC00 \uC885\uD569",
  strengths: "\uAC15\uC810",
  improvements: "\uBCF4\uC644\uC810",
  autoNote: "\uBCF8 \uBB38\uC11C\uB294 ERP \uC77C\uC77C\uD3C9\uAC00 \uB370\uC774\uD130\uB97C \uAE30\uC900\uC73C\uB85C \uC790\uB3D9 \uC0DD\uC131\uB418\uC5C8\uC2B5\uB2C8\uB2E4.",
  print: "\uC778\uC1C4",
  pdf: "PDF \uC800\uC7A5",
  docNo: "\uBB38\uC11C\uBC88\uD638",
  issued: "\uBC1C\uAE09\uC77C",
  period: "\uD3C9\uAC00\uAE30\uAC04",
  name: "\uC131\uBA85",
  grade: "\uC2DC\uACF5\uB4F1\uAE09",
  category: "\uAD6C\uBD84",
  hireDate: "\uC785\uC0AC\uC77C",
  phone: "\uC5F0\uB77D\uCC98",
  vehicle: "\uCC28\uB7C9\uBC88\uD638",
  address: "\uC8FC\uC18C",
  businessNo: "\uC0AC\uC5C5\uC790\uBC88\uD638",
  cost: "\uC2DC\uACF5\uBE44",
  bank: "\uC740\uD589 \u00B7 \uACC4\uC870",
  memo: "\uBE44\uACE0",
  avgScore: "\uD3C9\uADE0 \uC810\uC218",
  latestScore: "\uC804\uAD00 \uC810\uC218",
  submitCount: "\uD3C9\uAC00 \uC81C\uCD9C",
  completion: "\uC644\uB8CC\uC728",
  date: "\uC77C\uC790",
  site: "\uD604\uC7A5",
  evaluator: "\uD3C9\uAC00\uC790",
  status: "\uC0C1\uD0DC",
  score: "\uC810\uC218",
  noHistory: "\uD574\uB2F9 \uAE30\uAC04 \uD3C9\uAC00 \uC774\uB825\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  generating: "\uC0DD\uC131 \uC911\u2026",
  team: "\uD300\uC6D0",
  outsource: "\uC678\uC8FC",
  statusSubmitted: "\uC81C\uCD9C\uC644\uB8CC",
  statusSent: "\uBC1C\uC1A1",
  statusExpired: "\uB9CC\uB8CC",
  statusPending: "\uB300\uAE30",
};

function formatDateKo(iso?: string) {
  if (!iso) return "\u2014";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
  if (!match) return iso;
  return `${match[1]}.${match[2]}.${match[3]}`;
}

function categoryLabel(category?: string) {
  return String(category || "").trim() === WORKER_CATEGORY_OUTSOURCE ? L.outsource : L.team;
}

function gradeBadgeClass(grade: WorkerHrRecordData["assessment"]["grade"]) {
  switch (grade) {
    case "strong":
      return "is-strong";
    case "recommend":
      return "is-recommend";
    case "reject":
      return "is-reject";
    default:
      return "is-hold";
  }
}

function requestStatusLabel(status: string) {
  if (status === "submitted") return L.statusSubmitted;
  if (status === "sent") return L.statusSent;
  if (status === "expired") return L.statusExpired;
  return L.statusPending;
}

type WorkerHrRecordSheetProps = {
  data: WorkerHrRecordData;
  companyProfile: CompanyProfile;
  exportRootId?: string;
  onDownloadPdf?: () => void | Promise<void>;
  pdfBusy?: boolean;
};

export function WorkerHrRecordSheet({
  data,
  companyProfile,
  exportRootId = "worker-hr-record-export",
  onDownloadPdf,
  pdfBusy = false,
}: WorkerHrRecordSheetProps) {
  const worker = (data.worker || {}) as WorkerProfileExtended;
  const companyName = companyProfile.name || "(\uC8FC)\uD300\uBC00\uB9AC\uBBF8\uD130";

  return (
    <div className="worker-hr-record-shell">
      <div className="worker-hr-record-toolbar print:hidden">
        <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" />
          {L.print}
        </Button>
        {onDownloadPdf ? (
          <Button type="button" size="sm" className="rounded-xl" onClick={() => void onDownloadPdf()} disabled={pdfBusy}>
            <Download className="mr-2 h-4 w-4" />
            {pdfBusy ? L.generating : L.pdf}
          </Button>
        ) : null}
      </div>

      <article id={exportRootId} data-pdf-export-root className="worker-hr-record-doc">
        <header className="worker-hr-record-header">
          <div className="worker-hr-record-header-top">
            <div className="worker-hr-record-brand">
              <div className="worker-hr-record-logo" aria-hidden>
                {companyName.slice(0, 2)}
              </div>
              <div>
                <div className="worker-hr-record-company">{companyName}</div>
                <div className="worker-hr-record-doc-type">{L.title}</div>
              </div>
            </div>
            <div className="worker-hr-record-meta">
              <div>
                {L.docNo} {data.documentNo}
              </div>
              <div>
                {L.issued} {formatDateKo(data.issuedAt)}
              </div>
              <div>
                {L.period} {formatDateKo(data.periodFrom)} ~ {formatDateKo(data.periodTo)}
              </div>
            </div>
          </div>
          <p className="worker-hr-record-subtitle">{L.subtitle}</p>
        </header>

        <section className="worker-hr-record-section">
          <h2>{L.personal}</h2>
          <div className="worker-hr-record-profile">
            <div className="worker-hr-record-photo" aria-hidden>
              {String(data.workerName || "?").slice(0, 1)}
            </div>
            <dl className="worker-hr-record-dl">
              <div>
                <dt>{L.name}</dt>
                <dd className="is-emphasis">{data.workerName}</dd>
              </div>
              <div>
                <dt>{L.grade}</dt>
                <dd>{worker.grade || "\u2014"}</dd>
              </div>
              <div>
                <dt>{L.category}</dt>
                <dd>{categoryLabel(worker.category)}</dd>
              </div>
              <div>
                <dt>{L.hireDate}</dt>
                <dd>{formatDateKo(worker.hireDate)}</dd>
              </div>
              <div>
                <dt>{L.phone}</dt>
                <dd>{worker.phone || "\u2014"}</dd>
              </div>
              <div>
                <dt>{L.vehicle}</dt>
                <dd>{worker.vehicleNo || "\u2014"}</dd>
              </div>
              <div>
                <dt>{L.address}</dt>
                <dd>{worker.address || "\u2014"}</dd>
              </div>
              <div>
                <dt>{L.businessNo}</dt>
                <dd>{worker.businessNo || "\u2014"}</dd>
              </div>
              <div>
                <dt>{L.cost}</dt>
                <dd>
                  {worker.constructionCost
                    ? `${Number(worker.constructionCost).toLocaleString("ko-KR")}\uC6D0`
                    : "\u2014"}
                </dd>
              </div>
              <div>
                <dt>{L.bank}</dt>
                <dd>{[worker.bank, worker.account].filter(Boolean).join(" ") || "\u2014"}</dd>
              </div>
              <div className="span-2">
                <dt>{L.memo}</dt>
                <dd>{worker.memo || "\u2014"}</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="worker-hr-record-section">
          <h2>{L.evalSummary}</h2>
          <div className="worker-hr-record-kpis">
            <div className="worker-hr-record-kpi">
              <span className="label">{L.avgScore}</span>
              <strong>{formatHrScore(data.averageScore)}</strong>
            </div>
            <div className="worker-hr-record-kpi">
              <span className="label">{L.latestScore}</span>
              <strong>{formatHrScore(data.latestScore)}</strong>
            </div>
            <div className="worker-hr-record-kpi">
              <span className="label">{L.submitCount}</span>
              <strong>
                {data.submittedCount}/{data.evalCount}
              </strong>
            </div>
            <div className="worker-hr-record-kpi">
              <span className="label">{L.completion}</span>
              <strong>{data.completionRate}%</strong>
            </div>
          </div>
        </section>

        <section className="worker-hr-record-section worker-hr-record-charts">
          <div className="worker-hr-record-chart-box">
            <h3>{L.competency}</h3>
            <EvalRadarChart scores={data.questionScores} />
          </div>
          <div className="worker-hr-record-chart-box">
            <h3>{L.trend}</h3>
            <EvalTrendChart points={data.trend} />
          </div>
        </section>

        <section className="worker-hr-record-section">
          <h2>{L.questionDetail}</h2>
          <EvalQuestionBarChart scores={data.questionScores} />
        </section>

        <section className="worker-hr-record-section">
          <h2>{L.promotion}</h2>
          <div className={`worker-hr-record-assessment ${gradeBadgeClass(data.assessment.grade)}`}>
            <div className="worker-hr-record-assessment-badge">{data.assessment.label}</div>
            <p className="worker-hr-record-assessment-summary">{data.assessment.summary}</p>
            <div className="worker-hr-record-assessment-cols">
              <div>
                <h4>{L.strengths}</h4>
                <ul>
                  {data.assessment.strengths.map((row) => (
                    <li key={row}>{row}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h4>{L.improvements}</h4>
                <ul>
                  {data.assessment.improvements.map((row) => (
                    <li key={row}>{row}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="worker-hr-record-section">
          <h2>{L.history}</h2>
          <table className="worker-hr-record-table">
            <thead>
              <tr>
                <th>{L.date}</th>
                <th>{L.site}</th>
                <th>{L.evaluator}</th>
                <th>{L.status}</th>
                <th>{L.score}</th>
              </tr>
            </thead>
            <tbody>
              {[...data.requests]
                .sort((a, b) => b.workDate.localeCompare(a.workDate))
                .slice(0, 20)
                .map((row) => (
                  <tr key={row.id}>
                    <td>{formatDateKo(row.workDate)}</td>
                    <td>{row.siteName || "\u2014"}</td>
                    <td>{row.evaluatorName || "\u2014"}</td>
                    <td>{requestStatusLabel(row.status)}</td>
                    <td>{row.totalScore ?? "\u2014"}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          {!data.requests.length ? <p className="worker-hr-record-empty">{L.noHistory}</p> : null}
        </section>

        <footer className="worker-hr-record-footer">
          <p>{L.autoNote}</p>
          <p>
            {companyName} \u00B7 {companyProfile.phone || ""} \u00B7 {companyProfile.address || ""}
          </p>
        </footer>
      </article>
    </div>
  );
}
