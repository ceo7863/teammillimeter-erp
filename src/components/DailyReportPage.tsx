import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ClipboardList, Loader2, RefreshCw, Send, Sun, Sunrise, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DesktopTableWrap } from "@/components/MobileRecordCard";
import { formatKRW } from "@/utils/receivables";
import {
  fetchDailyReportPage,
  type DailyReportPageData,
  type DailyReportSiteSchedule,
  type DailyReportVacationSummary,
} from "@/utils/dailyReportApi";
import { previewDailyReport, sendDailyReportNow } from "@/utils/notificationApi";
import { formatAttendanceTime } from "@/utils/attendance";
import type { ErpUser } from "@/utils/erpApi";

const L = {
  title: "\uC77C\uC77C\uBCF4\uACE0",
  desc: "\uC5B4\uC81C \uC2E4\uC801, \uC624\uB298 \uADFC\uD0DC, SC \uAC1C\uC778\uD734\uAC00 \u00B7 \uD604\uC7A5 \uC77C\uC815\uC744 \uD55C \uD654\uBA74\uC5D0\uC11C \uD655\uC778\uD569\uB2C8\uB2E4.",
  refresh: "SC \uB3D9\uAE30\uD654 \uD6C4 \uC0C8\uB85C\uACE0\uCE68",
  refreshFast: "\uBE60\uB978 \uC0C8\uB85C\uACE0\uCE68",
  loading: "\uC77C\uC77C\uBCF4\uACE0\uB97C \uBD88\uB7EC\uC624\uB294 \uC911...",
  loadError: "\uC77C\uC77C\uBCF4\uACE0\uB97C \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.",
  yesterdayTitle: "\uC5B4\uC81C \uC2E4\uC801",
  yesterdayHint: "\uC54C\uB9BC\uD1A1 \uC77C\uC77C\uBCF4\uACE0\uC640 \uB3D9\uC77C \uAE30\uC900",
  taxSales: "\uB9E4\uCD9C \uC138\uAE08\uACC4\uC0B0\uC11C",
  taxPurchase: "\uB9E4\uC785 \uC138\uAE08\uACC4\uC0B0\uC11C",
  bankDeposit: "\uC785\uAE08",
  bankWithdraw: "\uCD9C\uAE08",
  bankBalance: "\uC794\uC561",
  salesCount: "\uB9E4\uCD9C\uC804\uD45C",
  salesBill: "\uCCAD\uAC74\uC561",
  salesMargin: "\uB9C8\uC9C4",
  attendanceTitle: "\uC624\uB298 \uADFC\uD0DC \uC694\uC57D",
  attendanceCheckedIn: "\uCD9C\uADFC",
  attendanceWorking: "\uADFC\uBB34 \uC911",
  attendanceDone: "\uD1F4\uADFC",
  attendanceEmpty: "\uC624\uB298 \uADFC\uD0DC \uAE30\uB85D\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  vacationToday: "\uC624\uB298 \uAC1C\uC778\uD734\uAC00 (SC)",
  vacationTomorrow: "\uB0B4\uC77C \uAC1C\uC778\uD734\uAC00 (SC)",
  vacationEmpty: "\uD734\uAC00 \uC778\uC6D0 \uC5C6\uC74C",
  siteToday: "\uC624\uB298 SC \uD604\uC7A5",
  siteTomorrow: "\uB0B4\uC77C SC \uD604\uC7A5",
  siteEmpty: "\uD604\uC7A5 \uC77C\uC815 \uC5C6\uC74C",
  name: "\uC774\uB984",
  time: "\uC2DC\uAC04",
  status: "\uC0C1\uD0DC",
  site: "\uD604\uC7A5",
  workers: "\uC2DC\uACF5\uC790",
  checkIn: "\uCD9C\uADFC",
  checkOut: "\uD1F4\uADFC",
  alimtalkPreview: "\uC5B4\uC81C \uC77C\uC77C\uBCF4\uACE0 \uC54C\uB9BC\uD1A1 \uBBF8\uB9AC\uBCF4\uAE30",
  alimtalkSend: "\uC77C\uC77C\uBCF4\uACE0 \uBC1C\uC1A1",
  alimtalkSending: "\uBC1C\uC1A1 \uC911...",
  alimtalkSent: "\uC77C\uC77C\uBCF4\uACE0 \uBC1C\uC1A1\uC744 \uC694\uCCAD\uD588\uC2B5\uB2C8\uB2E4.",
  scSyncAt: (value: string) => `SC \uB3D9\uAE30\uD654: ${value}`,
  scNotConfigured: "SC \uC5F0\uB3D9 \uBBF8\uC124\uC815",
  working: "\uADFC\uBB34 \uC911",
  done: "\uD1F4\uADFC \uC644\uB8CC",
};

type DailyReportPageProps = {
  currentUser?: ErpUser | null;
};

function PageTitle({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="mb-4">
      <h1 className="erp-text-page-title">{title}</h1>
      {desc ? <p className="erp-text-caption mt-1 text-slate-500">{desc}</p> : null}
    </div>
  );
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-black text-slate-900">{value}</div>
      {sub ? <div className="mt-1 text-xs text-slate-500">{sub}</div> : null}
    </div>
  );
}

function VacationSection({ title, icon, summary }: { title: string; icon: ReactNode; summary: DailyReportVacationSummary }) {
  return (
    <Card className="rounded-2xl shadow-sm">
      <CardContent className="p-4 md:p-5">
        <div className="mb-3 flex items-center gap-2">
          {icon}
          <div>
            <h3 className="text-sm font-bold text-slate-900">{title}</h3>
            <p className="text-xs text-slate-500">{summary.count}{"\uBA85"}</p>
          </div>
        </div>
        {summary.members.length ? (
          <DesktopTableWrap>
            <table className="erp-table min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="text-left">{L.name}</th>
                  <th className="text-left">{L.time}</th>
                </tr>
              </thead>
              <tbody>
                {summary.members.map((member) => (
                  <tr key={`${member.scheduleId}-${member.name}`} className="border-t border-slate-100">
                    <td className="font-semibold text-slate-900">{member.name}</td>
                    <td className="text-slate-600">
                      {[member.startTime, member.endTime].filter(Boolean).join(" ~ ") || member.workType || "\u2014"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DesktopTableWrap>
        ) : (
          <p className="text-sm text-slate-500">{L.vacationEmpty}</p>
        )}
      </CardContent>
    </Card>
  );
}

function SiteScheduleSection({
  title,
  schedules,
}: {
  title: string;
  schedules: DailyReportSiteSchedule[];
}) {
  return (
    <Card className="rounded-2xl shadow-sm">
      <CardContent className="p-4 md:p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
          <span className="text-xs text-slate-500">{schedules.length}{"\uAC74"}</span>
        </div>
        {schedules.length ? (
          <div className="space-y-2">
            {schedules.map((row) => (
              <div key={row.id} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
                <div className="font-semibold text-slate-900">{row.siteName || row.projectName || "\u2014"}</div>
                <div className="mt-1 text-xs text-slate-500">
                  {[row.startTime, row.endTime].filter(Boolean).join(" ~ ")}
                  {row.participantNames.length ? ` \u00B7 ${row.participantNames.join(", ")}` : ""}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">{L.siteEmpty}</p>
        )}
      </CardContent>
    </Card>
  );
}

export function DailyReportPage({ currentUser }: DailyReportPageProps) {
  const [data, setData] = useState<DailyReportPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [alimtalkMessage, setAlimtalkMessage] = useState("");
  const [alimtalkBusy, setAlimtalkBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState("");

  const isAdmin = currentUser?.role === "admin";

  const load = useCallback(async (skipSync: boolean) => {
    setError("");
    const result = await fetchDailyReportPage({ skipSync });
    setData(result);
    setAlimtalkMessage(result.alimtalkMessage || "");
  }, []);

  useEffect(() => {
    setLoading(true);
    void load(true)
      .catch((err) => setError(err instanceof Error ? err.message : L.loadError))
      .finally(() => setLoading(false));
  }, [load]);

  const handleRefresh = async (skipSync: boolean) => {
    setRefreshing(true);
    setActionMessage("");
    try {
      await load(skipSync);
    } catch (err) {
      setError(err instanceof Error ? err.message : L.loadError);
    } finally {
      setRefreshing(false);
    }
  };

  const handleAlimtalkPreview = async () => {
    setAlimtalkBusy(true);
    setActionMessage("");
    try {
      const preview = await previewDailyReport();
      setAlimtalkMessage(String(preview.message || ""));
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : L.loadError);
    } finally {
      setAlimtalkBusy(false);
    }
  };

  const handleAlimtalkSend = async () => {
    if (!window.confirm("\uC5B4\uC81C \uAE30\uC900 \uC77C\uC77C\uBCF4\uACE0 \uC54C\uB9BC\uD1A1\uC744 \uBC1C\uC1A1\uD560\uAE4C\uC694?")) return;
    setAlimtalkBusy(true);
    setActionMessage("");
    try {
      await sendDailyReportNow({ skipSync: true });
      setActionMessage(L.alimtalkSent);
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : L.loadError);
    } finally {
      setAlimtalkBusy(false);
    }
  };

  const scSyncLabel = data?.scSyncMeta?.lastSuccessAt
    ? L.scSyncAt(String(data.scSyncMeta.lastSuccessAt).slice(0, 16).replace("T", " "))
    : data?.scConfigured
      ? L.scSyncAt("\u2014")
      : L.scNotConfigured;

  return (
    <div className="erp-page">
      <PageTitle title={L.title} desc={L.desc} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" className="rounded-xl" disabled={refreshing} onClick={() => void handleRefresh(false)}>
          {refreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          {L.refresh}
        </Button>
        <Button type="button" variant="ghost" className="rounded-xl" disabled={refreshing} onClick={() => void handleRefresh(true)}>
          {L.refreshFast}
        </Button>
        <span className="text-xs text-slate-500">{scSyncLabel}</span>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          {L.loading}
        </div>
      ) : null}
      {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}
      {actionMessage ? <p className="mb-4 text-sm text-emerald-700">{actionMessage}</p> : null}

      {data ? (
        <div className="space-y-4">
          <section>
            <div className="mb-3 flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-slate-500" />
              <div>
                <h2 className="text-sm font-bold text-slate-900">{L.yesterdayTitle}</h2>
                <p className="text-xs text-slate-500">
                  {data.yesterday.dateKey.replace(/-/g, ".")} {"\u00B7"} {L.yesterdayHint}
                </p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard
                label={L.taxSales}
                value={`${data.yesterday.taxSales.count}\uAC74`}
                sub={formatKRW(data.yesterday.taxSales.total)}
              />
              <KpiCard
                label={L.taxPurchase}
                value={`${data.yesterday.taxPurchase.count}\uAC74`}
                sub={formatKRW(data.yesterday.taxPurchase.total)}
              />
              <KpiCard label={L.bankDeposit} value={formatKRW(data.yesterday.bank.deposits)} sub={L.bankWithdraw + " " + formatKRW(data.yesterday.bank.withdrawals)} />
              <KpiCard label={L.bankBalance} value={formatKRW(data.yesterday.bank.balance)} sub={`${L.salesCount} ${data.yesterday.sales.count}\uAC74`} />
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <KpiCard label={L.salesBill} value={formatKRW(data.yesterday.sales.bill)} />
              <KpiCard label={L.salesMargin} value={formatKRW(data.yesterday.sales.margin)} />
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <Card className="rounded-2xl shadow-sm">
              <CardContent className="p-4 md:p-5">
                <div className="mb-3 flex items-center gap-2">
                  <Users className="h-4 w-4 text-slate-500" />
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">{L.attendanceTitle}</h3>
                    <p className="text-xs text-slate-500">{data.today.attendance.label}</p>
                  </div>
                </div>
                <div className="mb-3 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-xl bg-slate-50 px-2 py-2">
                    <div className="font-bold text-slate-900">{data.today.attendance.checkedInCount}</div>
                    <div className="text-slate-500">{L.attendanceCheckedIn}</div>
                  </div>
                  <div className="rounded-xl bg-blue-50 px-2 py-2">
                    <div className="font-bold text-blue-800">{data.today.attendance.workingCount}</div>
                    <div className="text-blue-600">{L.attendanceWorking}</div>
                  </div>
                  <div className="rounded-xl bg-emerald-50 px-2 py-2">
                    <div className="font-bold text-emerald-800">{data.today.attendance.doneCount}</div>
                    <div className="text-emerald-600">{L.attendanceDone}</div>
                  </div>
                </div>
                {data.today.attendance.members.length ? (
                  <DesktopTableWrap>
                    <table className="erp-table min-w-full text-sm">
                      <thead className="bg-slate-50 text-slate-500">
                        <tr>
                          <th className="text-left">{L.name}</th>
                          <th className="text-left">{L.checkIn}</th>
                          <th className="text-left">{L.checkOut}</th>
                          <th className="text-left">{L.status}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.today.attendance.members.map((member) => (
                          <tr key={`${member.userId}-${member.userName}`} className="border-t border-slate-100">
                            <td className="font-semibold text-slate-900">{member.userName}</td>
                            <td>{formatAttendanceTime(member.checkInAt)}</td>
                            <td>{formatAttendanceTime(member.checkOutAt)}</td>
                            <td>{member.status === "working" ? L.working : L.done}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </DesktopTableWrap>
                ) : (
                  <p className="text-sm text-slate-500">{L.attendanceEmpty}</p>
                )}
              </CardContent>
            </Card>

            <VacationSection title={L.vacationToday} icon={<Sun className="h-4 w-4 text-amber-500" />} summary={data.today.vacation} />
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <VacationSection title={L.vacationTomorrow} icon={<Sunrise className="h-4 w-4 text-orange-500" />} summary={data.tomorrow.vacation} />
            <SiteScheduleSection title={L.siteToday} schedules={data.today.siteSchedules} />
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <SiteScheduleSection title={L.siteTomorrow} schedules={data.tomorrow.siteSchedules} />
            {isAdmin ? (
              <Card className="rounded-2xl shadow-sm">
                <CardContent className="p-4 md:p-5">
                  <h3 className="mb-3 text-sm font-bold text-slate-900">{L.alimtalkPreview}</h3>
                  <pre className="max-h-64 overflow-auto rounded-xl bg-slate-50 p-3 text-xs whitespace-pre-wrap text-slate-700">{alimtalkMessage || "\u2014"}</pre>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" className="rounded-xl" disabled={alimtalkBusy} onClick={() => void handleAlimtalkPreview()}>
                      {L.alimtalkPreview}
                    </Button>
                    <Button type="button" size="sm" className="rounded-xl" disabled={alimtalkBusy} onClick={() => void handleAlimtalkSend()}>
                      {alimtalkBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                      {alimtalkBusy ? L.alimtalkSending : L.alimtalkSend}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : null}
          </section>
        </div>
      ) : null}
    </div>
  );
}
