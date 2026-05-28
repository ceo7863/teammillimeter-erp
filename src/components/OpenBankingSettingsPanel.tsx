import React, { useEffect, useState } from "react";
import { Link2, Unplug, RefreshCw, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  connectOpenBankingManual,
  disconnectOpenBanking,
  fetchOpenBankingAuthorizeUrl,
  fetchOpenBankingStatus,
  syncOpenBankingNow,
  type OpenBankingStatus,
} from "@/utils/openBankingApi";

const L = {
  title: "IBK \uC624\uD508\uB1F9\uD0B9 \uC5F0\uB3D9",
  desc: "\uAE08\uC735\uACB0\uC81C\uC6D0 \uC624\uD508\uB1F9\uD0B9 API\uB85C IBK \uD1B5\uC7A5 \uAC70\uB798\uB0B4\uC5ED\uC744 \uC790\uB3D9 \uAC00\uC838\uC635\uB2C8\uB2E4.",
  connected: "\uC5F0\uB3D9\uB428",
  disconnected: "\uBBF8\uC5F0\uB3D9",
  notConfigured: "\uC11C\uBC84\uC5D0 Client ID/Secret \uC774 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.",
  fintechUseNum: "\uD540\uD14C\uD06C\uC774\uC6A9\uBC88\uD638 (24\uC790\uB9AC)",
  accessToken: "Access Token",
  refreshToken: "Refresh Token",
  accountMask: "\uACC4\uC88C \uD45C\uC2DC\uBA85 (\uC120\uD0DD)",
  connect: "\uC5F0\uB3D9 \uC800\uC7A5",
  disconnect: "\uC5F0\uB3D9 \uD574\uC81C",
  oauth: "\uC624\uD508\uB1F9\uD0B9 \uC778\uC99D \uD398\uC774\uC9C0",
  syncNow: "API \uC9C0\uAE08 \uAC00\uC838\uC624\uAE30",
  lastSync: "\uB9C8\uC9C0\uBAA9 \uB3D9\uAE30\uD654",
  lastError: "\uC624\uB958",
  hint: "\uAE08\uC735\uACB0\uC81C\uC6D0\u00B7IBK \uC624\uD508API \uAC00\uC785 \uD6C4 \uD14C\uC2A4\uD2B8\uBCA0\uB4DC \uD0A4\uB97C .env\uC5D0 \uB123\uACE0, \uACC4\uC88C\uB4F1\uB85D \uD6C4 \uD540\uD14C\uD06C\uC774\uC6A9\uBC88\uD638\uB97C \uC785\uB825\uD558\uC138\uC694.",
};

export function OpenBankingSettingsPanel({
  apiMode,
  isAdmin,
  onSynced,
}: {
  apiMode: boolean;
  isAdmin: boolean;
  onSynced?: () => void | Promise<void>;
}) {
  const [status, setStatus] = useState<OpenBankingStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [fintechUseNum, setFintechUseNum] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [accountMask, setAccountMask] = useState("");

  const loadStatus = React.useCallback(async () => {
    if (!apiMode) return;
    try {
      const result = await fetchOpenBankingStatus();
      setStatus(result.status);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "\uC0C1\uD0DC \uC870\uD68C \uC2E4\uD328");
    }
  }, [apiMode]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  if (!apiMode) return null;

  const handleConnect = async () => {
    setLoading(true);
    setMessage("");
    try {
      const result = await connectOpenBankingManual({
        fintechUseNum,
        accessToken,
        refreshToken,
        accountMask,
      });
      if (!result.ok) {
        setMessage(result.error || "\uC5F0\uB3D9 \uC800\uC7A5 \uC2E4\uD328");
        return;
      }
      setStatus(result.status);
      setMessage("\uC624\uD508\uB1F9\uD0B9 \uC5F0\uB3D9\uC774 \uC800\uC7A5\uB418\uC5C8\uC2B5\uB2C8\uB2E4.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "\uC5F0\uB3D9 \uC800\uC7A5 \uC2E4\uD328");
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = async () => {
    setLoading(true);
    setMessage("");
    try {
      const result = await fetchOpenBankingAuthorizeUrl();
      window.open(result.url, "_blank", "noopener,noreferrer");
      setMessage("\uC778\uC99D \uCC3D\uC5D0\uC11C \uACC4\uC88C\uB4F1\uB85D \uD6C4, \uBC1C\uAE09 \uBC1B\uC740 \uD1A0\uD06C\uC744 \uC544\uB798\uC5D0 \uC785\uB825\uD558\uC138\uC694.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "\uC778\uC99D URL \uC0DD\uC131 \uC2E4\uD328");
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setLoading(true);
    setMessage("");
    try {
      const result = await syncOpenBankingNow();
      if (!result.ok) {
        setMessage(result.error || "\uAC00\uC838\uC624\uAE30 \uC2E4\uD328");
        return;
      }
      setMessage(
        result.added && result.added > 0
          ? `${result.added}\uAC74 \uCD94\uAC00 (${result.fetched ?? 0}\uAC74 \uC870\uD68C)`
          : "\uC0C8 \uAC70\uB798 \uC5C6\uC74C",
      );
      await loadStatus();
      await onSynced?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "\uAC00\uC838\uC624\uAE30 \uC2E4\uD328");
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm("\uC624\uD508\uB1F9\uD0B9 \uC5F0\uB3D9\uC744 \uD574\uC81C\uD560\uAE4C\uC694?")) return;
    setLoading(true);
    try {
      const result = await disconnectOpenBanking();
      setStatus(result.status);
      setFintechUseNum("");
      setAccessToken("");
      setRefreshToken("");
      setMessage("\uC5F0\uB3D9\uC774 \uD574\uC81C\uB418\uC5C8\uC2B5\uB2C8\uB2E4.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "\uD574\uC81C \uC2E4\uD328");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-3 rounded-2xl border border-indigo-100 bg-indigo-50/60 px-3 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 text-xs font-bold text-indigo-900">
          <Link2 size={14} />
          {L.title}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
            status?.connected ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"
          }`}
        >
          {status?.connected ? L.connected : L.disconnected}
        </span>
        {status?.connected ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 rounded-lg px-2 text-xs"
            disabled={loading}
            onClick={() => void handleSync()}
          >
            <RefreshCw size={12} className={`mr-1 ${loading ? "animate-spin" : ""}`} />
            {L.syncNow}
          </Button>
        ) : null}
      </div>
      <p className="mt-1 text-xs text-slate-600">{L.desc}</p>
      {status && !status.configured ? (
        <p className="mt-1 text-xs font-semibold text-amber-700">{L.notConfigured}</p>
      ) : null}
      {status?.lastSyncAt ? (
        <p className="mt-1 text-xs text-slate-500">
          {L.lastSync}: {new Date(status.lastSyncAt).toLocaleString("ko-KR")}
          {status.lastSyncAdded ? ` \u00B7 +${status.lastSyncAdded}\uAC74` : ""}
        </p>
      ) : null}
      {status?.lastError ? (
        <p className="mt-1 text-xs font-semibold text-red-600">
          {L.lastError}: {status.lastError}
        </p>
      ) : null}
      {message ? <p className="mt-1 text-xs font-semibold text-emerald-700">{message}</p> : null}

      {isAdmin && status?.configured ? (
        <div className="mt-3 space-y-2 border-t border-indigo-100 pt-3">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 rounded-lg text-xs"
              disabled={loading}
              onClick={() => void handleOAuth()}
            >
              <ExternalLink size={12} className="mr-1" />
              {L.oauth}
            </Button>
            {status.connected ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 rounded-lg text-xs text-red-700"
                disabled={loading}
                onClick={() => void handleDisconnect()}
              >
                <Unplug size={12} className="mr-1" />
                {L.disconnect}
              </Button>
            ) : null}
          </div>
          <input
            className="erp-input w-full rounded-xl text-xs"
            placeholder={L.fintechUseNum}
            value={fintechUseNum}
            onChange={(event) => setFintechUseNum(event.target.value.replace(/\D/g, "").slice(0, 24))}
          />
          <input
            className="erp-input w-full rounded-xl text-xs"
            placeholder={L.accessToken}
            value={accessToken}
            onChange={(event) => setAccessToken(event.target.value)}
          />
          <input
            className="erp-input w-full rounded-xl text-xs"
            placeholder={L.refreshToken}
            value={refreshToken}
            onChange={(event) => setRefreshToken(event.target.value)}
          />
          <input
            className="erp-input w-full rounded-xl text-xs"
            placeholder={L.accountMask}
            value={accountMask}
            onChange={(event) => setAccountMask(event.target.value)}
          />
          <Button type="button" size="sm" className="rounded-lg text-xs" disabled={loading} onClick={() => void handleConnect()}>
            {L.connect}
          </Button>
          <p className="text-[11px] text-slate-500">{L.hint}</p>
        </div>
      ) : null}
    </div>
  );
}
