import React, { useEffect, useState } from "react";
import { Building2, ExternalLink, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  fetchBarobillBankManagementUrl,
  fetchBarobillBankScrapRequestUrl,
  fetchBarobillBankScrapStatus,
  fetchBarobillBankStatus,
  syncBarobillBankNow,
  type BarobillBankStatus,
} from "@/utils/barobillBankApi";

const L = {
  title: "\uBC14\uB85C\uBE4C \uACC4\uC88C\uB0B4\uC5ED \uC5F0\uB3D9",
  ready: "\uC0AC\uC6A9 \uAC00\uB2A5",
  notConfigured: "\uC11C\uBC84 \uC124\uC815 \uBD80\uC871",
  disabled: "\uC790\uB3D9 \uB3D9\uAE30\uD654 \uBE44\uD65C\uC131\uD654",
  syncNow: "\uC9C0\uAE08 \uAC00\uC838\uC624\uAE30",
  refreshBank: "\uC740\uD589 \uC218\uC9D1 \uC694\uCCAD",
  lastSync: "\uB9C8\uC9C0\uBAA9 \uB3D9\uAE30\uD654",
  lastError: "\uC624\uB958",
  scrapApply: "\uC11C\uBE44\uC2A4 \uC2E0\uCCAD",
  accountManage: "\uACC4\uC88C \uAD00\uB9AC",
  collecting: "\uBC14\uB85C\uBE4C\uC5D0\uC11C \uAC70\uB798\uB0B4\uC5ED\uC744 \uC218\uC9D1 \uC911\uC785\uB2C8\uB2E4. 1~3\uBD84 \uD6C4 \uB2E4\uC2DC \uAC00\uC838\uC624\uAE30\uB97C \uB20C\uB7EC \uC8FC\uC138\uC694.",
  allUpToDate: "\uC0C8 \uAC70\uB798 \uC5C6\uC74C",
  fetchedUpToDate: (fetched: number) => `\uC870\uD68C ${fetched}\uAC74 \u00B7 \uC774\uBBF8 \uBAA8\uB450 \uBC18\uC601\uB428`,
};

type MessageTone = "info" | "success" | "error";

function formatSyncResult(result: Awaited<ReturnType<typeof syncBarobillBankNow>>): { text: string; tone: MessageTone } {
  if (result.collecting || result.scrapStatus?.collecting) {
    return {
      text: result.notices?.[0] || result.scrapStatus?.message || L.collecting,
      tone: "info",
    };
  }
  if (!result.ok) {
    if (result.reason === "sync_in_progress") {
      return { text: "\uB3D9\uAE30\uD654\uAC00 \uC774\uBBF8 \uC9C4\uD589 \uC911\uC785\uB2C8\uB2E4.", tone: "info" };
    }
    return { text: result.error || "\uAC00\uC838\uC624\uAE30 \uC2E4\uD328", tone: "error" };
  }
  if (result.notices?.length && !result.added) {
    return { text: result.notices[0], tone: "info" };
  }
  if (result.added && result.added > 0) {
    return {
      text: `${result.added}\uAC74 \uCD94\uAC00 (${result.fetched ?? 0}\uAC74 \uC870\uD68C)`,
      tone: "success",
    };
  }
  if ((result.fetched ?? 0) > 0) {
    return { text: L.fetchedUpToDate(result.fetched ?? 0), tone: "success" };
  }
  return { text: L.allUpToDate, tone: "success" };
}

export function BarobillBankSettingsPanel({
  apiMode,
  isAdmin,
  onSyncBegin,
  onSynced,
}: {
  apiMode: boolean;
  isAdmin: boolean;
  onSyncBegin?: () => void;
  onSynced?: (result?: { version?: number }) => void | Promise<void>;
}) {
  const [status, setStatus] = useState<BarobillBankStatus | null>(null);
  const [scrapNeedsApply, setScrapNeedsApply] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<MessageTone>("success");

  const loadStatus = React.useCallback(async () => {
    if (!apiMode) return;
    try {
      const result = await fetchBarobillBankStatus();
      setStatus(result.status);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "\uC0C1\uD0DC \uC870\uD68C \uC2E4\uD328");
      setMessageTone("error");
    }
  }, [apiMode]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (!apiMode || !isAdmin) return;
    void fetchBarobillBankScrapStatus()
      .then((result) => setScrapNeedsApply(!result.active))
      .catch(() => setScrapNeedsApply(null));
  }, [apiMode, isAdmin]);

  if (!apiMode) return null;

  const runSync = async (refresh = false) => {
    setLoading(true);
    setMessage("");
    try {
      onSyncBegin?.();
      const result = await syncBarobillBankNow({ refresh });
      const formatted = formatSyncResult(result);
      setMessage(formatted.text);
      setMessageTone(formatted.tone);
      if (result.status) setStatus(result.status);
      if (result.ok) {
        await loadStatus();
        await onSynced?.({ version: result.version });
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "\uAC00\uC838\uC624\uAE30 \uC2E4\uD328");
      setMessageTone("error");
    } finally {
      setLoading(false);
    }
  };

  const openScrapUrl = async () => {
    setLoading(true);
    setMessage("");
    try {
      const result = await fetchBarobillBankScrapRequestUrl();
      window.open(result.url, "_blank", "noopener,noreferrer");
      setMessage("\uBC14\uB85C\uBE4C \uACC4\uC88C \uC870\uD68C \uC11C\uBE44\uC2A4 \uC2E0\uCCAD \uD398\uC774\uC9C0\uB97C \uC5F4\uC5C8\uC2B5\uB2C8\uB2E4.");
      setMessageTone("info");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "\uC2E0\uCCAD URL \uC870\uD68C \uC2E4\uD328");
      setMessageTone("error");
    } finally {
      setLoading(false);
    }
  };

  const openManageUrl = async () => {
    setLoading(true);
    setMessage("");
    try {
      const result = await fetchBarobillBankManagementUrl();
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "\uACC4\uC88C \uAD00\uB9AC URL \uC870\uD68C \uC2E4\uD328");
      setMessageTone("error");
    } finally {
      setLoading(false);
    }
  };

  const ready = Boolean(status?.configured);
  const metaParts: string[] = [];
  if (status?.bankAccountNum) metaParts.push(status.bankAccountNum);
  if (!status?.enabled) metaParts.push(L.disabled);
  if (status?.lastSuccessAt) {
    metaParts.push(
      `${L.lastSync}: ${new Date(status.lastSuccessAt).toLocaleString("ko-KR")}${status.lastAdded ? ` · +${status.lastAdded}\uAC74` : ""}`,
    );
  }
  if (status?.lastNotice) metaParts.push(status.lastNotice);
  if (status?.lastError) metaParts.push(`${L.lastError}: ${status.lastError}`);

  const messageClass =
    messageTone === "error"
      ? "text-red-600 font-semibold"
      : messageTone === "info"
        ? "text-amber-700 font-semibold"
        : "text-emerald-700 font-semibold";

  return (
    <div className="erp-bank-integration-strip">
      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-violet-900">
        <Building2 size={12} />
        {L.title}
      </span>
      <span
        className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
          ready ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"
        }`}
      >
        {ready ? L.ready : L.notConfigured}
      </span>
      {ready ? (
        <>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-6 rounded-md px-2 text-[11px]"
            disabled={loading}
            onClick={() => void runSync(false)}
          >
            <RefreshCw size={11} className={`mr-1 ${loading ? "animate-spin" : ""}`} />
            {L.syncNow}
          </Button>
          {isAdmin ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-6 rounded-md px-2 text-[11px]"
              disabled={loading}
              title="\uBC14\uB85C\uBE4C\uC5D0 \uC775\uC758 \uC218\uC9D1\uC744 \uC694\uCCAD\uD569\uB2C8\uB2E4. \uC218\uC9D1 \uC911\uC5D0\uB294 \uC794\uC2DC \uAE30\uB2E4\uD574 \uC8FC\uC138\uC694."
              onClick={() => void runSync(true)}
            >
              {L.refreshBank}
            </Button>
          ) : null}
        </>
      ) : null}
      {isAdmin && ready ? (
        <>
          {scrapNeedsApply ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-6 rounded-md px-2 text-[11px]"
              disabled={loading}
              onClick={() => void openScrapUrl()}
            >
              <ExternalLink size={11} className="mr-1" />
              {L.scrapApply}
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-6 rounded-md px-2 text-[11px]"
            disabled={loading}
            onClick={() => void openManageUrl()}
          >
            <ExternalLink size={11} className="mr-1" />
            {L.accountManage}
          </Button>
        </>
      ) : null}
      {message ? <span className={`w-full text-[10px] leading-snug ${messageClass}`}>{message}</span> : null}
      {metaParts.length ? (
        <span className="w-full text-[10px] leading-snug text-slate-500">{metaParts.join(" · ")}</span>
      ) : null}
    </div>
  );
}
