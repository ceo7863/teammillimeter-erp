import type { CompanyProfile } from "@/utils/companyProfile";

export type OfficeStaffEmploymentStatus = "active" | "leave" | "resigned";

export type OfficeStaffRecord = {
  id: string;
  name: string;
  employeeNo?: string;
  department?: string;
  position?: string;
  employmentType?: string;
  hireDate?: string;
  resignDate?: string;
  status?: OfficeStaffEmploymentStatus;
  birthDate?: string;
  phone?: string;
  email?: string;
  address?: string;
  bank?: string;
  account?: string;
  education?: string;
  certifications?: string;
  careerSummary?: string;
  emergencyContact?: string;
  emergencyPhone?: string;
  memo?: string;
  hrNotes?: string;
  photoFileId?: string;
  photoFileName?: string;
  photoUploadedAt?: string;
};

export type OfficeStaffFormState = {
  name: string;
  employeeNo: string;
  department: string;
  position: string;
  employmentType: string;
  hireDate: string;
  resignDate: string;
  status: OfficeStaffEmploymentStatus;
  birthDate: string;
  phone: string;
  email: string;
  address: string;
  bank: string;
  account: string;
  education: string;
  certifications: string;
  careerSummary: string;
  emergencyContact: string;
  emergencyPhone: string;
  memo: string;
  hrNotes: string;
};

export type OfficeStaffHrRecordData = {
  staffId: string;
  staffName: string;
  staff: OfficeStaffRecord | null;
  issuedAt: string;
  documentNo: string;
};

export const OFFICE_STAFF_EMPLOYMENT_TYPE_OPTIONS = ["정규직", "계약직", "인턴", "파트", "기타"] as const;

export const OFFICE_STAFF_EMPLOYEE_NO_PREFIX = "O";
const OFFICE_STAFF_EMPLOYEE_NO_PATTERN = /^O-(\d+)$/i;

export function parseOfficeStaffEmployeeNoSequence(employeeNo: unknown) {
  const match = OFFICE_STAFF_EMPLOYEE_NO_PATTERN.exec(String(employeeNo || "").trim());
  if (!match) return null;
  const seq = Number.parseInt(match[1], 10);
  return Number.isFinite(seq) ? seq : null;
}

export function formatOfficeStaffEmployeeNo(seq: number) {
  return `${OFFICE_STAFF_EMPLOYEE_NO_PREFIX}-${String(seq).padStart(4, "0")}`;
}

export function allocateNextOfficeStaffEmployeeNo(
  officeStaff: OfficeStaffRecord[] = [],
  options?: { excludeIds?: string[] },
) {
  const exclude = new Set((options?.excludeIds || []).map(normalizeOfficeStaffRecordId).filter(Boolean));
  let max = 0;
  for (const row of officeStaff) {
    if (exclude.has(normalizeOfficeStaffRecordId(row.id))) continue;
    const seq = parseOfficeStaffEmployeeNoSequence(row.employeeNo);
    if (seq != null && seq > max) max = seq;
  }
  return formatOfficeStaffEmployeeNo(max + 1);
}

export function resolveOfficeStaffEmployeeNo(input: {
  existing?: OfficeStaffRecord | null;
  officeStaff?: OfficeStaffRecord[];
  staffId?: string;
}) {
  const existingNo = String(input.existing?.employeeNo || "").trim();
  if (existingNo) return existingNo;
  return allocateNextOfficeStaffEmployeeNo(input.officeStaff || [], {
    excludeIds: input.staffId ? [input.staffId] : [],
  });
}

export const OFFICE_STAFF_STATUS_LABELS: Record<OfficeStaffEmploymentStatus, string> = {
  active: "재직",
  leave: "휴직",
  resigned: "퇴사",
};

export function createEmptyOfficeStaffForm(): OfficeStaffFormState {
  return {
    name: "",
    employeeNo: "",
    department: "",
    position: "",
    employmentType: "정규직",
    hireDate: "",
    resignDate: "",
    status: "active",
    birthDate: "",
    phone: "",
    email: "",
    address: "",
    bank: "",
    account: "",
    education: "",
    certifications: "",
    careerSummary: "",
    emergencyContact: "",
    emergencyPhone: "",
    memo: "",
    hrNotes: "",
  };
}

export function normalizeOfficeStaffRecordId(id: unknown) {
  if (id == null || id === "") return "";
  return String(id).trim();
}

export function normalizeOfficeStaffList(rows: unknown): OfficeStaffRecord[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => normalizeOfficeStaffRecord(row))
    .filter((row): row is OfficeStaffRecord => Boolean(row?.id && row?.name));
}

export function normalizeOfficeStaffRecord(row: unknown): OfficeStaffRecord | null {
  if (!row || typeof row !== "object") return null;
  const source = row as Partial<OfficeStaffRecord>;
  const name = String(source.name || "").trim();
  const id = normalizeOfficeStaffRecordId(source.id) || (name ? `office-staff-${Date.now()}` : "");
  if (!id || !name) return null;
  const status = source.status;
  const normalizedStatus: OfficeStaffEmploymentStatus =
    status === "leave" || status === "resigned" ? status : "active";
  return {
    id,
    name,
    employeeNo: String(source.employeeNo || "").trim(),
    department: String(source.department || "").trim(),
    position: String(source.position || "").trim(),
    employmentType: String(source.employmentType || "").trim(),
    hireDate: String(source.hireDate || "").trim(),
    resignDate: String(source.resignDate || "").trim(),
    status: normalizedStatus,
    birthDate: String(source.birthDate || "").trim(),
    phone: String(source.phone || "").trim(),
    email: String(source.email || "").trim(),
    address: String(source.address || "").trim(),
    bank: String(source.bank || "").trim(),
    account: String(source.account || "").trim(),
    education: String(source.education || "").trim(),
    certifications: String(source.certifications || "").trim(),
    careerSummary: String(source.careerSummary || "").trim(),
    emergencyContact: String(source.emergencyContact || "").trim(),
    emergencyPhone: String(source.emergencyPhone || "").trim(),
    memo: String(source.memo || "").trim(),
    hrNotes: String(source.hrNotes || "").trim(),
    photoFileId: String(source.photoFileId || "").trim(),
    photoFileName: String(source.photoFileName || "").trim(),
    photoUploadedAt: String(source.photoUploadedAt || "").trim(),
  };
}

export function officeStaffFormFromRecord(row: OfficeStaffRecord): OfficeStaffFormState {
  return {
    name: row.name || "",
    employeeNo: row.employeeNo || "",
    department: row.department || "",
    position: row.position || "",
    employmentType: row.employmentType || "정규직",
    hireDate: row.hireDate || "",
    resignDate: row.resignDate || "",
    status: row.status || "active",
    birthDate: row.birthDate || "",
    phone: row.phone || "",
    email: row.email || "",
    address: row.address || "",
    bank: row.bank || "",
    account: row.account || "",
    education: row.education || "",
    certifications: row.certifications || "",
    careerSummary: row.careerSummary || "",
    emergencyContact: row.emergencyContact || "",
    emergencyPhone: row.emergencyPhone || "",
    memo: row.memo || "",
    hrNotes: row.hrNotes || "",
  };
}

export function officeStaffRecordFromForm(
  form: OfficeStaffFormState,
  id?: string,
  existing?: OfficeStaffRecord | null,
  officeStaff: OfficeStaffRecord[] = [],
): OfficeStaffRecord {
  const name = form.name.trim();
  const recordId =
    normalizeOfficeStaffRecordId(id) || `office-staff-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    id: recordId,
    name,
    employeeNo: resolveOfficeStaffEmployeeNo({ existing, officeStaff, staffId: recordId }),
    department: form.department.trim(),
    position: form.position.trim(),
    employmentType: form.employmentType.trim(),
    hireDate: form.hireDate.trim(),
    resignDate: form.resignDate.trim(),
    status: form.status,
    birthDate: form.birthDate.trim(),
    phone: form.phone.trim(),
    email: form.email.trim(),
    address: form.address.trim(),
    bank: form.bank.trim(),
    account: form.account.trim(),
    education: form.education.trim(),
    certifications: form.certifications.trim(),
    careerSummary: form.careerSummary.trim(),
    emergencyContact: form.emergencyContact.trim(),
    emergencyPhone: form.emergencyPhone.trim(),
    memo: form.memo.trim(),
    hrNotes: form.hrNotes.trim(),
    photoFileId: existing?.photoFileId || "",
    photoFileName: existing?.photoFileName || "",
    photoUploadedAt: existing?.photoUploadedAt || "",
  };
}

export function isOfficeStaffActive(row: Pick<OfficeStaffRecord, "status">) {
  return row.status !== "resigned";
}

export function officeStaffSearchText(row: OfficeStaffRecord) {
  return [
    row.name,
    row.employeeNo,
    row.department,
    row.position,
    row.employmentType,
    row.phone,
    row.email,
    row.hireDate,
    OFFICE_STAFF_STATUS_LABELS[row.status || "active"],
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function compareOfficeStaffDefault(a: OfficeStaffRecord, b: OfficeStaffRecord) {
  const activeDiff = Number(isOfficeStaffActive(b)) - Number(isOfficeStaffActive(a));
  if (activeDiff) return activeDiff;
  return String(a.name || "").localeCompare(String(b.name || ""), "ko-KR");
}

export function resolveOfficeStaffById(staff: OfficeStaffRecord[], staffId: string) {
  const id = normalizeOfficeStaffRecordId(staffId);
  if (!id) return null;
  return staff.find((row) => normalizeOfficeStaffRecordId(row.id) === id) || null;
}

function todayKstISO() {
  const now = new Date();
  const kst = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  return `${kst.getFullYear()}-${String(kst.getMonth() + 1).padStart(2, "0")}-${String(kst.getDate()).padStart(2, "0")}`;
}

export function buildOfficeStaffHrRecordData(input: {
  staffId: string;
  staffName: string;
  officeStaff: OfficeStaffRecord[];
  companyProfile?: CompanyProfile;
}): OfficeStaffHrRecordData {
  const staff =
    resolveOfficeStaffById(input.officeStaff, input.staffId) ||
    input.officeStaff.find((row) => row.name === input.staffName) ||
    null;
  const issuedAt = todayKstISO();
  const seq = String(input.staffId || input.staffName || "0").replace(/\D/g, "").slice(-4) || "0000";
  return {
    staffId: normalizeOfficeStaffRecordId(staff?.id || input.staffId),
    staffName: staff?.name || input.staffName,
    staff,
    issuedAt,
    documentNo: `HR-O-${issuedAt.replace(/-/g, "")}-${seq}`,
  };
}

export type OfficeStaffHrListRow = {
  staffId: string;
  staffName: string;
  department: string;
  position: string;
  hireDate: string;
  statusLabel: string;
  isActive: boolean;
};

export function buildOfficeStaffHrRecordList(input: {
  officeStaff: OfficeStaffRecord[];
  query?: string;
  includeInactive?: boolean;
}): OfficeStaffHrListRow[] {
  const q = String(input.query || "").trim().toLowerCase();
  return input.officeStaff
    .filter((row) => {
      if (!input.includeInactive && !isOfficeStaffActive(row)) return false;
      if (!q) return true;
      return officeStaffSearchText(row).includes(q);
    })
    .sort(compareOfficeStaffDefault)
    .map((row) => ({
      staffId: row.id,
      staffName: row.name,
      department: row.department || "",
      position: row.position || "",
      hireDate: row.hireDate || "",
      statusLabel: OFFICE_STAFF_STATUS_LABELS[row.status || "active"],
      isActive: isOfficeStaffActive(row),
    }));
}

export function mergeOfficeStaffForSave(existing: OfficeStaffRecord[] = [], incoming: OfficeStaffRecord[] = []) {
  const existingById = new Map(
    existing
      .map((row) => normalizeOfficeStaffRecord(row))
      .filter((row): row is OfficeStaffRecord => Boolean(row))
      .map((row) => [row.id, row]),
  );
  return incoming
    .map((row) => normalizeOfficeStaffRecord(row))
    .filter((row): row is OfficeStaffRecord => Boolean(row))
    .map((row) => ({ ...existingById.get(row.id), ...row }));
}
