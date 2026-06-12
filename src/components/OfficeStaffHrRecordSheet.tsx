import { useEffect, useState } from "react";
import { Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CompanyProfile } from "@/utils/companyProfile";
import {
  OFFICE_STAFF_STATUS_LABELS,
  type OfficeStaffHrRecordData,
  type OfficeStaffRecord,
} from "@/utils/officeStaff";
import { fetchOfficeStaffPhotoBlob, officeStaffHasPhoto } from "@/utils/officeStaffPhotoFile";
import "@/styles/worker-hr-record.css";

const L = {
  title: "내근직 인사기록부",
  subtitle: "Office Staff Personnel Record",
  print: "인쇄",
  pdf: "PDF 저장",
  generating: "PDF 생성 중…",
  docNo: "문서번호",
  issued: "발급일",
  personal: "인적사항",
  employment: "재직정보",
  contact: "연락처·계좌",
  hr: "인사·경력",
  name: "성명",
  employeeNo: "사번",
  department: "부서",
  position: "직급/직책",
  employmentType: "고용형태",
  status: "재직상태",
  hireDate: "입사일",
  resignDate: "퇴사일",
  birthDate: "생년월일",
  residentRegistrationNo: "주민등록번호",
  phone: "연락처",
  email: "이메일",
  address: "주소",
  bank: "급여계좌",
  education: "학력",
  certifications: "자격/면허",
  careerSummary: "경력 요약",
  emergency: "비상연락처",
  memo: "비고",
  hrNotes: "인사 특이사항",
};

type OfficeStaffHrRecordSheetProps = {
  data: OfficeStaffHrRecordData;
  companyProfile: CompanyProfile;
  exportRootId?: string;
  onDownloadPdf?: () => void | Promise<void>;
  pdfBusy?: boolean;
};

function formatDateKo(iso?: string) {
  if (!iso) return "—";
  const parts = String(iso).trim().split("-");
  if (parts.length !== 3) return iso;
  return `${parts[0]}년 ${Number(parts[1])}월 ${Number(parts[2])}일`;
}

function companyLogoInitials(name: string) {
  const trimmed = String(name || "").trim();
  if (!trimmed) return "TM";
  const words = trimmed.replace(/\(주\)|주식회사/g, "").trim().split(/\s+/);
  if (words.length >= 2) return `${words[0].slice(0, 1)}${words[1].slice(0, 1)}`.toUpperCase();
  return trimmed.slice(0, 2).toUpperCase();
}

function displayValue(value?: string) {
  const trimmed = String(value || "").trim();
  return trimmed || "—";
}

function OfficeStaffHrRecordPhoto({
  staffId,
  staffName,
  staff,
}: {
  staffId: string;
  staffName: string;
  staff: OfficeStaffRecord;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl = "";
    let cancelled = false;

    async function load() {
      const id = String(staffId || staff.id || "").trim();
      if (!id || !officeStaffHasPhoto(staff)) {
        if (!cancelled) setSrc(null);
        return;
      }
      try {
        const blob = await fetchOfficeStaffPhotoBlob(id);
        if (cancelled || !blob) {
          if (!cancelled) setSrc(null);
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      } catch {
        if (!cancelled) setSrc(null);
      }
    }

    void load();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [staffId, staff.id, staff.photoFileId, staff.photoUploadedAt]);

  return (
    <div className="worker-hr-record-photo" aria-hidden={Boolean(src)}>
      {src ? (
        <img src={src} alt={`${staffName} 인사사진`} />
      ) : (
        String(staffName || "?").slice(0, 1)
      )}
    </div>
  );
}

export function OfficeStaffHrRecordSheet({
  data,
  companyProfile,
  exportRootId = "office-staff-hr-record-export",
  onDownloadPdf,
  pdfBusy = false,
}: OfficeStaffHrRecordSheetProps) {
  const staff = (data.staff || {}) as OfficeStaffRecord;
  const companyName = companyProfile.name || "(주)팀밀리미터";

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
                {companyLogoInitials(companyName)}
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
            </div>
          </div>
          <p className="worker-hr-record-subtitle">{L.subtitle}</p>
        </header>

        <section className="worker-hr-record-section">
          <h2>{L.personal}</h2>
          <div className="worker-hr-record-profile">
            <OfficeStaffHrRecordPhoto staffId={data.staffId} staffName={data.staffName} staff={staff} />
            <dl className="worker-hr-record-dl">
              <div>
                <dt>{L.name}</dt>
                <dd className="is-emphasis">{data.staffName}</dd>
              </div>
              <div>
                <dt>{L.employeeNo}</dt>
                <dd>{displayValue(staff.employeeNo)}</dd>
              </div>
              <div>
                <dt>{L.birthDate}</dt>
                <dd>{formatDateKo(staff.birthDate)}</dd>
              </div>
              <div>
                <dt>{L.residentRegistrationNo}</dt>
                <dd>{displayValue(staff.residentRegistrationNo)}</dd>
              </div>
              <div>
                <dt>{L.phone}</dt>
                <dd>{displayValue(staff.phone)}</dd>
              </div>
              <div>
                <dt>{L.email}</dt>
                <dd>{displayValue(staff.email)}</dd>
              </div>
              <div className="span-2">
                <dt>{L.address}</dt>
                <dd>{displayValue(staff.address)}</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="worker-hr-record-section">
          <h2>{L.employment}</h2>
          <dl className="worker-hr-record-dl">
            <div>
              <dt>{L.department}</dt>
              <dd>{displayValue(staff.department)}</dd>
            </div>
            <div>
              <dt>{L.position}</dt>
              <dd>{displayValue(staff.position)}</dd>
            </div>
            <div>
              <dt>{L.employmentType}</dt>
              <dd>{displayValue(staff.employmentType)}</dd>
            </div>
            <div>
              <dt>{L.status}</dt>
              <dd>{OFFICE_STAFF_STATUS_LABELS[staff.status || "active"]}</dd>
            </div>
            <div>
              <dt>{L.hireDate}</dt>
              <dd>{formatDateKo(staff.hireDate)}</dd>
            </div>
            <div>
              <dt>{L.resignDate}</dt>
              <dd>{formatDateKo(staff.resignDate)}</dd>
            </div>
          </dl>
        </section>

        <section className="worker-hr-record-section">
          <h2>{L.contact}</h2>
          <dl className="worker-hr-record-dl">
            <div className="span-2">
              <dt>{L.bank}</dt>
              <dd>{[staff.bank, staff.account].filter(Boolean).join(" ") || "—"}</dd>
            </div>
            <div>
              <dt>{L.emergency}</dt>
              <dd>{[staff.emergencyContact, staff.emergencyPhone].filter(Boolean).join(" / ") || "—"}</dd>
            </div>
          </dl>
        </section>

        <section className="worker-hr-record-section">
          <h2>{L.hr}</h2>
          <dl className="worker-hr-record-dl">
            <div className="span-2">
              <dt>{L.education}</dt>
              <dd>{displayValue(staff.education)}</dd>
            </div>
            <div className="span-2">
              <dt>{L.certifications}</dt>
              <dd>{displayValue(staff.certifications)}</dd>
            </div>
            <div className="span-2">
              <dt>{L.careerSummary}</dt>
              <dd>{displayValue(staff.careerSummary)}</dd>
            </div>
            <div className="span-2">
              <dt>{L.memo}</dt>
              <dd>{displayValue(staff.memo)}</dd>
            </div>
            <div className="span-2">
              <dt>{L.hrNotes}</dt>
              <dd>{displayValue(staff.hrNotes)}</dd>
            </div>
          </dl>
        </section>
      </article>
    </div>
  );
}
