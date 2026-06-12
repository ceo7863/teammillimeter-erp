import React, { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, Menu, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTeamChatMobileLayout } from "@/hooks/useTeamChatMobileLayout";
import { fetchScEmbedSession } from "@/utils/scEmbed";

const L = {
  title: "SC 스케줄",
  loading: "SC를 불러오는 중…",
  error: "SC를 열 수 없습니다.",
  retry: "다시 시도",
  openTab: "새 탭에서 열기",
  hint: "SC 전체 메뉴(캘린더·프로젝트·인원·알림 등)를 ERP 안에서 그대로 사용할 수 있습니다.",
};

const MIN_EMBED_SCALE = 0.5;

type EmbedLayout = {
  scale: number;
  viewportW: number;
  viewportH: number;
  visualW: number;
  visualH: number;
};

function computeEmbedLayout(frame: HTMLElement): EmbedLayout {
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;
  const availableW = frame.clientWidth;
  const availableH = frame.clientHeight;

  if (availableW <= 0 || availableH <= 0 || viewportW <= 0 || viewportH <= 0) {
    return { scale: 1, viewportW, viewportH, visualW: availableW, visualH: availableH };
  }

  const scale = Math.max(
    MIN_EMBED_SCALE,
    Math.min(1, availableW / viewportW, availableH / viewportH),
  );

  return {
    scale,
    viewportW,
    viewportH,
    visualW: viewportW * scale,
    visualH: viewportH * scale,
  };
}

type ScCalendarEmbedPageProps = {
  onOpenAppMenu?: () => void;
};

export function ScCalendarEmbedPage({ onOpenAppMenu }: ScCalendarEmbedPageProps) {
  const isMobileLayout = useTeamChatMobileLayout();
  const [embedUrl, setEmbedUrl] = useState("");
  const [scBaseUrl, setScBaseUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [layout, setLayout] = useState<EmbedLayout>(() => ({
    scale: 1,
    viewportW: typeof window !== "undefined" ? window.innerWidth : 1280,
    viewportH: typeof window !== "undefined" ? window.innerHeight : 800,
    visualW: 0,
    visualH: 0,
  }));
  const frameRef = useRef<HTMLDivElement>(null);
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
    if (!embedUrl) return;

    const updateLayout = () => {
      const frame = frameRef.current;
      if (!frame) return;
      setLayout(computeEmbedLayout(frame));
    };

    updateLayout();
    const raf = window.requestAnimationFrame(updateLayout);
    const frame = frameRef.current;
    const observer = frame ? new ResizeObserver(updateLayout) : null;
    if (frame && observer) observer.observe(frame);
    window.addEventListener("resize", updateLayout);

    return () => {
      window.cancelAnimationFrame(raf);
      observer?.disconnect();
      window.removeEventListener("resize", updateLayout);
    };
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
        <div ref={frameRef} className="erp-sc-embed-page__frame">
          <div
            className="erp-sc-embed-page__viewport"
            style={{
              width: layout.visualW > 0 ? `${layout.visualW}px` : "100%",
              height: layout.visualH > 0 ? `${layout.visualH}px` : "100%",
            }}
          >
            <iframe
              ref={iframeRef}
              key={embedUrl}
              title={L.title}
              src={embedUrl}
              className="erp-sc-embed-page__iframe border-0 bg-white"
              style={{
                width: `${layout.viewportW}px`,
                height: `${layout.viewportH}px`,
                transform: layout.scale < 1 ? `scale(${layout.scale})` : undefined,
                transformOrigin: "top left",
              }}
              tabIndex={0}
              allow="clipboard-read; clipboard-write"
              referrerPolicy="no-referrer"
            />
          </div>
        </div>
      )}
    </div>
  );
}
