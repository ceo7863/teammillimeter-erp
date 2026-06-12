import React, { memo } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KoreanDateInput } from "@/components/KoreanDateInput";
import { useBodyScrollLock } from "@/utils/bodyScrollLock";
import { WorkerPhotoField } from "@/components/WorkerPhotoField";
import {
  OFFICE_STAFF_EMPLOYMENT_TYPE_OPTIONS,
  OFFICE_STAFF_STATUS_LABELS,
  createEmptyOfficeStaffForm,
  formatResidentRegistrationNoInput,
  type OfficeStaffEmploymentStatus,
  type OfficeStaffFormState,
} from "@/utils/officeStaff";

const L = {
  editTitle: "내근직 수정",
  createTitle: "내근직 등록",
  close: "닫기",
  reset: "초기화",
  save: "저장",
  name: "이름",
  namePh: "이름 (필수)",
  employeeNo: "사번",
  employeeNoAuto: "저장 시 자동 발급",
  employeeNoHint: "사번은 저장 시 O-0001 형식으로 자동 발급됩니다.",
  department: "부서",
  position: "직급/직책",
  employmentType: "고용형태",
  hireDate: "입사일",
  resignDate: "퇴사일",
  status: "재직상태",
  birthDate: "생년월일",
  residentRegistrationNo: "주민등록번호",
  residentRegistrationNoPh: "000000-0000000",
  phone: "연락처",
  email: "이메일",
  address: "주소",
  bank: "은행명",
  account: "계좌번호",
  education: "학력",
  certifications: "자격/면허",
  careerSummary: "경력 요약",
  emergencyContact: "비상연락처(성명)",
  emergencyPhone: "비상연락처(전화)",
  memo: "비고",
  hrNotes: "인사 특이사항",
};

type OfficeStaffFormModalProps = {
  open: boolean;
  editing: boolean;
  form: OfficeStaffFormState;
  formError?: string;
  photoPreviewUrl?: string | null;
  photoHasSaved?: boolean;
  photoUploading?: boolean;
  onClose: () => void;
  onReset: () => void;
  onSubmit: () => void;
  onChange: (patch: Partial<OfficeStaffFormState>) => void;
  onPhotoSelect: (file: File) => void;
  onPhotoDelete?: () => void;
  nextEmployeeNoPreview?: string;
};

export { createEmptyOfficeStaffForm };

export const OfficeStaffFormModal = memo(function OfficeStaffFormModal({
  open,
  editing,
  form,
  formError,
  photoPreviewUrl = null,
  photoHasSaved = false,
  photoUploading = false,
  onClose,
  onReset,
  onSubmit,
  onChange,
  onPhotoSelect,
  onPhotoDelete,
  nextEmployeeNoPreview = "",
}: OfficeStaffFormModalProps) {
  useBodyScrollLock(open);

  if (!open) return null;

  return (
    <div className="erp-ledger-modal-backdrop" onClick={onClose}>
      <div
        className="erp-ledger-modal erp-ledger-modal--client-form overflow-y-auto"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="office-staff-form-modal-title"
        lang="ko"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id="office-staff-form-modal-title" className="erp-text-section font-bold text-slate-900">
            {editing ? L.editTitle : L.createTitle}
          </h2>
          <Button type="button" variant="ghost" size="sm" className="rounded-xl" onClick={onClose}>
            <X size={18} />
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <WorkerPhotoField
            previewUrl={photoPreviewUrl}
            hasPhoto={photoHasSaved || Boolean(photoPreviewUrl)}
            uploading={photoUploading}
            createMode={!editing}
            hintCreate="내근직 저장 후 인사사진을 등록할 수 있습니다."
            onSelectFile={onPhotoSelect}
            onDelete={onPhotoDelete}
          />
          <label className="space-y-1 text-sm sm:col-span-2 xl:col-span-2">
            <span className="font-semibold text-slate-700">{L.name}</span>
            <Input value={form.name} onChange={(e) => onChange({ name: e.target.value })} placeholder={L.namePh} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-semibold text-slate-700">{L.employeeNo}</span>
            <Input
              value={editing ? form.employeeNo || "—" : nextEmployeeNoPreview || L.employeeNoAuto}
              readOnly
              disabled
              className="bg-slate-50 text-slate-600"
            />
            {!editing ? <p className="text-xs text-slate-500">{L.employeeNoHint}</p> : null}
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-semibold text-slate-700">{L.department}</span>
            <Input value={form.department} onChange={(e) => onChange({ department: e.target.value })} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-semibold text-slate-700">{L.position}</span>
            <Input value={form.position} onChange={(e) => onChange({ position: e.target.value })} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-semibold text-slate-700">{L.employmentType}</span>
            <select
              className="erp-input-compact w-full rounded-xl border border-slate-200 px-3 py-2"
              value={form.employmentType}
              onChange={(e) => onChange({ employmentType: e.target.value })}
            >
              {OFFICE_STAFF_EMPLOYMENT_TYPE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-semibold text-slate-700">{L.status}</span>
            <select
              className="erp-input-compact w-full rounded-xl border border-slate-200 px-3 py-2"
              value={form.status}
              onChange={(e) => onChange({ status: e.target.value as OfficeStaffEmploymentStatus })}
            >
              {(Object.keys(OFFICE_STAFF_STATUS_LABELS) as OfficeStaffEmploymentStatus[]).map((key) => (
                <option key={key} value={key}>
                  {OFFICE_STAFF_STATUS_LABELS[key]}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-semibold text-slate-700">{L.hireDate}</span>
            <KoreanDateInput value={form.hireDate} onChange={(value) => onChange({ hireDate: value })} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-semibold text-slate-700">{L.resignDate}</span>
            <KoreanDateInput value={form.resignDate} onChange={(value) => onChange({ resignDate: value })} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-semibold text-slate-700">{L.birthDate}</span>
            <KoreanDateInput value={form.birthDate} onChange={(value) => onChange({ birthDate: value })} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-semibold text-slate-700">{L.residentRegistrationNo}</span>
            <Input
              value={form.residentRegistrationNo}
              onChange={(e) => onChange({ residentRegistrationNo: formatResidentRegistrationNoInput(e.target.value) })}
              placeholder={L.residentRegistrationNoPh}
              inputMode="numeric"
              autoComplete="off"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-semibold text-slate-700">{L.phone}</span>
            <Input value={form.phone} onChange={(e) => onChange({ phone: e.target.value })} />
          </label>
          <label className="space-y-1 text-sm md:col-span-2 xl:col-span-2">
            <span className="font-semibold text-slate-700">{L.email}</span>
            <Input value={form.email} onChange={(e) => onChange({ email: e.target.value })} />
          </label>
          <label className="space-y-1 text-sm sm:col-span-2 xl:col-span-4">
            <span className="font-semibold text-slate-700">{L.address}</span>
            <Input value={form.address} onChange={(e) => onChange({ address: e.target.value })} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-semibold text-slate-700">{L.bank}</span>
            <Input value={form.bank} onChange={(e) => onChange({ bank: e.target.value })} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-semibold text-slate-700">{L.account}</span>
            <Input value={form.account} onChange={(e) => onChange({ account: e.target.value })} />
          </label>
          <label className="space-y-1 text-sm sm:col-span-2 xl:col-span-2">
            <span className="font-semibold text-slate-700">{L.education}</span>
            <Input value={form.education} onChange={(e) => onChange({ education: e.target.value })} />
          </label>
          <label className="space-y-1 text-sm sm:col-span-2 xl:col-span-2">
            <span className="font-semibold text-slate-700">{L.certifications}</span>
            <Input value={form.certifications} onChange={(e) => onChange({ certifications: e.target.value })} />
          </label>
          <label className="space-y-1 text-sm sm:col-span-2 xl:col-span-4">
            <span className="font-semibold text-slate-700">{L.careerSummary}</span>
            <textarea
              className="min-h-24 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              value={form.careerSummary}
              onChange={(e) => onChange({ careerSummary: e.target.value })}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-semibold text-slate-700">{L.emergencyContact}</span>
            <Input value={form.emergencyContact} onChange={(e) => onChange({ emergencyContact: e.target.value })} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-semibold text-slate-700">{L.emergencyPhone}</span>
            <Input value={form.emergencyPhone} onChange={(e) => onChange({ emergencyPhone: e.target.value })} />
          </label>
          <label className="space-y-1 text-sm sm:col-span-2 xl:col-span-4">
            <span className="font-semibold text-slate-700">{L.memo}</span>
            <textarea
              className="min-h-20 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              value={form.memo}
              onChange={(e) => onChange({ memo: e.target.value })}
            />
          </label>
          <label className="space-y-1 text-sm sm:col-span-2 xl:col-span-4">
            <span className="font-semibold text-slate-700">{L.hrNotes}</span>
            <textarea
              className="min-h-24 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              value={form.hrNotes}
              onChange={(e) => onChange({ hrNotes: e.target.value })}
            />
          </label>
        </div>

        {formError ? <p className="mt-3 text-sm text-rose-600">{formError}</p> : null}

        <div className="mt-5 flex gap-2">
          <Button type="button" variant="outline" className="rounded-xl" onClick={onReset}>
            {L.reset}
          </Button>
          <Button type="button" variant="outline" className="flex-1 rounded-xl" onClick={onClose}>
            {L.close}
          </Button>
          <Button type="button" className="flex-1 rounded-xl" onClick={onSubmit}>
            {L.save}
          </Button>
        </div>
      </div>
    </div>
  );
});
