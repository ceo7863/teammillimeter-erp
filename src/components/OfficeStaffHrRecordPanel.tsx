import { useMemo, useState } from "react";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { OfficeStaffHrRecordModal } from "@/components/OfficeStaffHrRecordModal";
import type { CompanyProfile } from "@/utils/companyProfile";
import { DEFAULT_COMPANY_PROFILE } from "@/utils/companyProfile";
import { buildOfficeStaffHrRecordList, type OfficeStaffRecord } from "@/utils/officeStaff";

const L = {
  title: "내근직 인사기록부",
  desc: "등록된 내근직 인사 정보를 조회하고 인사기록부를 출력할 수 있습니다.",
  search: "이름, 사번, 부서, 직급 검색",
  includeInactive: "퇴사자 포함",
  name: "이름",
  department: "부서",
  position: "직급/직책",
  hireDate: "입사일",
  status: "상태",
  action: "보기",
  active: "재직",
  inactive: "퇴사/휴직",
  noData: "등록된 내근직이 없습니다.",
  rowCount: "총",
};

type OfficeStaffHrRecordPanelProps = {
  officeStaff: OfficeStaffRecord[];
  companyProfile?: CompanyProfile;
};

type SelectedStaff = {
  staffId: string;
  staffName: string;
};

export function OfficeStaffHrRecordPanel({ officeStaff, companyProfile }: OfficeStaffHrRecordPanelProps) {
  const [query, setQuery] = useState("");
  const [includeInactive, setIncludeInactive] = useState(true);
  const [selectedStaff, setSelectedStaff] = useState<SelectedStaff | null>(null);
  const [hrRecordOpen, setHrRecordOpen] = useState(false);

  const resolvedCompanyProfile = companyProfile || DEFAULT_COMPANY_PROFILE;

  const rows = useMemo(
    () =>
      buildOfficeStaffHrRecordList({
        officeStaff,
        query,
        includeInactive,
      }),
    [officeStaff, query, includeInactive],
  );

  const openHrRecord = (row: (typeof rows)[number]) => {
    setSelectedStaff({ staffId: row.staffId, staffName: row.staffName });
    setHrRecordOpen(true);
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-bold text-slate-900">{L.title}</h3>
        <p className="text-sm text-slate-500">{L.desc}</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
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
                  <th className="py-2 pr-3">{L.department}</th>
                  <th className="py-2 pr-3">{L.position}</th>
                  <th className="py-2 pr-3">{L.hireDate}</th>
                  <th className="py-2 pr-3">{L.status}</th>
                  <th className="py-2 pr-3">{L.action}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.staffId || row.staffName} className="border-b border-slate-100">
                    <td className="py-2 pr-3 font-semibold text-slate-900">{row.staffName}</td>
                    <td className="py-2 pr-3">{row.department || "—"}</td>
                    <td className="py-2 pr-3">{row.position || "—"}</td>
                    <td className="py-2 pr-3">{row.hireDate || "—"}</td>
                    <td className="py-2 pr-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                          row.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {row.statusLabel}
                      </span>
                    </td>
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

      {selectedStaff ? (
        <OfficeStaffHrRecordModal
          open={hrRecordOpen}
          onClose={() => setHrRecordOpen(false)}
          staffId={selectedStaff.staffId}
          staffName={selectedStaff.staffName}
          officeStaff={officeStaff}
          companyProfile={resolvedCompanyProfile}
        />
      ) : null}
    </div>
  );
}
