import React, { useCallback, useState } from "react";
import { ExternalLink } from "lucide-react";
import { ErpChatWidget } from "@/components/ErpChatWidget";
import {
  getAuthToken,
  loadAuthUser,
  loginWithApi,
  type ErpUser,
} from "@/utils/erpApi";
import { stashPendingChatAction } from "@/utils/erpChatPendingAction";
import type { ErpChatAction } from "@/utils/erpChatApi";

type ErpChatStandalonePageProps = {
  autoVoice?: boolean;
};

export function ErpChatStandalonePage({ autoVoice = true }: ErpChatStandalonePageProps) {
  const [currentUser, setCurrentUser] = useState<ErpUser | null>(() => {
    const user = loadAuthUser();
    return user && getAuthToken() ? user : null;
  });
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  const handleLogin = useCallback(async () => {
    const id = loginId.trim();
    if (!id || !password) {
      setLoginError("???? ????? ??? ???.");
      return;
    }
    setLoggingIn(true);
    setLoginError("");
    try {
      const { user } = await loginWithApi(id, password);
      setCurrentUser(user);
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "???? ??????.");
    } finally {
      setLoggingIn(false);
    }
  }, [loginId, password]);

  const handleAction = useCallback((action: ErpChatAction) => {
    stashPendingChatAction(action);
    window.location.href = "/";
  }, []);

  if (!currentUser) {
    return (
      <div className="erp-chat-standalone-login flex min-h-[100dvh] items-center justify-center bg-slate-950 px-4 py-8 text-white">
        <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
          <h1 className="text-xl font-bold">TM ERP AI</h1>
          <p className="mt-2 text-sm text-slate-400">?? ??? ????? ??????.</p>
          <div className="mt-5 space-y-3">
            <input
              type="text"
              className="erp-chat-input w-full"
              placeholder="???"
              value={loginId}
              onChange={(event) => setLoginId(event.target.value)}
              autoComplete="username"
            />
            <input
              type="password"
              className="erp-chat-input w-full"
              placeholder="????"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              onKeyDown={(event) => {
                if (event.key === "Enter") void handleLogin();
              }}
            />
            {loginError ? <div className="erp-chat-error">{loginError}</div> : null}
            <button
              type="button"
              className="erp-chat-send w-full justify-center py-3"
              disabled={loggingIn}
              onClick={() => void handleLogin()}
            >
              {loggingIn ? "??? ?..." : "???"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="erp-chat-standalone flex min-h-[100dvh] flex-col bg-slate-950 text-white">
      <div className="erp-chat-standalone__top flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <div>
          <div className="text-sm font-bold">TM ERP AI</div>
          <div className="text-xs text-slate-400">???? ??? ?? ? ?? ?? ?????</div>
        </div>
        <a
          href="/"
          className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200"
        >
          ERP ??
          <ExternalLink size={14} />
        </a>
      </div>
      <div className="erp-chat-standalone__body min-h-0 flex-1">
        <ErpChatWidget
          currentUser={currentUser}
          enabled
          standalone
          defaultOpen
          autoStartVoice={autoVoice}
          onAction={handleAction}
        />
      </div>
    </div>
  );
}
