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
  lastSync: "\uB9C8\uC9C0\uBAA9 \uB3D9\uAE30\uD654",
  lastError: "\uC624\uB958",
  scrapApply: "\uC11C\uBE44\uC2A4 \uC2E0\uCCAD",
  accountManage: "\uACC4\uC88C \uAD00\uB9AC",
};

export function BarobillBankSettingsPanel({
  apiMode,
  isAdmin,
  onSynced,
}: {
  apiMode: boolean;
  isAdmin: boolean;
  onSynced?: () => void | Promise<void>;
}) {
  const [status, setStatus] = useState<BarobillBankStatus | null>(null);
  const [scrapNeedsApply, setScrapNeedsApply] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const loadStatus = React.useCallback(async () => {
    if (!apiMode) return;
    try {
      const result = await fetchBarobillBankStatus();
      setStatus(result.status);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "\uC0C1\uD0DC \uC870\uD68C \uC2E4\uD328");
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

  const handleSync = async () => {
    setLoading(true);
    setMessage("");
    try {
      const result = await syncBarobillBankNow();
      if (!result.ok) {
        setMessage(result.error || "\uAC00\uC838\uC624\uAE30 \uC2E4\uD328");
        return;
      }
      setMessage(
        result.added && result.added > 0
          ? `${result.added}\uAC74 \uCD94\uAC00 (${result.fetched ?? 0}\uAC74 \uC870\uD68C)`
          : "\uC0C8 \uAC70\uB798 \uC5C6\uC74C",
      );
      if (result.status) setStatus(result.status);
      await loadStatus();
      await onSynced?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "\uAC00\uC838\uC624\uAE30 \uC2E4\uD328");
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
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "\uC2E0\uCCAD URL \uC870\uD68C \uC2E4\uD328");
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
  if (status?.lastError) metaParts.push(`${L.lastError}: ${status.lastError}`);
  if (message) metaParts.push(message);

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
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-6 rounded-md px-2 text-[11px]"
          disabled={loading}
          onClick={() => void handleSync()}
        >
          <RefreshCw size={11} className={`mr-1 ${loading ? "animate-spin" : ""}`} />
          {L.syncNow}
        </Button>
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
      {metaParts.length ? (
        <span className="w-full text-[10px] leading-snug text-slate-500">{metaParts.join(" · ")}</span>
      ) : null}
    </div>
  );
}
