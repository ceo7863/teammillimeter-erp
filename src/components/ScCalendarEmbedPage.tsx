import React, { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, Menu, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTeamChatMobileLayout } from "@/hooks/useTeamChatMobileLayout";
import { fetchScEmbedSession } from "@/utils/scEmbed";
import { forwardWheelIntoIframe } from "@/utils/iframeWheelForward";

const L = {
  title: "SC \uCE98\uB9B0\uB354",
  loading: "SC \uCE98\uB9B0\uB354\uB97C \uBD88\uB7EC\uC624\uB294 \uC911\u2026",
  error: "SC \uCE98\uB9B0\uB354\uB97C \uC5F4 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.",
  retry: "\uB2E4\uC2DC \uC2DC\uB3C4",
  openTab: "\uC0C8 \uD0ED\uC5D0\uC11C \uC5F4\uAE30",
  hint: "SC \uC804\uCCB4 \uBA54\uB274(\uCE98\uB9B0\uB354\u00B7\uD504\uB85C\uC81D\uD2B8\u00B7\uC778\uC6D0 \uB4F1)\uB97C ERP \uC548\uC5D0\uC11C \uADF8\uB300\uB85C \uC0AC\uC6A9\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
};

type ScCalendarEmbedPageProps = {
  onOpenAppMenu?: () => void;
};

export function ScCalendarEmbedPage({ onOpenAppMenu }: ScCalendarEmbedPageProps) {
  const isMobileLayout = useTeamChatMobileLayout();
  const [embedUrl, setEmbedUrl] = useState("");
  const [scBaseUrl, setScBaseUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !embedUrl) return;

    const focusIframe = () => {
      iframe.contentWindow?.focus();
    };

    iframe.addEventListener("mouseenter", focusIframe);
    iframe.addEventListener("load", focusIframe);
    return () => {
      iframe.removeEventListener("mouseenter", focusIframe);
      iframe.removeEventListener("load", focusIframe);
    };
  }, [embedUrl]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !embedUrl) return;

    const onWheel = (event: WheelEvent) => {
      const iframe = iframeRef.current;
      if (!iframe) return;
      forwardWheelIntoIframe(iframe, event);
    };

    window.addEventListener("wheel", onWheel, { capture: true, passive: false });
    return () => window.removeEventListener("wheel", onWheel, { capture: true });
  }, [embedUrl]);

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
    <div className={`erp-sc-embed-page flex min-h-0 flex-1 flex-col ${isMobileLayout ? "erp-sc-embed-page--mobile" : ""}`}>
      <div className="erp-sc-embed-page__toolbar flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2 sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          {isMobileLayout && onOpenAppMenu ? (
            <button
              type="button"
              className="erp-touch-target shrink-0 rounded-xl border border-slate-200 p-2 text-slate-700"
              onClick={onOpenAppMenu}
              aria-label="메뉴 열기"
            >
              <Menu size={20} />
            </button>
          ) : null}
          <div className="min-w-0">
            <h1 className="truncate text-base font-bold text-slate-900">{L.title}</h1>
            {!isMobileLayout ? <p className="text-xs text-slate-500">{L.hint}</p> : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void loadSession()} disabled={loading}>
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            {!isMobileLayout ? L.retry : null}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={openInNewTab} disabled={!scBaseUrl && !embedUrl}>
            <ExternalLink size={14} />
            {!isMobileLayout ? L.openTab : null}
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
          ref={iframeRef}
          key={embedUrl}
          title={L.title}
          src={embedUrl}
          className="min-h-0 w-full flex-1 border-0 bg-white"
          tabIndex={0}
          allow="clipboard-read; clipboard-write"
          referrerPolicy="no-referrer"
        />
      )}
    </div>
  );
}
