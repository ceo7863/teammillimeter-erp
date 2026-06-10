import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Database,
  Download,
  FileSpreadsheet,
  KeyRound,
  Pencil,
  RefreshCw,
  RotateCcw,
  Search,
  Shield,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DesktopTableWrap, MobileRecordCard, MobileRecordList } from "@/components/MobileRecordCard";
import {
  createUserApi,
  fetchUsers,
  resetUserPasswordApi,
  setUserStatusApi,
  updateUserApi,
  type ErpUser,
  type ErpUserRecord,
} from "@/utils/erpApi";
import { useAudit } from "@/context/AuditContext";
import { USER_AUDIT_FIELDS, snapshotUserForAudit } from "@/utils/auditLog";
import {
  DEFAULT_STAFF_PAGE_KEYS,
  getPageAccessGroups,
  type ErpPageKey,
} from "@/utils/pageAccess";
import { fetchErpBackupStatus, restoreErpBackupSnapshot as restoreErpBackupSnapshotApi, type ErpBackupStatus } from "@/utils/backupStatusApi";

const LOGIN_ID_RE = /^[a-zA-Z0-9]+$/;

const L = {
  pageTitle: "\uC0AC\uC6A9\uC790 \uAD00\uB9AC",
  pageDesc:
    "\uACC4\uC815 \uC0DD\uC131, \uAD8C\uD55C \uC124\uC815, \uBE44\uBC00\uBC88\uD638 \uC7AC\uC124\uC815\uC744 \uAD00\uB9AC\uD569\uB2C8\uB2E4.",
  addUser: "\uC0AC\uC6A9\uC790 \uCD94\uAC00",
  refresh: "\uC0C8\uB85C\uACE0\uCE68",
  searchPlaceholder:
    "\uB85C\uADF8\uC778 ID, \uC774\uB984, \uC774\uBA54\uC77C, \uC804\uD654\uBC88\uD638 \uAC80\uC0C9",
  loginId: "\uB85C\uADF8\uC778 ID",
  loginIdHint: "\uC601\uBB38\uACFC \uC22B\uC790\uB9CC \uC0AC\uC6A9 (\uC608: admin)",
  name: "\uC774\uB984",
  phone: "\uC804\uD654\uBC88\uD638",
  email: "\uC774\uBA54\uC77C (\uC120\uD0DD)",
  password: "\uBE44\uBC00\uBC88\uD638",
  role: "\uAD8C\uD55C",
  roleAdmin: "\uAD00\uB9AC\uC790",
  roleStaff: "\uC77C\uBC18",
  status: "\uC0C1\uD0DC",
  statusActive: "\uC0AC\uC6A9\uC911",
  statusInactive: "\uC911\uC9C0",
  createdAt: "\uB4F1\uB85D\uC77C",
  actions: "\uC791\uC5C5",
  edit: "\uC218\uC815",
  resetPassword: "\uBE44\uBC00\uBC88\uD638 \uC7AC\uC124\uC815",
  activate: "\uD65C\uC131\uD654",
  deactivate: "\uBE44\uD65C\uC131\uD654",
  save: "\uC800\uC7A5",
  cancel: "\uCDE8\uC18C",
  create: "\uC0DD\uC131",
  totalUsers: "\uC804\uCCB4 \uACC4\uC815",
  activeUsers: "\uC0AC\uC6A9 \uC911",
  adminUsers: "\uAD00\uB9AC\uC790",
  loading: "\uC0AC\uC6A9\uC790 \uBAA9\uB85D\uC744 \uBD88\uB7EC\uC624\uB294 \uC911...",
  empty: "\uD45C\uC2DC\uD560 \uC0AC\uC6A9\uC790\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.",
  loadError: "\uC0AC\uC6A9\uC790 \uBAA9\uB85D\uC744 \uBD88\uB7EC\uC624\uC838 \uBABB\uD588\uC2B5\uB2C8\uB2E4.",
  createTitle: "\uC0C8 \uC0AC\uC6A9\uC790 \uCD94\uAC00",
  editTitle: "\uC0AC\uC6A9\uC790 \uC815\uBCF4 \uC218\uC815",
  passwordTitle: "\uBE44\uBC00\uBC88\uD638 \uC7AC\uC124\uC815",
  newPassword: "\uC0C8 \uBE44\uBC00\uBC88\uD638",
  confirmPassword: "\uBE44\uBC00\uBC88\uD638 \uD655\uC778",
  passwordMismatch: "\uBE44\uBC00\uBC88\uD638\uAC00 \uC77C\uCE58\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.",
  passwordTooShort: "\uBE44\uBC00\uBC88\uD638\uB294 4\uC790 \uC774\uC0C1\uC774\uC5B4\uC57C \uD569\uB2C8\uB2E4.",
  loginIdInvalid: "\uB85C\uADF8\uC778 ID\uB294 \uC601\uBB38\uACFC \uC22B\uC790\uB9CC \uC0AC\uC6A9\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
  nameRequired: "\uC774\uB984\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694.",
  createSuccess: "\uC0AC\uC6A9\uC790\uAC00 \uCD94\uAC00\uB418\uC5C8\uC2B5\uB2C8\uB2E4.",
  updateSuccess: "\uC0AC\uC6A9\uC790 \uC815\uBCF4\uAC00 \uC218\uC815\uB418\uC5C8\uC2B5\uB2C8\uB2E4.",
  passwordSuccess: "\uBE44\uBC00\uBC88\uD638\uAC00 \uC7AC\uC124\uC815\uB418\uC5C8\uC2B5\uB2C8\uB2E4.",
  statusSuccess: "\uACC4\uC815 \uC0C1\uD0DC\uAC00 \uBCC0\uACBD\uB418\uC5C8\uC2B5\uB2C8\uB2E4.",
  deactivateConfirm: "\uC774 \uACC4\uC815\uC744 \uBE44\uD65C\uC131\uD654\uD558\uC2DC\uACA0\uC2B5\uB2C8\uAE4C?",
  activateConfirm: "\uC774 \uACC4\uC815\uC744 \uD65C\uC131\uD654\uD558\uC2DC\uACA0\uC2B5\uB2C8\uAE4C?",
  selfBadge: "\uB098",
  dataSectionTitle: "\uB370\uC774\uD130 \uAD00\uB9AC",
  dataSectionDesc: "\uBC31\uC5C5 \uC800\uC7A5\uB7EC \uBCF4\uAE30, \uC5D1\uC140 \uBC0F \uBC88\uB4EC \uB370\uC774\uD130 \uC801\uC6A9\uC744 \uAD00\uB9AC\uD569\uB2C8\uB2E4.",
  backupSave: "\uBC31\uC5C5 \uC800\uC7A5",
  backupRestore: "\uBC31\uC5C5 \uBD88\uB7EC\uC624\uAE30",
  excelImport: "\uC5D1\uC140 \uBD88\uB7EC\uC624\uAE30",
  bundledSeed: "\uBC88\uB4EC \uB370\uC774\uD130 \uC801\uC6A9",
  backupLogTitle: "\uC790\uB3D9 \uBC31\uC5C5 \uB85C\uADF8",
  backupLogDesc: "\uC11C\uBC84 \uC790\uC815 \uBC31\uC5C5(cron) \uC2E4\uD589 \uB0B4\uC5ED\uACFC \uBCF4\uAD00 \uC911\uC778 \uC2A4\uB0B9\uC12F\uC785\uB2C8\uB2E4.",
  backupLogRefresh: "\uB85C\uADF8 \uC0C8\uB85C\uACE0\uCE68",
  backupLogLoading: "\uBC31\uC5C5 \uB85C\uADF8\uB97C \uBD88\uB7EC\uC624\uB294 \uC911...",
  backupLogEmpty: "\uBC31\uC5C5 \uB85C\uADF8\uAC00 \uC544\uC9C1 \uC5C6\uC2B5\uB2C8\uB2E4.",
  backupLogLoadError: "\uBC31\uC5C5 \uB85C\uADF8\uB97C \uBD88\uB7EC\uC624\uC838 \uBABB\uD588\uC2B5\uB2C8\uB2E4.",
  backupSchedule: "\uC2A4\uCF00\uC904",
  backupRetain: "\uBCF4\uAD00 \uAE30\uAC04",
  backupSnapshots: "\uBCF4\uAD00 \uC911\uC778 \uBC31\uC5C5",
  backupSnapshotDate: "\uB0A0\uC9DC",
  backupSnapshotSize: "\uC6A9\uB7C9",
  backupSnapshotCreated: "\uC0DD\uC131 \uC2DC\uAC01",
  backupSnapshotEmpty: "\uBCF4\uAD00 \uC911\uC778 \uBC31\uC5C5 \uC2A4\uB0B9\uC12F\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  backupRestore: "\uBCF5\uC6D0",
  backupRestoring: "\uBCF5\uC6D0 \uC911...",
  backupRestoreConfirm:
    "{date} \uBC31\uC5C5\uC73C\uB85C \uBCF5\uC6D0\uD569\uB2C8\uB2E4. \uD604\uC7AC \uB370\uC774\uD130\uB294 \uC0AC\uB77C\uC9C0\uACE0 \uC11C\uBC84\uAC00 \uC7AC\uC2DC\uC791\uD569\uB2C8\uB2E4. \uACC4\uC18D\uD558\uC2DC\uACA0\uC2B5\uB2C8\uAE4C?",
  backupRestoreSuccess: "{date} \uBC31\uC5C5 \uBCF5\uC6D0 \uC644\uB8CC. \uC11C\uBC84\uB97C \uC7AC\uC2DC\uC791\uD569\uB2C8\uB2E4.",
  backupRestoreError: "\uBC31\uC5C5 \uBCF5\uC6D0\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.",
  pageAccess: "\uD398\uC774\uC9C0 \uC811\uADFC",
  pageAccessHint: "\uC77C\uBC18 \uACC4\uC815\uC774 \uBA54\uB274\uC5D0\uC11C \uBCFC \uC218 \uC788\uB294 \uD398\uC774\uC9C0\uB97C \uC120\uD0DD\uD569\uB2C8\uB2E4.",
  pageAccessAdminHint: "\uAD00\uB9AC\uC790\uB294 \uBAA8\uB4E0 \uD398\uC774\uC9C0\uC5D0 \uC811\uADFC\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
  pageAccessRequired: "\uCD5C\uC18C 1\uAC1C \uC774\uC0C1\uC758 \uD398\uC774\uC9C0\uB97C \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.",
  attendanceView: "\uADFC\uD0DC \uC870\uD68C \uB300\uC0C1",
  attendanceViewHint: "\uC120\uD0DD\uD55C \uC9C1\uC6D0\uC758 \uADFC\uD0DC \uC774\uB825\uC744 \uBCFC \uC218 \uC788\uC2B5\uB2C8\uB2E4. (\uD300\uC7A5 \uB610\uB294 \uADFC\uD0DC \uB2F4\uB2F9)",
};

type UsersAdminPageProps = {
  currentUser: ErpUser;
  onBackup: () => void;
  onRestore: (file: File) => void;
  onExcelImport: (file: File) => void;
  onLoadBundledSeed: () => void;
};

type ModalMode = "create" | "edit" | "password" | null;

type UserFormState = {
  loginId: string;
  name: string;
  phone: string;
  email: string;
  password: string;
  confirmPassword: string;
  role: "admin" | "staff";
  allowedPages: ErpPageKey[];
  attendanceViewUserIds: number[];
};

const emptyForm = (): UserFormState => ({
  loginId: "",
  name: "",
  phone: "",
  email: "",
  password: "",
  confirmPassword: "",
  role: "staff",
  allowedPages: [...DEFAULT_STAFF_PAGE_KEYS],
  attendanceViewUserIds: [],
});

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="erp-text-caption mb-1 block font-semibold text-slate-500">{label}</span>
      {children}
      {hint ? <span className="erp-text-caption mt-1 block text-slate-400">{hint}</span> : null}
    </label>
  );
}

function Input({
  className = "",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { className?: string }) {
  return (
    <input
      {...props}
      lang={props.lang ?? "ko"}
      className={`erp-input w-full rounded-2xl border bg-white px-3 py-2.5 text-slate-900 outline-none transition focus:border-slate-900 md:px-4 md:py-3 ${className}`}
    />
  );
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toLocaleDateString("ko-KR");
}

function RoleBadge({ role }: { role: string }) {
  const isAdmin = role === "admin";
  return (
    <span className={`erp-user-role-badge ${isAdmin ? "admin" : "staff"}`}>
      {isAdmin ? L.roleAdmin : L.roleStaff}
    </span>
  );
}

function PageAccessPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: ErpPageKey[];
  onChange: (next: ErpPageKey[]) => void;
  disabled?: boolean;
}) {
  const groups = getPageAccessGroups();
  const selected = new Set(value);

  const togglePage = (pageKey: ErpPageKey, checked: boolean) => {
    if (disabled) return;
    if (checked) {
      onChange([...value, pageKey]);
      return;
    }
    onChange(value.filter((page) => page !== pageKey));
  };

  return (
    <div className="erp-page-access-picker space-y-3">
      {groups.map(([group, pages]) => (
        <div key={group} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <div className="erp-text-caption mb-2 font-bold text-slate-600">{group}</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {pages.map((page) => (
              <label key={page.key} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={selected.has(page.key)}
                  disabled={disabled}
                  onChange={(event) => togglePage(page.key, event.target.checked)}
                />
                <span>{page.label}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function StatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <span className={`erp-user-status-badge ${isActive ? "active" : "inactive"}`}>
      {isActive ? L.statusActive : L.statusInactive}
    </span>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <Card className="rounded-2xl border-slate-200 shadow-sm">
      <CardContent className="p-4">
        <div className="erp-text-caption font-bold text-slate-500">{label}</div>
        <div className={`erp-text-stat mt-1 font-black ${tone || "text-slate-900"}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function AttendanceViewUserPicker({
  users,
  excludeUserId,
  value,
  onChange,
  disabled = false,
}: {
  users: ErpUserRecord[];
  excludeUserId?: number;
  value: number[];
  onChange: (next: number[]) => void;
  disabled?: boolean;
}) {
  const candidates = users.filter((user) => user.isActive !== false && user.id !== excludeUserId);

  const toggleUser = (userId: number, checked: boolean) => {
    if (disabled) return;
    if (checked) {
      onChange([...value, userId]);
      return;
    }
    onChange(value.filter((id) => id !== userId));
  };

  if (!candidates.length) {
    return <p className="erp-text-caption rounded-2xl bg-slate-50 px-4 py-3 text-slate-500">{"\uC120\uD0DD \uAC00\uB2A5\uD55C \uC9C1\uC6D0\uC774 \uC5C6\uC2B5\uB2C8\uB2E4."}</p>;
  }

  return (
    <div className="erp-page-access-picker max-h-48 space-y-2 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-3">
      {candidates.map((user) => (
        <label key={user.id} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-slate-700">
          <input
            type="checkbox"
            checked={value.includes(user.id)}
            disabled={disabled}
            onChange={(event) => toggleUser(user.id, event.target.checked)}
          />
          <span>{user.name}</span>
          <span className="text-xs font-normal text-slate-400">{user.loginId}</span>
        </label>
      ))}
    </div>
  );
}

function formatBackupBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "-";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value >= 100 || unitIndex === 0 ? Math.round(value) : value.toFixed(1)} ${units[unitIndex]}`;
}

function formatBackupTimestamp(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ko-KR", { hour12: false });
}

export function UsersAdminPage({
  currentUser,
  onBackup,
  onRestore,
  onExcelImport,
  onLoadBundledSeed,
}: UsersAdminPageProps) {
  const { recordAudit, recordSummaryAudit } = useAudit();
  const backupInputRef = useRef<HTMLInputElement>(null);
  const excelInputRef = useRef<HTMLInputElement>(null);
  const [users, setUsers] = useState<ErpUserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [selectedUser, setSelectedUser] = useState<ErpUserRecord | null>(null);
  const [form, setForm] = useState<UserFormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [backupStatus, setBackupStatus] = useState<ErpBackupStatus | null>(null);
  const [backupLogLoading, setBackupLogLoading] = useState(true);
  const [backupLogError, setBackupLogError] = useState("");
  const [restoringBackupDate, setRestoringBackupDate] = useState("");

  const loadBackupStatus = useCallback(async () => {
    setBackupLogLoading(true);
    setBackupLogError("");
    try {
      const { status } = await fetchErpBackupStatus(120);
      setBackupStatus(status);
    } catch (err) {
      console.error(err);
      setBackupLogError(L.backupLogLoadError);
      setBackupStatus(null);
    } finally {
      setBackupLogLoading(false);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const next = await fetchUsers();
      setUsers(next);
    } catch (err) {
      console.error(err);
      setError(L.loadError);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRestoreBackup = async (date: string) => {
    const confirmMessage = L.backupRestoreConfirm.replace("{date}", date);
    if (!window.confirm(confirmMessage)) return;

    setRestoringBackupDate(date);
    setBackupLogError("");
    try {
      await restoreErpBackupSnapshotApi(date);
      setMessage(L.backupRestoreSuccess.replace("{date}", date));
      window.setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err) {
      setBackupLogError(err instanceof Error ? err.message : L.backupRestoreError);
      setRestoringBackupDate("");
    }
  };

  useEffect(() => {
    loadUsers();
    void loadBackupStatus();
  }, [loadUsers, loadBackupStatus]);

  const filteredUsers = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return users;
    return users.filter((user) => {
      const haystack = [user.loginId, user.name, user.email, user.phone, user.role]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(keyword);
    });
  }, [users, query]);

  const stats = useMemo(
    () => ({
      total: users.length,
      active: users.filter((user) => user.isActive !== false).length,
      admins: users.filter((user) => user.role === "admin").length,
    }),
    [users],
  );

  const closeModal = () => {
    setModalMode(null);
    setSelectedUser(null);
    setForm(emptyForm());
    setError("");
  };

  const openCreateModal = () => {
    setForm(emptyForm());
    setSelectedUser(null);
    setModalMode("create");
    setError("");
  };

  const openEditModal = (user: ErpUserRecord) => {
    setSelectedUser(user);
    setForm({
      loginId: user.loginId,
      name: user.name,
      phone: user.phone || "",
      email: user.email || "",
      password: "",
      confirmPassword: "",
      role: user.role === "admin" ? "admin" : "staff",
      allowedPages: user.allowedPages?.length ? (user.allowedPages as ErpPageKey[]) : [...DEFAULT_STAFF_PAGE_KEYS],
      attendanceViewUserIds: user.attendanceViewUserIds || [],
    });
    setModalMode("edit");
    setError("");
  };

  const openPasswordModal = (user: ErpUserRecord) => {
    setSelectedUser(user);
    setForm({ ...emptyForm(), loginId: user.loginId, name: user.name });
    setModalMode("password");
    setError("");
  };

  const validateCreateForm = () => {
    if (!LOGIN_ID_RE.test(form.loginId.trim())) {
      setError(L.loginIdInvalid);
      return false;
    }
    if (!form.name.trim()) {
      setError(L.nameRequired);
      return false;
    }
    if (form.password.length < 4) {
      setError(L.passwordTooShort);
      return false;
    }
    if (form.password !== form.confirmPassword) {
      setError(L.passwordMismatch);
      return false;
    }
    if (form.role === "staff" && form.allowedPages.length === 0) {
      setError(L.pageAccessRequired);
      return false;
    }
    return true;
  };

  const validateEditForm = () => {
    if (!form.name.trim()) {
      setError(L.nameRequired);
      return false;
    }
    if (form.role === "staff" && form.allowedPages.length === 0) {
      setError(L.pageAccessRequired);
      return false;
    }
    return true;
  };

  const validatePasswordForm = () => {
    if (form.password.length < 4) {
      setError(L.passwordTooShort);
      return false;
    }
    if (form.password !== form.confirmPassword) {
      setError(L.passwordMismatch);
      return false;
    }
    return true;
  };

  const handleCreate = async () => {
    if (!validateCreateForm()) return;
    setSubmitting(true);
    setError("");
    try {
      await createUserApi({
        loginId: form.loginId.trim(),
        password: form.password,
        name: form.name.trim(),
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        role: form.role,
        allowedPages: form.role === "staff" ? form.allowedPages : null,
        attendanceViewUserIds: form.role === "staff" ? form.attendanceViewUserIds : null,
      });
      recordAudit({
        entityType: "user",
        entityId: form.loginId.trim(),
        entityLabel: form.name.trim(),
        screen: L.pageTitle,
        action: "create",
        after: snapshotUserForAudit({
          loginId: form.loginId.trim(),
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          role: form.role,
          isActive: true,
        }),
        fields: USER_AUDIT_FIELDS,
        user: currentUser,
      });
      setMessage(L.createSuccess);
      closeModal();
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : L.loadError);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async () => {
    if (!selectedUser || !validateEditForm()) return;
    setSubmitting(true);
    setError("");
    try {
      await updateUserApi(selectedUser.id, {
        name: form.name.trim(),
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        role: form.role,
        allowedPages: form.role === "staff" ? form.allowedPages : null,
        attendanceViewUserIds: form.role === "staff" ? form.attendanceViewUserIds : null,
      });
      recordAudit({
        entityType: "user",
        entityId: selectedUser.id,
        entityLabel: form.name.trim() || selectedUser.loginId,
        screen: L.pageTitle,
        action: "update",
        before: snapshotUserForAudit(selectedUser),
        after: snapshotUserForAudit({
          ...selectedUser,
          name: form.name.trim(),
          phone: form.phone.trim(),
          email: form.email.trim(),
          role: form.role,
        }),
        fields: USER_AUDIT_FIELDS,
        user: currentUser,
      });
      setMessage(L.updateSuccess);
      closeModal();
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : L.loadError);
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async () => {
    if (!selectedUser || !validatePasswordForm()) return;
    setSubmitting(true);
    setError("");
    try {
      await resetUserPasswordApi(selectedUser.id, form.password);
      recordSummaryAudit({
        entityType: "user",
        entityId: selectedUser.id,
        entityLabel: selectedUser.name || selectedUser.loginId,
        screen: L.pageTitle,
        action: "update",
        fieldLabel: "\uBE44\uBC00\uBC88\uD638",
        before: "-",
        after: "\uBE44\uBC00\uBC88\uD638 \uC7AC\uC124\uC815",
        user: currentUser,
      });
      setMessage(L.passwordSuccess);
      closeModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : L.loadError);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (user: ErpUserRecord) => {
    const nextActive = user.isActive === false;
    const confirmMessage = nextActive ? L.activateConfirm : L.deactivateConfirm;
    if (!window.confirm(confirmMessage)) return;

    setError("");
    try {
      await setUserStatusApi(user.id, nextActive);
      recordAudit({
        entityType: "user",
        entityId: user.id,
        entityLabel: user.name || user.loginId,
        screen: L.pageTitle,
        action: "update",
        before: snapshotUserForAudit(user),
        after: snapshotUserForAudit({ ...user, isActive: nextActive }),
        fields: USER_AUDIT_FIELDS.filter((field) => field.key === "isActive"),
        user: currentUser,
      });
      setMessage(L.statusSuccess);
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : L.loadError);
    }
  };

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(""), 3200);
    return () => window.clearTimeout(timer);
  }, [message]);

  return (
    <div className="erp-page erp-users-admin-page">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1.5 erp-text-caption font-bold text-white">
            <Shield size={14} /> Admin
          </div>
          <h1 className="erp-text-page-title">{L.pageTitle}</h1>
          <p className="erp-text-body mt-2 text-slate-500">{L.pageDesc}</p>
        </div>
        <div className="flex shrink-0 flex-nowrap items-center gap-2">
          <Button variant="outline" className="shrink-0 whitespace-nowrap rounded-2xl" onClick={loadUsers} disabled={loading}>
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> {L.refresh}
          </Button>
          <Button className="shrink-0 whitespace-nowrap rounded-2xl font-bold" onClick={openCreateModal}>
            <UserPlus size={16} /> {L.addUser}
          </Button>
        </div>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <StatCard label={L.totalUsers} value={stats.total} />
        <StatCard label={L.activeUsers} value={stats.active} tone="text-emerald-600" />
        <StatCard label={L.adminUsers} value={stats.admins} tone="text-indigo-600" />
      </div>

      <Card className="mb-5 rounded-2xl border-slate-200 shadow-sm">
        <CardContent className="p-4 md:p-5">
          <div className="mb-4 flex items-start gap-3">
            <div className="rounded-2xl bg-slate-100 p-2 text-slate-600">
              <Database size={18} />
            </div>
            <div>
              <h2 className="erp-text-section font-bold text-slate-900">{L.dataSectionTitle}</h2>
              <p className="erp-text-caption mt-1 text-slate-500">{L.dataSectionDesc}</p>
            </div>
          </div>
          <div className="erp-users-data-actions">
            <Button type="button" variant="outline" className="shrink-0 whitespace-nowrap rounded-2xl" onClick={onBackup}>
              <Download size={16} /> {L.backupSave}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="shrink-0 whitespace-nowrap rounded-2xl"
              onClick={() => backupInputRef.current?.click()}
            >
              <Download size={16} /> {L.backupRestore}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="shrink-0 whitespace-nowrap rounded-2xl"
              onClick={() => excelInputRef.current?.click()}
            >
              <FileSpreadsheet size={16} /> {L.excelImport}
            </Button>
            <Button type="button" variant="outline" className="shrink-0 whitespace-nowrap rounded-2xl" onClick={onLoadBundledSeed}>
              <FileSpreadsheet size={16} /> {L.bundledSeed}
            </Button>
          </div>
          <input
            ref={backupInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onRestore(file);
              event.target.value = "";
            }}
          />
          <input
            ref={excelInputRef}
            type="file"
            accept=".xlsm,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onExcelImport(file);
              event.target.value = "";
            }}
          />
        </CardContent>
      </Card>

      <Card className="mb-5 rounded-2xl border-slate-200 shadow-sm">
        <CardContent className="p-4 md:p-5">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="erp-text-section font-bold text-slate-900">{L.backupLogTitle}</h2>
              <p className="erp-text-caption mt-1 text-slate-500">{L.backupLogDesc}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="shrink-0 whitespace-nowrap rounded-2xl"
              onClick={() => void loadBackupStatus()}
              disabled={backupLogLoading}
            >
              <RefreshCw size={16} className={backupLogLoading ? "animate-spin" : ""} /> {L.backupLogRefresh}
            </Button>
          </div>

          {backupLogError ? (
            <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 erp-text-body font-semibold text-red-600">
              {backupLogError}
            </div>
          ) : null}

          {backupLogLoading && !backupStatus ? (
            <p className="erp-text-body text-slate-500">{L.backupLogLoading}</p>
          ) : backupStatus ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="erp-text-caption font-semibold text-slate-500">{L.backupSchedule}</p>
                  <p className="mt-1 erp-text-body font-bold text-slate-900">
                    {backupStatus.scheduleLabel}
                  </p>
                  <p className="mt-1 erp-text-caption text-slate-500">{backupStatus.cronExpression}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="erp-text-caption font-semibold text-slate-500">{L.backupRetain}</p>
                  <p className="mt-1 erp-text-body font-bold text-slate-900">{backupStatus.retainDays}일</p>
                </div>
              </div>

              <div>
                <h3 className="mb-2 erp-text-body font-bold text-slate-800">{L.backupSnapshots}</h3>
                {backupStatus.snapshots.length ? (
                  <DesktopTableWrap className="rounded-2xl border border-slate-200">
                    <table className="erp-users-table w-full">
                      <thead>
                        <tr>
                          <th>{L.backupSnapshotDate}</th>
                          <th>{L.backupSnapshotSize}</th>
                          <th>{L.backupSnapshotCreated}</th>
                          <th>{L.actions}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {backupStatus.snapshots.map((snapshot) => (
                          <tr key={snapshot.date}>
                            <td className="font-semibold text-slate-900">{snapshot.date}</td>
                            <td>{formatBackupBytes(snapshot.totalBytes)}</td>
                            <td className="text-slate-600">{formatBackupTimestamp(snapshot.createdAt)}</td>
                            <td>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 rounded-lg text-xs"
                                disabled={Boolean(restoringBackupDate)}
                                onClick={() => void handleRestoreBackup(snapshot.date)}
                              >
                                <RotateCcw size={13} className={restoringBackupDate === snapshot.date ? "animate-spin" : ""} />
                                {restoringBackupDate === snapshot.date ? L.backupRestoring : L.backupRestore}
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </DesktopTableWrap>
                ) : (
                  <p className="erp-text-body text-slate-500">{L.backupSnapshotEmpty}</p>
                )}
              </div>

              <div>
                <h3 className="mb-2 erp-text-body font-bold text-slate-800">{L.backupLogTitle}</h3>
                <div className="erp-users-backup-log">
                  {backupStatus.logLines.length ? (
                    <pre>{backupStatus.logLines.join("\n")}</pre>
                  ) : (
                    <p className="erp-text-body text-slate-500">{L.backupLogEmpty}</p>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {message ? (
        <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 erp-text-body font-semibold text-emerald-700">
          {message}
        </div>
      ) : null}
      {error && !modalMode ? (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 erp-text-body font-semibold text-red-600">
          {error}
        </div>
      ) : null}

      <Card className="mb-5 rounded-2xl border-slate-200 shadow-sm">
        <CardContent className="p-4">
          <div className="flex max-w-xl items-center gap-3 rounded-2xl border bg-slate-50 px-4 py-3">
            <Search size={18} className="text-slate-400" />
            <input
              lang="ko"
              className="erp-input w-full bg-transparent outline-none"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={L.searchPlaceholder}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-10 text-center erp-text-body text-slate-500">{L.loading}</div>
          ) : filteredUsers.length === 0 ? (
            <div className="p-10 text-center erp-text-body text-slate-500">{L.empty}</div>
          ) : (
            <>
              <MobileRecordList className="p-4">
                {filteredUsers.map((user) => {
                  const isSelf = user.id === currentUser.id;
                  const isActive = user.isActive !== false;
                  return (
                    <MobileRecordCard
                      key={user.id}
                      title={
                        <span className="inline-flex items-center gap-2">
                          <Users size={14} className="shrink-0 text-slate-400" />
                          {user.loginId}
                          {isSelf ? <span className="erp-user-self-badge">{L.selfBadge}</span> : null}
                        </span>
                      }
                      subtitle={user.name}
                      badge={<RoleBadge role={user.role} />}
                      fields={[
                        { label: L.phone, value: user.phone || "-", tone: "muted" },
                        { label: L.email, value: user.email || "-", tone: "muted" },
                        {
                          label: L.status,
                          value: isActive ? L.statusActive : L.statusInactive,
                          tone: isActive ? "success" : "danger",
                        },
                        { label: L.createdAt, value: formatDate(user.createdAt), tone: "muted" },
                      ]}
                      actions={
                        <>
                          <button type="button" className="erp-mobile-action-btn" onClick={() => openEditModal(user)}>
                            <Pencil size={15} /> {L.edit}
                          </button>
                          <button type="button" className="erp-mobile-action-btn" onClick={() => openPasswordModal(user)}>
                            <KeyRound size={15} /> {L.resetPassword}
                          </button>
                          <button
                            type="button"
                            className={`erp-mobile-action-btn ${isActive ? "danger" : ""}`}
                            onClick={() => handleToggleStatus(user)}
                            disabled={isSelf && isActive}
                          >
                            {isActive ? (
                              <>
                                <UserMinus size={15} /> {L.deactivate}
                              </>
                            ) : (
                              <>
                                <UserCheck size={15} /> {L.activate}
                              </>
                            )}
                          </button>
                        </>
                      }
                    />
                  );
                })}
              </MobileRecordList>
              <DesktopTableWrap>
                <table className="erp-users-table w-full min-w-[960px]">
                  <thead>
                    <tr>
                      <th>{L.loginId}</th>
                      <th>{L.name}</th>
                      <th>{L.phone}</th>
                      <th>{L.email}</th>
                      <th>{L.role}</th>
                      <th>{L.status}</th>
                      <th>{L.createdAt}</th>
                      <th>{L.actions}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((user) => {
                      const isSelf = user.id === currentUser.id;
                      const isActive = user.isActive !== false;
                      return (
                        <tr key={user.id} className={!isActive ? "erp-users-row-inactive" : ""}>
                          <td>
                            <div className="flex items-center gap-2 font-bold text-slate-900">
                              <Users size={14} className="text-slate-400" />
                              {user.loginId}
                              {isSelf ? <span className="erp-user-self-badge">{L.selfBadge}</span> : null}
                            </div>
                          </td>
                          <td>{user.name}</td>
                          <td>{user.phone || "-"}</td>
                          <td>{user.email || "-"}</td>
                          <td>
                            <RoleBadge role={user.role} />
                          </td>
                          <td>
                            <StatusBadge isActive={isActive} />
                          </td>
                          <td>{formatDate(user.createdAt)}</td>
                          <td>
                            <div className="flex flex-nowrap items-center gap-1.5">
                              <Button
                                variant="outline"
                                size="sm"
                                className="shrink-0 whitespace-nowrap rounded-xl"
                                onClick={() => openEditModal(user)}
                              >
                                <Pencil size={14} /> {L.edit}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="shrink-0 whitespace-nowrap rounded-xl"
                                onClick={() => openPasswordModal(user)}
                              >
                                <KeyRound size={14} /> {L.resetPassword}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className={`shrink-0 whitespace-nowrap rounded-xl ${isActive ? "text-amber-700" : "text-emerald-700"}`}
                                onClick={() => handleToggleStatus(user)}
                                disabled={isSelf && isActive}
                              >
                                {isActive ? (
                                  <>
                                    <UserMinus size={14} /> {L.deactivate}
                                  </>
                                ) : (
                                  <>
                                    <UserCheck size={14} /> {L.activate}
                                  </>
                                )}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </DesktopTableWrap>
            </>
          )}
        </CardContent>
      </Card>

      {modalMode ? (
        <div className="erp-users-modal-backdrop" onClick={closeModal}>
          <div
            className="erp-users-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <h2 className="erp-text-section font-black">
                  {modalMode === "create" ? L.createTitle : null}
                  {modalMode === "edit" ? L.editTitle : null}
                  {modalMode === "password" ? L.passwordTitle : null}
                </h2>
                {selectedUser && modalMode !== "create" ? (
                  <p className="erp-text-caption mt-1 text-slate-500">
                    {selectedUser.loginId} / {selectedUser.name}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"
                onClick={closeModal}
                aria-label={L.cancel}
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              {modalMode === "create" ? (
                <Field label={L.loginId} hint={L.loginIdHint}>
                  <Input
                    value={form.loginId}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        loginId: event.target.value.replace(/[^a-zA-Z0-9]/g, ""),
                      }))
                    }
                    placeholder="admin"
                    autoComplete="off"
                  />
                </Field>
              ) : null}

              {modalMode !== "password" ? (
                <>
                  <Field label={L.name}>
                    <Input
                      value={form.name}
                      onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                    />
                  </Field>
                  <Field label={L.phone}>
                    <Input
                      value={form.phone}
                      onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
                      placeholder="010-0000-0000"
                    />
                  </Field>
                  <Field label={L.email}>
                    <Input
                      type="email"
                      value={form.email}
                      onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                      placeholder="user@example.com"
                    />
                  </Field>
                  <Field label={L.role}>
                    <select
                      className="erp-input w-full rounded-2xl border bg-white px-3 py-2.5 outline-none focus:border-slate-900 md:px-4 md:py-3"
                      value={form.role}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          role: event.target.value === "admin" ? "admin" : "staff",
                          allowedPages:
                            event.target.value === "admin" ? [...DEFAULT_STAFF_PAGE_KEYS] : prev.allowedPages.length ? prev.allowedPages : [...DEFAULT_STAFF_PAGE_KEYS],
                        }))
                      }
                      disabled={modalMode === "edit" && selectedUser?.id === currentUser.id}
                    >
                      <option value="staff">{L.roleStaff}</option>
                      <option value="admin">{L.roleAdmin}</option>
                    </select>
                  </Field>
                  {form.role === "staff" ? (
                    <>
                      <Field label={L.pageAccess} hint={L.pageAccessHint}>
                        <PageAccessPicker
                          value={form.allowedPages}
                          onChange={(allowedPages) => setForm((prev) => ({ ...prev, allowedPages }))}
                        />
                      </Field>
                      <Field label={L.attendanceView} hint={L.attendanceViewHint}>
                        <AttendanceViewUserPicker
                          users={users}
                          excludeUserId={selectedUser?.id}
                          value={form.attendanceViewUserIds}
                          onChange={(attendanceViewUserIds) => setForm((prev) => ({ ...prev, attendanceViewUserIds }))}
                        />
                      </Field>
                    </>
                  ) : (
                    <p className="erp-text-caption rounded-2xl bg-slate-50 px-4 py-3 text-slate-500">{L.pageAccessAdminHint}</p>
                  )}
                </>
              ) : null}

              {modalMode === "create" || modalMode === "password" ? (
                <>
                  <Field label={modalMode === "password" ? L.newPassword : L.password}>
                    <Input
                      type="password"
                      value={form.password}
                      onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                      autoComplete="new-password"
                    />
                  </Field>
                  <Field label={L.confirmPassword}>
                    <Input
                      type="password"
                      value={form.confirmPassword}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, confirmPassword: event.target.value }))
                      }
                      autoComplete="new-password"
                    />
                  </Field>
                </>
              ) : null}

              {modalMode === "edit" && selectedUser ? (
                <Field label={L.loginId}>
                  <Input value={selectedUser.loginId} disabled className="bg-slate-50 text-slate-500" />
                </Field>
              ) : null}

              {error ? (
                <div className="rounded-2xl bg-red-50 px-4 py-3 erp-text-body font-semibold text-red-600">
                  {error}
                </div>
              ) : null}

              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1 rounded-2xl" onClick={closeModal} disabled={submitting}>
                  {L.cancel}
                </Button>
                <Button
                  className="flex-1 rounded-2xl font-bold"
                  disabled={submitting}
                  onClick={() => {
                    if (modalMode === "create") handleCreate();
                    else if (modalMode === "edit") handleUpdate();
                    else if (modalMode === "password") handleResetPassword();
                  }}
                >
                  {submitting
                    ? "..."
                    : modalMode === "create"
                      ? L.create
                      : modalMode === "password"
                        ? L.resetPassword
                        : L.save}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
