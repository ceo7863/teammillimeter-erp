import React, { useCallback, useEffect, useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchScEmbedSession } from "@/utils/scEmbed";

const L = {
  title: "SC \uCE98\uB9B0\uB354",
  loading: "SC \uCE98\uB9B0\uB354\uB97C \uBD88\uB7EC\uC624\uB294 \uC911\u2026",
  error: "SC \uCE98\uB9B0\uB354\uB97C \uC5F4 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.",
  retry: "\uB2E4\uC2DC \uC2DC\uB3C4",
  openTab: "\uC0C8 \uD0ED\uC5D0\uC11C \uC5F4\uAE30",
  hint: "SC \uC804\uCCB4 \uBA54\uB274(\uCE98\uB9B0\uB354\u00B7\uD504\uB85C\uC81D\uD2B8\u00B7\uC778\uC6D0 \uB4F1)\uB97C ERP \uC548\uC5D0\uC11C \uADF8\uB300\uB85C \uC0AC\uC6A9\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
};

export function ScCalendarEmbedPage() {
  const [embedUrl, setEmbedUrl] = useState("");
  const [scBaseUrl, setScBaseUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadSession = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const session = await fetchScEmbedSession();
      setEmbedUrl(String(session.url || "").trim());
      setScBaseUrl(String(session.scBaseUrl || "").trim());
    } catch (err) {
      setEmbedUrl("");
      setError(err instanceof Error ? err.message : L.error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  const openInNewTab = () => {
    const url = scBaseUrl || embedUrl;
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="erp-sc-embed-page flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-2">
        <div>
          <h1 className="text-base font-bold text-slate-900">{L.title}</h1>
          <p className="text-xs text-slate-500">{L.hint}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void loadSession()} disabled={loading}>
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            {L.retry}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={openInNewTab} disabled={!scBaseUrl && !embedUrl}>
            <ExternalLink size={14} />
            {L.openTab}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-slate-500">{L.loading}</div>
      ) : error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
          <p className="text-sm font-medium text-red-600">{error}</p>
          <Button type="button" onClick={() => void loadSession()}>
            {L.retry}
          </Button>
        </div>
      ) : (
        <iframe
          key={embedUrl}
          title={L.title}
          src={embedUrl}
          className="min-h-0 w-full flex-1 border-0 bg-white"
          allow="clipboard-read; clipboard-write"
          referrerPolicy="no-referrer"
        />
      )}
    </div>
  );
}
