import React, { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, Menu, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTeamChatMobileLayout } from "@/hooks/useTeamChatMobileLayout";
import { fetchScEmbedSession } from "@/utils/scEmbed";

const MIN_SCALE = 0.5;

type ScEmbedPageProps = {
  onOpenAppMenu?: () => void;
};

type EmbedLayout = {
  scale: number;
  viewportW: number;
  viewportH: number;
};

function measureEmbedLayout(container: HTMLElement): EmbedLayout {
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;
  const { clientWidth, clientHeight } = container;

  if (!clientWidth || !clientHeight || !viewportW || !viewportH) {
    return { scale: 1, viewportW, viewportH };
  }

  const scale = Math.max(
    MIN_SCALE,
    Math.min(1, clientWidth / viewportW, clientHeight / viewportH),
  );

  return { scale, viewportW, viewportH };
}

export function ScEmbedPage({ onOpenAppMenu }: ScEmbedPageProps) {
  const isMobileLayout = useTeamChatMobileLayout();
  const [embedUrl, setEmbedUrl] = useState("");
  const [externalBaseUrl, setExternalBaseUrl] = useState("");
  const [provider, setProvider] = useState<"calwalk" | "sc">("calwalk");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [layout, setLayout] = useState<EmbedLayout>({
    scale: 1,
    viewportW: 1280,
    viewportH: 800,
  });
  const frameRef = useRef<HTMLDivElement>(null);

  const loadSession = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const session = await fetchScEmbedSession();
      setEmbedUrl(String(session.url || "").trim());
      const base =
        String(session.calwalkBaseUrl || session.scBaseUrl || "").trim() ||
        (session.provider === "calwalk" ? "https://calwalk.com" : "");
      setExternalBaseUrl(base);
      setProvider(session.provider === "sc" ? "sc" : "calwalk");
    } catch (err) {
      setEmbedUrl("");
      setError(err instanceof Error ? err.message : "CalWalk를 열 수 없습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  useEffect(() => {
    if (!embedUrl) return;

    const updateLayout = () => {
      const frame = frameRef.current;
      if (!frame) return;
      setLayout(measureEmbedLayout(frame));
    };

    updateLayout();
    const observer = frameRef.current ? new ResizeObserver(updateLayout) : null;
    if (frameRef.current && observer) observer.observe(frameRef.current);
    window.addEventListener("resize", updateLayout);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateLayout);
    };
  }, [embedUrl]);

  const openInNewTab = () => {
    const url = provider === "calwalk" ? embedUrl || externalBaseUrl : externalBaseUrl || embedUrl;
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const isCalwalk = provider === "calwalk";
  const pageTitle = isCalwalk ? "CalWalk 워크스페이스" : "SC 스케줄";
  const pageHint = isCalwalk
    ? "팀 달력 · 방장·부방장 자동 로그인"
    : "SC 전체 메뉴 · 화면 비율 자동 맞춤";
  const frameTitle = isCalwalk ? "CalWalk 워크스페이스" : "SC 스케줄";

  const { scale, viewportW, viewportH } = layout;

  return (
    <div className="erp-sc-embed flex min-h-0 flex-1 flex-col">
      <header className="erp-sc-embed__header flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2 sm:px-4">
        <div className="flex min-w-0 items-center gap-2">
          {isMobileLayout && onOpenAppMenu ? (
            <button
              type="button"
              className="erp-touch-target shrink-0 rounded-xl border border-slate-200 p-2 text-slate-700"
              onClick={onOpenAppMenu}
              aria-label="ERP 메뉴 열기"
            >
              <Menu size={20} />
            </button>
          ) : null}
          <div className="min-w-0">
            <h1 className="truncate text-base font-bold text-slate-900">{pageTitle}</h1>
            <p className="text-xs text-slate-500">{pageHint}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void loadSession()} disabled={loading}>
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            <span className="hidden sm:inline">새로고침</span>
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={openInNewTab} disabled={!externalBaseUrl && !embedUrl}>
            <ExternalLink size={14} />
            <span className="hidden sm:inline">새 탭</span>
          </Button>
        </div>
      </header>

      {loading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
          {isCalwalk ? "CalWalk를 불러오는 중…" : "SC를 불러오는 중…"}
        </div>
      ) : error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
          <p className="text-sm font-medium text-red-600">{error}</p>
          <Button type="button" onClick={() => void loadSession()}>
            다시 시도
          </Button>
        </div>
      ) : (
        <div ref={frameRef} className="erp-sc-embed__frame min-h-0 flex-1 overflow-hidden">
          <div
            className="overflow-hidden"
            style={{
              width: viewportW * scale,
              height: viewportH * scale,
            }}
          >
            <iframe
              title={frameTitle}
              src={embedUrl}
              className="block border-0 bg-white"
              style={{
                width: viewportW,
                height: viewportH,
                transform: scale < 1 ? `scale(${scale})` : undefined,
                transformOrigin: "top left",
              }}
              referrerPolicy="no-referrer"
              allow="clipboard-read; clipboard-write"
            />
          </div>
        </div>
      )}
    </div>
  );
}
