import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Banknote,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileSpreadsheet,
  FileText,
  Printer,
  RefreshCw,
  Settings2,
  Users,
} from "lucide-react";
import type { AttendanceRecord } from "@/utils/attendance";
import {
  applyAttendanceToOfficePayrollSheet,
  formatAttendanceSummaryLabel,
  summarizeOfficeStaffAttendance,
} from "@/utils/officePayrollAttendance";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { CompanyProfile } from "@/utils/companyProfile";
import {
  isOfficeStaffActive,
  normalizeOfficeStaffRecordId,
  type OfficeStaffRecord,
} from "@/utils/officeStaff";
import {
  buildOfficePayrollSheetForMonth,
  currentMonthKey,
  formatMonthLabel,
  formatPayrollKRW,
  normalizeMoneyLines,
  OFFICE_PAYROLL_PAY_TYPE_LABELS,
  OFFICE_PAYROLL_STATUS_LABELS,
  recalculateOfficePayrollLine,
  recalculateOfficePayrollSheet,
  roundPayAmount,
  shiftMonthKey,
  summarizeOfficePayrollSheet,
  upsertOfficePayrollProfile,
  upsertOfficePayrollSheet,
  type OfficePayrollLine,
  type OfficePayrollPayType,
  type OfficePayrollProfile,
  type OfficePayrollSettings,
  type OfficePayrollSheet,
} from "@/utils/officePayroll";
import {
  downloadOfficePayrollBankExcel,
  downloadOfficePayrollSummaryExcel,
  printOfficePayrollAllPayslips,
  printOfficePayrollPayslip,
} from "@/utils/officePayrollExport";
import { OfficePayrollTaxTab } from "@/components/OfficePayrollTaxTab";

type OfficePayrollTab = "monthly" | "profiles" | "settings" | "tax";

type OfficePayrollPageProps = {
  officeStaff: OfficeStaffRecord[];
  attendanceRecords: AttendanceRecord[];
  companyProfile?: CompanyProfile;
  settings: OfficePayrollSettings;
  profiles: OfficePayrollProfile[];
  sheets: OfficePayrollSheet[];
  onPersist: (payload: {
    settings?: OfficePayrollSettings;
    profiles?: OfficePayrollProfile[];
    sheets?: OfficePayrollSheet[];
  }) => void | Promise<void | boolean>;
};

function PageTitle({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="mb-4">
      <h1 className="erp-text-page-title text-slate-900">{title}</h1>
      <p className="mt-1 erp-text-body text-slate-600">{desc}</p>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-white px-4 py-3 shadow-sm">
      <div className="erp-text-caption font-bold text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-bold text-slate-900">{value}</div>
    </div>
  );
}

function MoneyLinesEditor({
  title,
  lines,
  onChange,
  disabled,
}: {
  title: string;
  lines: Array<{ label: string; amount: number }>;
  onChange: (lines: Array<{ label: string; amount: number }>) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <div className="mb-2 erp-text-caption font-bold text-slate-500">{title}</div>
      <div className="space-y-2">
        {lines.map((line, index) => (
          <div key={`${line.label}-${index}`} className="grid grid-cols-[1fr_120px] gap-2">
            <Input
              lang="ko"
              value={line.label}
              disabled={disabled}
              onChange={(event) => {
                const next = lines.map((row, rowIndex) =>
                  rowIndex === index ? { ...row, label: event.target.value } : row,
                );
                onChange(next);
              }}
            />
            <Input
              lang="ko"
              inputMode="numeric"
              value={line.amount ? String(line.amount) : ""}
              disabled={disabled}
              onChange={(event) => {
                const next = lines.map((row, rowIndex) =>
                  rowIndex === index ? { ...row, amount: roundPayAmount(event.target.value) } : row,
                );
                onChange(next);
              }}
            />
          </div>
        ))}
        {!disabled ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onChange([...lines, { label: "", amount: 0 }])}
          >
            항목 추가
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function PayrollLineModal({
  line,
  staff,
  monthKey,
  attendanceRecords,
  settings,
  readOnly,
  onClose,
  onSave,
}: {
  line: OfficePayrollLine;
  staff?: OfficeStaffRecord | null;
  monthKey: string;
  attendanceRecords: AttendanceRecord[];
  settings: OfficePayrollSettings;
  readOnly?: boolean;
  onClose: () => void;
  onSave: (line: OfficePayrollLine) => void;
}) {
  const [draft, setDraft] = useState(line);
  const liveSummary = useMemo(() => {
    if (!staff) return null;
    return summarizeOfficeStaffAttendance({
      staff,
      monthKey,
      attendanceRecords,
      settings,
    });
  }, [staff, monthKey, attendanceRecords, settings]);

  const save = () => {
    onSave(recalculateOfficePayrollLine(draft, settings));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-900/40 p-4 sm:items-center">
      <div className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{draft.staffName} 급여 상세</h2>
            <p className="mt-1 text-sm text-slate-500">
              {OFFICE_PAYROLL_PAY_TYPE_LABELS[draft.payType]} · 실지급 {formatPayrollKRW(draft.netPay)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              근태: {formatAttendanceSummaryLabel(draft.attendanceSummary || liveSummary)}
            </p>
          </div>
          <Button type="button" variant="ghost" onClick={onClose}>
            닫기
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="erp-text-caption font-bold text-slate-500">급여 유형</span>
            <select
              className="erp-input w-full"
              disabled={readOnly}
              value={draft.payType}
              onChange={(event) =>
                setDraft((prev) =>
                  recalculateOfficePayrollLine(
                    { ...prev, payType: event.target.value as OfficePayrollPayType },
                    settings,
                  ),
                )
              }
            >
              <option value="monthly">월급</option>
              <option value="daily_33">일당(3.3%)</option>
            </select>
          </label>
          {draft.payType === "monthly" ? (
            <label className="space-y-1">
              <span className="erp-text-caption font-bold text-slate-500">기본급</span>
              <Input
                lang="ko"
                inputMode="numeric"
                disabled={readOnly}
                value={draft.baseSalary ? String(draft.baseSalary) : ""}
                onChange={(event) =>
                  setDraft((prev) =>
                    recalculateOfficePayrollLine(
                      { ...prev, baseSalary: roundPayAmount(event.target.value) },
                      settings,
                    ),
                  )
                }
              />
            </label>
          ) : (
            <>
              <label className="space-y-1">
                <span className="erp-text-caption font-bold text-slate-500">일당</span>
                <Input
                  lang="ko"
                  inputMode="numeric"
                  disabled={readOnly}
                  value={draft.dailyRate ? String(draft.dailyRate) : ""}
                  onChange={(event) =>
                    setDraft((prev) =>
                      recalculateOfficePayrollLine(
                        { ...prev, dailyRate: roundPayAmount(event.target.value) },
                        settings,
                      ),
                    )
                  }
                />
              </label>
              <label className="space-y-1">
                <span className="erp-text-caption font-bold text-slate-500">일수</span>
                <Input
                  lang="ko"
                  inputMode="numeric"
                  disabled={readOnly}
                  value={draft.dailyDays ? String(draft.dailyDays) : ""}
                  onChange={(event) =>
                    setDraft((prev) =>
                      recalculateOfficePayrollLine(
                        { ...prev, dailyDays: roundPayAmount(event.target.value) },
                        settings,
                      ),
                    )
                  }
                />
              </label>
            </>
          )}
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <MoneyLinesEditor
            title="수당"
            lines={draft.allowances}
            disabled={readOnly}
            onChange={(allowances) =>
              setDraft((prev) => recalculateOfficePayrollLine({ ...prev, allowances: normalizeMoneyLines(allowances) }, settings))
            }
          />
          <MoneyLinesEditor
            title="공제 (4대보험·세금 등 수기)"
            lines={draft.deductions}
            disabled={readOnly}
            onChange={(deductions) =>
              setDraft((prev) => recalculateOfficePayrollLine({ ...prev, deductions: normalizeMoneyLines(deductions) }, settings))
            }
          />
        </div>

        <label className="mt-4 block space-y-1">
          <span className="erp-text-caption font-bold text-slate-500">비고</span>
          <Input
            lang="ko"
            disabled={readOnly}
            value={draft.memo || ""}
            onChange={(event) => setDraft((prev) => ({ ...prev, memo: event.target.value }))}
          />
        </label>

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            취소
          </Button>
          {!readOnly ? (
            <Button type="button" onClick={save}>
              반영
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function OfficePayrollPage({
  officeStaff,
  attendanceRecords,
  companyProfile,
  settings,
  profiles,
  sheets,
  onPersist,
}: OfficePayrollPageProps) {
  const [tab, setTab] = useState<OfficePayrollTab>("monthly");
  const [monthKey, setMonthKey] = useState(currentMonthKey());
  const [settingsDraft, setSettingsDraft] = useState(settings);
  const [editingLine, setEditingLine] = useState<OfficePayrollLine | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSettingsDraft(settings);
  }, [settings]);

  const sheet = useMemo(
    () => sheets.find((row) => row.monthKey === monthKey) || null,
    [sheets, monthKey],
  );
  const readOnly = sheet?.status !== "draft";
  const summary = useMemo(() => (sheet ? summarizeOfficePayrollSheet(sheet) : null), [sheet]);

  const activeStaff = useMemo(
    () => officeStaff.filter((row) => isOfficeStaffActive(row)),
    [officeStaff],
  );
  const staffById = useMemo(
    () => new Map(activeStaff.map((row) => [normalizeOfficeStaffRecordId(row.id)!, row] as const)),
    [activeStaff],
  );

  const saveSheets = useCallback(
    async (nextSheets: OfficePayrollSheet[]) => {
      setBusy(true);
      try {
        await onPersist({ sheets: nextSheets });
      } finally {
        setBusy(false);
      }
    },
    [onPersist],
  );

  const ensureSheet = useCallback(async () => {
    const nextSheet = buildOfficePayrollSheetForMonth({
      monthKey,
      officeStaff,
      profiles,
      settings,
      existing: sheet || undefined,
    });
    await saveSheets(upsertOfficePayrollSheet(sheets, nextSheet));
  }, [monthKey, officeStaff, profiles, settings, sheet, sheets, saveSheets]);

  const updateSheet = useCallback(
    async (updater: (current: OfficePayrollSheet) => OfficePayrollSheet) => {
      let current = sheet;
      if (!current) {
        current = buildOfficePayrollSheetForMonth({
          monthKey,
          officeStaff,
          profiles,
          settings,
        });
      }
      const next = recalculateOfficePayrollSheet(updater(current), settings);
      await saveSheets(upsertOfficePayrollSheet(sheets, next));
    },
    [sheet, monthKey, officeStaff, profiles, settings, sheets, saveSheets],
  );

  const applyAttendance = async () => {
    if (!sheet || readOnly) return;
    if (
      !window.confirm(
        "근태 기록을 급여표에 반영할까요?\n· 일당: 출근일수 자동 입력\n· 월급: 입·퇴사 일할, 결근 공제, 연장수당(설정 시)",
      )
    ) {
      return;
    }
    const lines = applyAttendanceToOfficePayrollSheet({
      sheet,
      officeStaff: activeStaff,
      attendanceRecords,
      settings,
    });
    await updateSheet((current) => ({ ...current, lines }));
  };

  const refreshFromProfiles = async () => {
    if (readOnly) return;
    if (!window.confirm("재직 내근직 기준으로 급여표를 다시 채울까요? 작성 중인 값은 프로필 기준으로 덮어씁니다.")) {
      return;
    }
    const nextSheet = buildOfficePayrollSheetForMonth({
      monthKey,
      officeStaff,
      profiles,
      settings,
      existing: undefined,
    });
    await saveSheets(upsertOfficePayrollSheet(sheets, nextSheet));
  };

  const saveSettings = async () => {
    setBusy(true);
    try {
      await onPersist({ settings: settingsDraft });
      window.alert("급여 설정을 저장했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const saveProfile = async (profile: OfficePayrollProfile) => {
    setBusy(true);
    try {
      await onPersist({ profiles: upsertOfficePayrollProfile(profiles, profile) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="erp-page-shell">
      <PageTitle
        title="급여 관리"
        desc="내근직 급여, 근태 연동, 원천징수·연말정산 보조, 명세서, 은행 이체를 관리합니다."
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {(
          [
            { key: "monthly", label: "월별 급여", icon: Banknote },
            { key: "profiles", label: "급여 프로필", icon: Users },
            { key: "tax", label: "원천·연말", icon: FileText },
            { key: "settings", label: "설정", icon: Settings2 },
          ] as const
        ).map((item) => {
          const Icon = item.icon;
          return (
            <Button
              key={item.key}
              type="button"
              variant={tab === item.key ? "default" : "outline"}
              onClick={() => setTab(item.key)}
            >
              <Icon size={16} className="mr-2" />
              {item.label}
            </Button>
          );
        })}
      </div>

      {tab === "monthly" ? (
        <div className="space-y-4">
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="icon" onClick={() => setMonthKey((prev) => shiftMonthKey(prev, -1))}>
                  <ChevronLeft size={18} />
                </Button>
                <div className="min-w-[120px] text-center text-lg font-bold text-slate-900">{formatMonthLabel(monthKey)}</div>
                <Button type="button" variant="outline" size="icon" onClick={() => setMonthKey((prev) => shiftMonthKey(prev, 1))}>
                  <ChevronRight size={18} />
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {sheet ? (
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-bold text-slate-700">
                    {OFFICE_PAYROLL_STATUS_LABELS[sheet.status]}
                  </span>
                ) : (
                  <span className="text-sm text-slate-500">아직 작성된 급여표가 없습니다.</span>
                )}
                {!sheet ? (
                  <Button type="button" onClick={() => void ensureSheet()} disabled={busy}>
                    급여표 만들기
                  </Button>
                ) : null}
                {sheet && sheet.status === "draft" ? (
                  <>
                    <Button type="button" variant="outline" onClick={() => void refreshFromProfiles()} disabled={busy}>
                      <RefreshCw size={16} className="mr-2" />
                      프로필 불러오기
                    </Button>
                    <Button type="button" variant="outline" onClick={() => void applyAttendance()} disabled={busy}>
                      <Clock size={16} className="mr-2" />
                      근태 반영
                    </Button>
                    <Button
                      type="button"
                      onClick={() =>
                        void updateSheet((current) => ({
                          ...current,
                          status: "confirmed",
                          confirmedAt: new Date().toISOString(),
                        }))
                      }
                      disabled={busy}
                    >
                      확정
                    </Button>
                  </>
                ) : null}
                {sheet && sheet.status === "confirmed" ? (
                  <Button
                    type="button"
                    onClick={() =>
                      void updateSheet((current) => ({
                        ...current,
                        status: "paid",
                        paidAt: new Date().toISOString(),
                      }))
                    }
                    disabled={busy}
                  >
                    지급완료
                  </Button>
                ) : null}
                {sheet ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => downloadOfficePayrollBankExcel(sheet, companyProfile?.name)}
                    >
                      <FileSpreadsheet size={16} className="mr-2" />
                      이체 엑셀
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => downloadOfficePayrollSummaryExcel(sheet, companyProfile?.name)}
                    >
                      대장 엑셀
                    </Button>
                    <Button type="button" variant="outline" onClick={() => printOfficePayrollAllPayslips({ sheet, companyProfile })}>
                      <Printer size={16} className="mr-2" />
                      명세 일괄출력
                    </Button>
                  </>
                ) : null}
              </div>
            </CardContent>
          </Card>

          {summary ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryCard label="대상 인원" value={`${summary.headcount}명`} />
              <SummaryCard label="지급합" value={formatPayrollKRW(summary.grossPay)} />
              <SummaryCard label="공제·원천" value={formatPayrollKRW(summary.withholdingAmount + summary.deductionTotal)} />
              <SummaryCard label="실지급" value={formatPayrollKRW(summary.netPay)} />
            </div>
          ) : null}

          {sheet ? (
            <Card>
              <CardContent className="overflow-x-auto p-0">
                <table className="erp-table w-full min-w-[960px]">
                  <thead>
                    <tr>
                      <th>성명</th>
                      <th>부서</th>
                      <th>유형</th>
                      <th>근태</th>
                      <th>기본급/일당</th>
                      <th>일수</th>
                      <th>지급합</th>
                      <th>원천</th>
                      <th>공제</th>
                      <th>실지급</th>
                      <th className="erp-table-export-skip">관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sheet.lines.map((line) => (
                      <tr key={line.id} className={line.excluded ? "opacity-50" : undefined}>
                        <td>{line.staffName}</td>
                        <td>{line.department || "-"}</td>
                        <td>{OFFICE_PAYROLL_PAY_TYPE_LABELS[line.payType]}</td>
                        <td className="text-sm text-slate-600">
                          {formatAttendanceSummaryLabel(line.attendanceSummary)}
                        </td>
                        <td>
                          {line.payType === "daily_33"
                            ? formatPayrollKRW(line.dailyRate)
                            : formatPayrollKRW(line.baseSalary)}
                        </td>
                        <td>{line.payType === "daily_33" ? `${line.dailyDays}일` : "-"}</td>
                        <td>{formatPayrollKRW(line.grossPay)}</td>
                        <td>{line.withholdingAmount ? formatPayrollKRW(line.withholdingAmount) : "-"}</td>
                        <td>{formatPayrollKRW(line.deductions.reduce((sum, row) => sum + row.amount, 0))}</td>
                        <td className="font-bold">{formatPayrollKRW(line.netPay)}</td>
                        <td className="erp-table-export-skip">
                          <div className="flex flex-wrap gap-1">
                            <Button type="button" size="sm" variant="outline" onClick={() => setEditingLine(line)}>
                              상세
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => printOfficePayrollPayslip({ sheet, line, companyProfile })}
                            >
                              명세
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}

      {tab === "profiles" ? (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="erp-table w-full min-w-[880px]">
              <thead>
                <tr>
                  <th>성명</th>
                  <th>부서</th>
                  <th>유형</th>
                  <th>기본급</th>
                  <th>일당</th>
                  <th>은행</th>
                  <th>계좌</th>
                  <th className="erp-table-export-skip">관리</th>
                </tr>
              </thead>
              <tbody>
                {activeStaff.map((staff) => {
                  const staffId = normalizeOfficeStaffRecordId(staff.id)!;
                  const profile = profiles.find((row) => row.staffId === staffId);
                  return (
                    <ProfileRow
                      key={staffId}
                      staff={staff}
                      profile={profile}
                      onSave={saveProfile}
                    />
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : null}

      {tab === "tax" ? <OfficePayrollTaxTab sheets={sheets} companyProfile={companyProfile} /> : null}

      {tab === "settings" ? (
        <Card>
          <CardContent className="grid max-w-2xl gap-4 p-5">
            <label className="space-y-1">
              <span className="erp-text-caption font-bold text-slate-500">급여 지급일 (매월)</span>
              <Input
                lang="ko"
                inputMode="numeric"
                value={String(settingsDraft.payDay)}
                onChange={(event) =>
                  setSettingsDraft((prev) => ({
                    ...prev,
                    payDay: Math.min(31, Math.max(1, roundPayAmount(event.target.value) || 1)),
                  }))
                }
              />
            </label>
            <label className="space-y-1">
              <span className="erp-text-caption font-bold text-slate-500">일당 원천징수율 (기본 3.3%)</span>
              <Input
                lang="ko"
                inputMode="decimal"
                value={String(settingsDraft.dailyWithholdingRate)}
                onChange={(event) =>
                  setSettingsDraft((prev) => ({
                    ...prev,
                    dailyWithholdingRate: Number(event.target.value) || 0,
                  }))
                }
              />
            </label>
            <label className="space-y-1">
              <span className="erp-text-caption font-bold text-slate-500">기본 공제 항목 (쉼표 구분)</span>
              <Input
                lang="ko"
                value={settingsDraft.defaultDeductionLabels.join(", ")}
                onChange={(event) =>
                  setSettingsDraft((prev) => ({
                    ...prev,
                    defaultDeductionLabels: event.target.value
                      .split(",")
                      .map((item) => item.trim())
                      .filter(Boolean),
                  }))
                }
              />
            </label>
            <label className="space-y-1">
              <span className="erp-text-caption font-bold text-slate-500">기본 수당 항목 (쉼표 구분)</span>
              <Input
                lang="ko"
                value={settingsDraft.defaultAllowanceLabels.join(", ")}
                onChange={(event) =>
                  setSettingsDraft((prev) => ({
                    ...prev,
                    defaultAllowanceLabels: event.target.value
                      .split(",")
                      .map((item) => item.trim())
                      .filter(Boolean),
                  }))
                }
              />
            </label>
            <div>
              <Button type="button" onClick={() => void saveSettings()} disabled={busy}>
                설정 저장
              </Button>
            </div>
            <div className="border-t pt-4">
              <h3 className="mb-3 font-bold text-slate-900">근태 연동</h3>
              <div className="grid gap-4">
                <label className="space-y-1">
                  <span className="erp-text-caption font-bold text-slate-500">출근 기준 시각</span>
                  <Input
                    lang="ko"
                    value={settingsDraft.attendanceWorkStartTime}
                    onChange={(event) =>
                      setSettingsDraft((prev) => ({ ...prev, attendanceWorkStartTime: event.target.value }))
                    }
                  />
                </label>
                <label className="space-y-1">
                  <span className="erp-text-caption font-bold text-slate-500">지각 허용 (분)</span>
                  <Input
                    lang="ko"
                    inputMode="numeric"
                    value={String(settingsDraft.attendanceLateGraceMinutes)}
                    onChange={(event) =>
                      setSettingsDraft((prev) => ({
                        ...prev,
                        attendanceLateGraceMinutes: Math.max(0, roundPayAmount(event.target.value)),
                      }))
                    }
                  />
                </label>
                <label className="space-y-1">
                  <span className="erp-text-caption font-bold text-slate-500">기준 근무 시간 (분)</span>
                  <Input
                    lang="ko"
                    inputMode="numeric"
                    value={String(settingsDraft.attendanceStandardMinutes)}
                    onChange={(event) =>
                      setSettingsDraft((prev) => ({
                        ...prev,
                        attendanceStandardMinutes: Math.max(0, roundPayAmount(event.target.value)),
                      }))
                    }
                  />
                </label>
                <label className="space-y-1">
                  <span className="erp-text-caption font-bold text-slate-500">연장수당 시급 (0이면 미적용)</span>
                  <Input
                    lang="ko"
                    inputMode="numeric"
                    value={String(settingsDraft.attendanceOvertimeHourlyRate)}
                    onChange={(event) =>
                      setSettingsDraft((prev) => ({
                        ...prev,
                        attendanceOvertimeHourlyRate: Math.max(0, roundPayAmount(event.target.value)),
                      }))
                    }
                  />
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={settingsDraft.attendanceAutoFillDailyDays}
                    onChange={(event) =>
                      setSettingsDraft((prev) => ({ ...prev, attendanceAutoFillDailyDays: event.target.checked }))
                    }
                  />
                  일당(3.3%) — 출근일수 자동 입력
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={settingsDraft.attendanceMonthlyAbsenceDeduction}
                    onChange={(event) =>
                      setSettingsDraft((prev) => ({
                        ...prev,
                        attendanceMonthlyAbsenceDeduction: event.target.checked,
                      }))
                    }
                  />
                  월급 — 결근일 공제
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={settingsDraft.attendanceProRatePartialMonth}
                    onChange={(event) =>
                      setSettingsDraft((prev) => ({ ...prev, attendanceProRatePartialMonth: event.target.checked }))
                    }
                  />
                  월급 — 입·퇴사월 일할
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={settingsDraft.attendanceIncludeWeekends}
                    onChange={(event) =>
                      setSettingsDraft((prev) => ({ ...prev, attendanceIncludeWeekends: event.target.checked }))
                    }
                  />
                  주말도 근무일로 계산
                </label>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {editingLine ? (
        <PayrollLineModal
          line={editingLine}
          staff={staffById.get(editingLine.staffId) || null}
          monthKey={monthKey}
          attendanceRecords={attendanceRecords}
          settings={settings}
          readOnly={readOnly}
          onClose={() => setEditingLine(null)}
          onSave={(line) => {
            void updateSheet((current) => ({
              ...current,
              lines: current.lines.map((row) => (row.id === line.id ? line : row)),
            }));
            setEditingLine(null);
          }}
        />
      ) : null}
    </div>
  );
}

function ProfileRow({
  staff,
  profile,
  onSave,
}: {
  staff: OfficeStaffRecord;
  profile?: OfficePayrollProfile;
  onSave: (profile: OfficePayrollProfile) => void | Promise<void>;
}) {
  const staffId = normalizeOfficeStaffRecordId(staff.id)!;
  const [payType, setPayType] = useState<OfficePayrollPayType>(profile?.payType || "monthly");
  const [baseSalary, setBaseSalary] = useState(profile?.baseSalary ? String(profile.baseSalary) : "");
  const [dailyRate, setDailyRate] = useState(profile?.dailyRate ? String(profile.dailyRate) : "");

  return (
    <tr>
      <td>{staff.name}</td>
      <td>{staff.department || "-"}</td>
      <td>
        <select
          className="erp-input"
          value={payType}
          onChange={(event) => setPayType(event.target.value as OfficePayrollPayType)}
        >
          <option value="monthly">월급</option>
          <option value="daily_33">일당(3.3%)</option>
        </select>
      </td>
      <td>
        <Input
          lang="ko"
          inputMode="numeric"
          value={baseSalary}
          disabled={payType !== "monthly"}
          onChange={(event) => setBaseSalary(event.target.value)}
        />
      </td>
      <td>
        <Input
          lang="ko"
          inputMode="numeric"
          value={dailyRate}
          disabled={payType !== "daily_33"}
          onChange={(event) => setDailyRate(event.target.value)}
        />
      </td>
      <td>{staff.bank || "-"}</td>
      <td>{staff.account || "-"}</td>
      <td className="erp-table-export-skip">
        <Button
          type="button"
          size="sm"
          onClick={() =>
            void onSave({
              staffId,
              payType,
              baseSalary: roundPayAmount(baseSalary),
              dailyRate: roundPayAmount(dailyRate),
              allowances: profile?.allowances || [],
            })
          }
        >
          저장
        </Button>
      </td>
    </tr>
  );
}
