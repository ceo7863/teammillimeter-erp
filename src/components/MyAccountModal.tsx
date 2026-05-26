import React, { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  changeSelfPasswordApi,
  fetchAuthMe,
  updateSelfProfileApi,
  type ErpUser,
} from "@/utils/erpApi";

const L = {
  title: "내 계정",
  profileTab: "내 정보",
  passwordTab: "비밀번호",
  loginId: "로그인 ID",
  name: "이름",
  phone: "전화번호",
  email: "이메일",
  role: "권한",
  roleAdmin: "관리자",
  roleStaff: "일반",
  currentPassword: "현재 비밀번호",
  newPassword: "새 비밀번호",
  confirmPassword: "새 비밀번호 확인",
  saveProfile: "정보 저장",
  savePassword: "비밀번호 변경",
  cancel: "취소",
  close: "닫기",
  nameRequired: "이름을 입력해 주세요.",
  passwordTooShort: "비밀번호는 4자 이상이어야 합니다.",
  passwordMismatch: "새 비밀번호가 일치하지 않습니다.",
  profileSaved: "내 정보가 저장되었습니다.",
  passwordSaved: "비밀번호가 변경되었습니다.",
  localPasswordHint: "비밀번호 변경은 서버 연결 모드에서만 가능합니다.",
  loadError: "계정 정보를 불러오지 못했습니다.",
};

type MyAccountModalProps = {
  open: boolean;
  currentUser: ErpUser;
  apiMode: boolean;
  onClose: () => void;
  onUserUpdated: (user: ErpUser) => void;
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="erp-text-caption mb-1 block font-semibold text-slate-500">{label}</span>
      {children}
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

export function MyAccountModal({ open, currentUser, apiMode, onClose, onUserUpdated }: MyAccountModalProps) {
  const [tab, setTab] = useState<"profile" | "password">("profile");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [name, setName] = useState(currentUser.name || "");
  const [phone, setPhone] = useState(currentUser.phone || "");
  const [email, setEmail] = useState(currentUser.email || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    if (!open) return;
    setTab("profile");
    setMessage("");
    setError("");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setName(currentUser.name || "");
    setPhone(currentUser.phone || "");
    setEmail(currentUser.email || "");

    if (!apiMode) return;

    setLoading(true);
    fetchAuthMe()
      .then((user) => {
        setName(user.name || "");
        setPhone(user.phone || "");
        setEmail(user.email || "");
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : L.loadError);
      })
      .finally(() => setLoading(false));
  }, [open, apiMode, currentUser]);

  if (!open) return null;

  const saveProfile = async () => {
    if (!name.trim()) {
      setError(L.nameRequired);
      return;
    }

    setSubmitting(true);
    setError("");
    setMessage("");

    try {
      if (apiMode) {
        const user = await updateSelfProfileApi({
          name: name.trim(),
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
        });
        onUserUpdated(user);
      } else {
        onUserUpdated({
          ...currentUser,
          name: name.trim(),
          phone: phone.trim() || null,
          email: email.trim() || null,
        });
      }
      setMessage(L.profileSaved);
    } catch (err) {
      setError(err instanceof Error ? err.message : L.loadError);
    } finally {
      setSubmitting(false);
    }
  };

  const savePassword = async () => {
    if (!apiMode) {
      setError(L.localPasswordHint);
      return;
    }
    if (newPassword.length < 4) {
      setError(L.passwordTooShort);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(L.passwordMismatch);
      return;
    }

    setSubmitting(true);
    setError("");
    setMessage("");

    try {
      await changeSelfPasswordApi(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage(L.passwordSaved);
    } catch (err) {
      setError(err instanceof Error ? err.message : L.loadError);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="erp-ledger-modal-backdrop" onClick={onClose}>
      <div className="erp-ledger-modal erp-my-account-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="erp-text-section font-bold">{L.title}</h2>
            <p className="erp-text-caption mt-1 text-slate-500">{currentUser.loginId}</p>
          </div>
          <button type="button" className="rounded-xl p-2 text-slate-400 hover:bg-slate-100" onClick={onClose} aria-label={L.close}>
            <X size={18} />
          </button>
        </div>

        <div className="erp-my-account-tabs mb-4 flex gap-2">
          <Button
            type="button"
            variant={tab === "profile" ? "default" : "outline"}
            className="rounded-2xl"
            onClick={() => {
              setTab("profile");
              setError("");
              setMessage("");
            }}
          >
            {L.profileTab}
          </Button>
          <Button
            type="button"
            variant={tab === "password" ? "default" : "outline"}
            className="rounded-2xl"
            onClick={() => {
              setTab("password");
              setError("");
              setMessage("");
            }}
          >
            {L.passwordTab}
          </Button>
        </div>

        {loading ? <p className="erp-text-caption text-slate-500">불러오는 중...</p> : null}

        {tab === "profile" ? (
          <div className="space-y-4">
            <Field label={L.loginId}>
              <Input value={currentUser.loginId} disabled className="bg-slate-50 text-slate-500" />
            </Field>
            <Field label={L.role}>
              <Input
                value={currentUser.role === "admin" ? L.roleAdmin : L.roleStaff}
                disabled
                className="bg-slate-50 text-slate-500"
              />
            </Field>
            <Field label={L.name}>
              <Input value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
            <Field label={L.phone}>
              <Input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="010-0000-0000" />
            </Field>
            <Field label={L.email}>
              <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="user@example.com" />
            </Field>
          </div>
        ) : (
          <div className="space-y-4">
            {!apiMode ? <p className="erp-text-caption rounded-2xl bg-amber-50 px-4 py-3 text-amber-700">{L.localPasswordHint}</p> : null}
            <Field label={L.currentPassword}>
              <Input
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                autoComplete="current-password"
                disabled={!apiMode}
              />
            </Field>
            <Field label={L.newPassword}>
              <Input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                autoComplete="new-password"
                disabled={!apiMode}
              />
            </Field>
            <Field label={L.confirmPassword}>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                disabled={!apiMode}
              />
            </Field>
          </div>
        )}

        {error ? <p className="erp-text-caption mt-4 font-semibold text-rose-600">{error}</p> : null}
        {message ? <p className="erp-text-caption mt-4 font-semibold text-emerald-600">{message}</p> : null}

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" className="rounded-2xl" onClick={onClose}>
            {L.cancel}
          </Button>
          {tab === "profile" ? (
            <Button type="button" className="rounded-2xl" disabled={submitting || loading} onClick={saveProfile}>
              {L.saveProfile}
            </Button>
          ) : (
            <Button type="button" className="rounded-2xl" disabled={submitting || !apiMode} onClick={savePassword}>
              {L.savePassword}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
