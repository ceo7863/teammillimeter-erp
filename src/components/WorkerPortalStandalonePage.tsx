import React, { useState } from "react";
import { HardHat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { WorkerPortalView } from "@/components/WorkerPortalView";
import { isApiModeEnabled } from "@/utils/erpApi";
import {
  changeWorkerPortalPassword,
  clearWorkerPortalSession,
  getWorkerPortalToken,
  keepWorkerPortalPassword,
  loginWorkerPortal,
} from "@/utils/workerPortalApi";

const BRAND_LOGO_SRC = "/team-millimeter-login-logo.jpg";

const L = {
  kicker: "TEAM MILLIMETER · INSTALL CREW",
  title: "시공내역서 포털",
  desc: "월별 시공 내역과 지급 내역을 확인하고, 확인 서명을 남길 수 있습니다.",
  loginTitle: "시공자 로그인",
  loginDesc: "포털 ID와 비밀번호를 입력하세요. 초기 비밀번호는 1234입니다.",
  requiredChangeTitle: "비밀번호 변경",
  requiredChangeDesc: "새 비밀번호로 변경하거나, 다음을 눌러 현재 비밀번호를 그대로 사용할 수 있습니다.",
  skipPasswordChange: "다음",
  skipping: "이동 중...",
  loginId: "포털 로그인 ID",
  loginIdHint: "SC 사번 전체 입력 (예: 000043 · 43도 가능 · 4만 입력 X)",
  loginIdTooShort: "사번을 더 길게 입력해 주세요. (예: 43 또는 000043)",
  password: "비밀번호",
  submit: "로그인",
  submitting: "로그인 중...",
  changePassword: "비밀번호 변경",
  backToLogin: "로그인으로 돌아가기",
  currentPassword: "현재 비밀번호",
  newPassword: "새 비밀번호",
  confirmPassword: "새 비밀번호 확인",
  changeSubmit: "비밀번호 변경",
  changing: "변경 중...",
  changeSuccess: "비밀번호가 변경되었습니다. 새 비밀번호로 로그인해 주세요.",
  apiRequired: "시공내역서 포털은 서버 연동(API) 모드에서만 사용할 수 있습니다.",
  loginIdRequired: "포털 로그인 ID를 입력해 주세요.",
  passwordRequired: "비밀번호를 입력해 주세요.",
  currentPasswordRequired: "현재 비밀번호를 입력해 주세요.",
  newPasswordRequired: "새 비밀번호를 입력해 주세요.",
  passwordMismatch: "새 비밀번호 확인이 일치하지 않습니다.",
};

function FormField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="erp-text-caption font-semibold text-slate-600">{label}</span>
      {children}
      {hint ? <span className="erp-text-caption block text-slate-400">{hint}</span> : null}
    </label>
  );
}

export function WorkerPortalStandalonePage() {
  const apiMode = isApiModeEnabled();
  const [sessionActive, setSessionActive] = useState(() => Boolean(getWorkerPortalToken()));
  const [formMode, setFormMode] = useState<"login" | "changePassword" | "requiredChangePassword">("login");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [submittingAction, setSubmittingAction] = useState<"login" | "change" | "skip" | null>(null);

  const resetChangePasswordForm = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  };

  const switchFormMode = (mode: "login" | "changePassword" | "requiredChangePassword") => {
    setFormMode(mode);
    setError("");
    setSuccess("");
    if (mode === "login") {
      resetChangePasswordForm();
    } else if (mode === "changePassword") {
      setPassword("");
    }
  };

  const handleLogout = () => {
    clearWorkerPortalSession();
    setSessionActive(false);
    setPassword("");
    setError("");
    setSuccess("");
  };

  const handleLogin = async () => {
    const trimmedId = loginId.trim();
    if (!trimmedId) {
      setError(L.loginIdRequired);
      return;
    }
    if (/^\d+$/.test(trimmedId) && trimmedId.length <= 2) {
      setError(L.loginIdTooShort);
      return;
    }
    if (!password) {
      setError(L.passwordRequired);
      return;
    }
    if (!apiMode) {
      setError(L.apiRequired);
      return;
    }
    setLoading(true);
    setSubmittingAction("login");
    setError("");
    setSuccess("");
    try {
      const result = await loginWorkerPortal(trimmedId, password);
      if (result.mustChangePassword) {
        setCurrentPassword(password);
        setPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setFormMode("requiredChangePassword");
        return;
      }
      setPassword("");
      setSessionActive(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "로그인에 실패했습니다.");
    } finally {
      setLoading(false);
      setSubmittingAction(null);
    }
  };

  const handleChangePassword = async () => {
    const trimmedId = loginId.trim();
    if (!trimmedId) {
      setError(L.loginIdRequired);
      return;
    }
    if (!currentPassword) {
      setError(L.currentPasswordRequired);
      return;
    }
    if (!newPassword.trim()) {
      setError(L.newPasswordRequired);
      return;
    }
    if (newPassword.trim() !== confirmPassword.trim()) {
      setError(L.passwordMismatch);
      return;
    }
    if (!apiMode) {
      setError(L.apiRequired);
      return;
    }
    setLoading(true);
    setSubmittingAction("change");
    setError("");
    setSuccess("");
    try {
      const result = await changeWorkerPortalPassword(trimmedId, currentPassword, newPassword.trim(), confirmPassword.trim());
      resetChangePasswordForm();
      if (formMode === "requiredChangePassword" && result.token) {
        setFormMode("login");
        setPassword("");
        setSessionActive(true);
        return;
      }
      setFormMode("login");
      setPassword("");
      setSuccess(L.changeSuccess);
    } catch (err) {
      setError(err instanceof Error ? err.message : "비밀번호 변경에 실패했습니다.");
    } finally {
      setLoading(false);
      setSubmittingAction(null);
    }
  };

  const handleKeepPassword = async () => {
    const trimmedId = loginId.trim();
    if (!trimmedId) {
      setError(L.loginIdRequired);
      return;
    }
    if (!currentPassword) {
      setError(L.currentPasswordRequired);
      return;
    }
    if (!apiMode) {
      setError(L.apiRequired);
      return;
    }
    setLoading(true);
    setSubmittingAction("skip");
    setError("");
    setSuccess("");
    try {
      await keepWorkerPortalPassword(trimmedId, currentPassword);
      resetChangePasswordForm();
      setFormMode("login");
      setPassword("");
      setSessionActive(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "포털 진입에 실패했습니다.");
    } finally {
      setLoading(false);
      setSubmittingAction(null);
    }
  };

  if (sessionActive) {
    return <WorkerPortalView onLogout={handleLogout} />;
  }

  return (
    <div className="worker-portal-login-page min-h-screen p-4 text-white sm:p-6" lang="ko">
      <div className="worker-portal-login-page__glow" aria-hidden="true" />
      <div className="worker-portal-login-page__inner mx-auto grid min-h-[calc(100vh-32px)] max-w-5xl grid-cols-1 items-center gap-8 lg:min-h-[calc(100vh-48px)] lg:grid-cols-[minmax(0,1fr)_minmax(0,0.92fr)] lg:gap-10">
        <div className="worker-portal-login-page__hero text-center lg:text-left">
          <div className="worker-portal-login-page__icon-wrap mx-auto lg:mx-0">
            <HardHat className="h-8 w-8 text-amber-100" aria-hidden="true" />
          </div>
          <img src={BRAND_LOGO_SRC} alt="TEAM MILLIMETER" className="worker-portal-login-page__logo mx-auto lg:mx-0" />
          <p className="worker-portal-login-page__kicker">{L.kicker}</p>
          <h1 className="worker-portal-login-page__title">{L.title}</h1>
          <p className="worker-portal-login-page__desc">{L.desc}</p>
        </div>

        <Card className="worker-portal-login-card rounded-3xl border-0 bg-white text-slate-900 shadow-2xl">
          <CardContent className="p-6 sm:p-8">
            <div className="mb-6 text-center">
              <h2 className="erp-text-section font-black text-slate-900">
                {formMode === "requiredChangePassword"
                  ? L.requiredChangeTitle
                  : formMode === "changePassword"
                    ? L.changePassword
                    : L.loginTitle}
              </h2>
              <p className="erp-text-body mt-2 text-slate-500">
                {formMode === "requiredChangePassword"
                  ? L.requiredChangeDesc
                  : formMode === "changePassword"
                    ? L.changePassword
                    : L.loginDesc}
              </p>
            </div>

            <div className="space-y-4">
              {formMode === "login" ? (
                <>
                  <FormField label={L.loginId} hint={L.loginIdHint}>
                    <Input
                      value={loginId}
                      onChange={(e) => setLoginId(e.target.value.replace(/[^a-zA-Z0-9]/gi, "").toLowerCase())}
                      placeholder={L.loginId}
                      autoComplete="username"
                      className="rounded-2xl"
                    />
                  </FormField>
                  <FormField label={L.password}>
                    <Input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={L.password}
                      autoComplete="current-password"
                      className="rounded-2xl"
                      onKeyDown={(e) => e.key === "Enter" && !loading && void handleLogin()}
                    />
                  </FormField>
                  <div className="text-center">
                    <button
                      type="button"
                      className="erp-text-caption font-semibold text-amber-700 hover:text-amber-800"
                      onClick={() => switchFormMode("changePassword")}
                    >
                      {L.changePassword}
                    </button>
                  </div>
                </>
              ) : formMode === "requiredChangePassword" ? (
                <>
                  <FormField label={L.loginId}>
                    <Input value={loginId} readOnly className="rounded-2xl bg-slate-50" />
                  </FormField>
                  <FormField label={L.currentPassword}>
                    <Input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder={L.currentPassword}
                      autoComplete="current-password"
                      className="rounded-2xl"
                    />
                  </FormField>
                  <FormField label={L.newPassword}>
                    <Input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="4자 이상"
                      autoComplete="new-password"
                      className="rounded-2xl"
                    />
                  </FormField>
                  <FormField label={L.confirmPassword}>
                    <Input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder={L.confirmPassword}
                      autoComplete="new-password"
                      className="rounded-2xl"
                      onKeyDown={(e) => e.key === "Enter" && !loading && void handleChangePassword()}
                    />
                  </FormField>
                </>
              ) : (
                <>
                  <FormField label={L.loginId}>
                    <Input
                      value={loginId}
                      onChange={(e) => setLoginId(e.target.value.replace(/[^a-zA-Z0-9]/gi, "").toLowerCase())}
                      placeholder={L.loginId}
                      autoComplete="username"
                      className="rounded-2xl"
                    />
                  </FormField>
                  <FormField label={L.currentPassword}>
                    <Input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder={L.currentPassword}
                      autoComplete="current-password"
                      className="rounded-2xl"
                    />
                  </FormField>
                  <FormField label={L.newPassword}>
                    <Input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="4자 이상"
                      autoComplete="new-password"
                      className="rounded-2xl"
                    />
                  </FormField>
                  <FormField label={L.confirmPassword}>
                    <Input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder={L.confirmPassword}
                      autoComplete="new-password"
                      className="rounded-2xl"
                      onKeyDown={(e) => e.key === "Enter" && !loading && void handleChangePassword()}
                    />
                  </FormField>
                  <div className="text-center">
                    <button
                      type="button"
                      className="erp-text-caption font-semibold text-slate-500 hover:text-slate-700"
                      onClick={() => switchFormMode("login")}
                    >
                      {L.backToLogin}
                    </button>
                  </div>
                </>
              )}

              {success ? (
                <div className="erp-text-body rounded-2xl bg-emerald-50 px-4 py-3 font-semibold text-emerald-700">{success}</div>
              ) : null}
              {error ? (
                <div className="erp-text-body rounded-2xl bg-red-50 px-4 py-3 font-semibold text-red-600">{error}</div>
              ) : null}

              <Button
                type="button"
                className="worker-portal-login-submit erp-text-body w-full rounded-2xl py-5 font-bold md:py-6 touch-manipulation"
                onClick={
                  formMode === "login"
                    ? () => void handleLogin()
                    : () => void handleChangePassword()
                }
                disabled={loading}
              >
                {loading
                  ? submittingAction === "login"
                    ? L.submitting
                    : submittingAction === "skip"
                      ? L.skipping
                      : L.changing
                  : formMode === "login"
                    ? L.submit
                    : L.changeSubmit}
              </Button>

              {formMode === "requiredChangePassword" ? (
                <Button
                  type="button"
                  variant="outline"
                  className="erp-text-body w-full rounded-2xl border-slate-200 py-5 font-semibold text-slate-700 md:py-6 touch-manipulation"
                  onClick={() => void handleKeepPassword()}
                  disabled={loading}
                >
                  {loading && submittingAction === "skip" ? L.skipping : L.skipPasswordChange}
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
