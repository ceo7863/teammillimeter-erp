import React, { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import { TeamChatPage } from "@/components/TeamChatPage";
import {
  getAuthToken,
  loadAuthUser,
  loginWithApi,
  type ErpUser,
} from "@/utils/erpApi";
import type { ErpChatAction } from "@/utils/erpChatApi";
import { stashPendingChatAction } from "@/utils/erpChatPendingAction";
import {
  captureTeamChatListPopupBounds,
  captureTeamChatThreadPopupBounds,
  focusMainErpWindow,
} from "@/utils/teamChatPopup";
import type { TeamChatStandaloneRoute } from "@/utils/teamChatRoute";

const L = {
  title: "\uC0AC\uB0B4 \uCC57",
  loginIntro: "\uC0AC\uB0B4 \uCC57\uC744 \uC0AC\uC6A9\uD558\uB824\uBA74 \uB85C\uADF8\uC778\uD558\uC138\uC694.",
  loginId: "\uC544\uC774\uB514",
  loginPassword: "\uBE44\uBC00\uBC88\uD638",
  loginSubmit: "\uB85C\uADF8\uC778",
  loginSubmitting: "\uB85C\uADF8\uC778 \uC911\u2026",
  loginRequired: "\uC544\uC774\uB514\uC640 \uBE44\uBC00\uBC88\uD638\uB97C \uC785\uB825\uD574 \uC8FC\uC138\uC694.",
  loginFailed: "\uB85C\uADF8\uC778\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.",
  openErp: "ERP \uC804\uCCB4 \uC5F4\uAE30",
  hint: "\uCC57\uBC29\uC744 \uB204\uB974\uBA74 \uB300\uD654\uB97C \uBCC4\uB3C4 \uCC3D\uC5D0\uC11C \uC5ED\uC2DC \uC5FD\uB2C8\uB2E4.",
  threadHint: "\uB300\uD654 \uCC3D",
};

export function TeamChatStandalonePage({ route }: { route: TeamChatStandaloneRoute }) {
  const [currentUser, setCurrentUser] = useState<ErpUser | null>(() => {
    const user = loadAuthUser();
    return user && getAuthToken() ? user : null;
  });
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  const isThreadWindow = route.mode === "thread";
  const selectedChannelRef = useRef<string | null>(isThreadWindow ? route.channelId : null);

  useEffect(() => {
    const saveBounds = () => {
      if (isThreadWindow) captureTeamChatThreadPopupBounds();
      else captureTeamChatListPopupBounds();
    };
    window.addEventListener("resize", saveBounds);
    window.addEventListener("beforeunload", saveBounds);
    return () => {
      window.removeEventListener("resize", saveBounds);
      window.removeEventListener("beforeunload", saveBounds);
      saveBounds();
    };
  }, [isThreadWindow]);

  const handleLogin = useCallback(async () => {
    const id = loginId.trim();
    if (!id || !password) {
      setLoginError(L.loginRequired);
      return;
    }
    setLoggingIn(true);
    setLoginError("");
    try {
      const { user } = await loginWithApi(id, password);
      setCurrentUser(user);
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : L.loginFailed);
    } finally {
      setLoggingIn(false);
    }
  }, [loginId, password]);

  const handleErpAction = useCallback((action: ErpChatAction) => {
    stashPendingChatAction(action);
    focusMainErpWindow();
  }, []);

  if (!currentUser) {
    return (
      <div className="erp-team-chat-standalone-login flex min-h-[100dvh] items-center justify-center bg-slate-950 px-4 py-8 text-white">
        <div className="w-full max-w-sm">
          <h1 className="text-xl font-bold">{L.title}</h1>
          <p className="mt-2 text-sm text-slate-400">{L.loginIntro}</p>
          <form
            className="mt-6 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void handleLogin();
            }}
          >
            <input
              type="text"
              className="erp-chat-input w-full"
              placeholder={L.loginId}
              value={loginId}
              onChange={(event) => setLoginId(event.target.value)}
              autoComplete="username"
            />
            <input
              type="password"
              className="erp-chat-input w-full"
              placeholder={L.loginPassword}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />
            {loginError ? <div className="erp-chat-error">{loginError}</div> : null}
            <button type="submit" className="erp-chat-send w-full justify-center py-3" disabled={loggingIn}>
              {loggingIn ? L.loginSubmitting : L.loginSubmit}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className={`erp-team-chat-standalone flex min-h-[100dvh] flex-col bg-slate-100 ${isThreadWindow ? "erp-team-chat-standalone--thread" : ""}`}>
      {!isThreadWindow ? (
        <div className="erp-team-chat-standalone__top flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2.5">
          <div>
            <div className="text-sm font-bold text-slate-900">{L.title}</div>
            <div className="text-xs text-slate-500">{L.hint}</div>
          </div>
          <button type="button" className="erp-team-chat-standalone__erp-btn" onClick={() => focusMainErpWindow()}>
            <ExternalLink size={14} />
            {L.openErp}
          </button>
        </div>
      ) : (
        <div className="erp-team-chat-standalone__top erp-team-chat-standalone__top--thread flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2">
          <div className="text-xs font-semibold text-slate-500">{L.threadHint}</div>
          <button type="button" className="erp-team-chat-standalone__erp-btn" onClick={() => focusMainErpWindow()}>
            <ExternalLink size={14} />
            {L.openErp}
          </button>
        </div>
      )}
      <div className="erp-team-chat-standalone__body min-h-0 flex-1">
        <TeamChatPage
          currentUser={currentUser}
          isPageActive
          standalone
          listOnly={!isThreadWindow}
          threadOnly={isThreadWindow}
          initialChannelId={isThreadWindow ? route.channelId : undefined}
          onErpAction={handleErpAction}
          onSelectedChannelChange={(channelId) => {
            selectedChannelRef.current = channelId;
          }}
        />
      </div>
    </div>
  );
}
