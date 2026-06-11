import { apiRequest } from "@/utils/erpApi";

export type DailyReportTaxSummary = {
  count: number;
  total: number;
};

export type DailyReportYesterdayStats = {
  dateKey: string;
  label: string;
  taxSales: DailyReportTaxSummary;
  taxPurchase: DailyReportTaxSummary;
  bank: {
    count: number;
    deposits: number;
    withdrawals: number;
    balance: number;
  };
  sales: {
    count: number;
    bill: number;
    margin: number;
  };
};

export type DailyReportVacationMember = {
  name: string;
  workType: string;
  startTime: string;
  endTime: string;
  scheduleId: string;
};

export type DailyReportVacationSummary = {
  dateKey: string;
  count: number;
  members: DailyReportVacationMember[];
};

export type DailyReportAttendanceMember = {
  userId: number;
  userName: string;
  checkInAt: string;
  checkOutAt: string;
  status: "working" | "done" | "absent";
};

export type DailyReportAttendanceSummary = {
  dateKey: string;
  label: string;
  total: number;
  checkedInCount: number;
  workingCount: number;
  doneCount: number;
  members: DailyReportAttendanceMember[];
};

export type DailyReportSiteSchedule = {
  id: string;
  workDate: string;
  projectName: string;
  siteName: string;
  workType: string;
  startTime: string;
  endTime: string;
  participantNames: string[];
  participantCount: number;
};

export type DailyReportPageData = {
  generatedAt: string;
  todayDateKey: string;
  yesterday: DailyReportYesterdayStats;
  today: {
    dateKey: string;
    label: string;
    vacation: DailyReportVacationSummary;
    attendance: DailyReportAttendanceSummary;
    siteSchedules: DailyReportSiteSchedule[];
    siteScheduleCount: number;
  };
  tomorrow: {
    dateKey: string;
    label: string;
    vacation: DailyReportVacationSummary;
    siteSchedules: DailyReportSiteSchedule[];
    siteScheduleCount: number;
  };
  scSyncMeta: Record<string, unknown> | null;
  scConfigured: boolean;
  alimtalkMessage: string;
};

export async function fetchDailyReportPage(options?: { skipSync?: boolean }) {
  const query = options?.skipSync ? "?skipSync=1" : "";
  return apiRequest<DailyReportPageData>(`/daily-report/page${query}`);
}
