import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest, isApiModeEnabled } from "@/utils/erpApi";

declare const __ERP_CLIENT_VERSION__: string | undefined;

const RELOAD_ONCE_KEY = "erp-deploy-version-reload-once";
const POLL_MS = 60_000;

export function getClientDeployVersion() {
  try {
    if (typeof __ERP_CLIENT_VERSION__ === "string" && __ERP_CLIENT_VERSION__.trim()) {
      return __ERP_CLIENT_VERSION__.trim();
    }
  } catch {
    // ignore
  }
  return "dev";
}

export async function fetchServerDeployVersion(): Promise<string | null> {
  if (!isApiModeEnabled()) return getClientDeployVersion();
  try {
    const data = await apiRequest<{ version?: string }>("/api/deploy-version");
    const version = String(data?.version || "").trim();
    return version || null;
  } catch {
    return null;
  }
}

export function hasErpUnsavedDraft() {
  if (typeof document === "undefined") return false;
  if (document.querySelector("[data-erp-unsaved='1']")) return true;
  const active = document.activeElement as HTMLElement | null;
  if (!active) return false;
  const tag = active.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || active.isContentEditable) {
    const value = "value" in active ? String((active as HTMLInputElement).value || "") : "";
    const initial = active.getAttribute("data-initial-value");
    if (initial != null && value !== initial) return true;
  }
  return false;
}

export function assertFinancialSaveAllowed(options: {
  clientVersion?: string;
  serverVersion?: string | null;
} = {}) {
  const client = options.clientVersion || getClientDeployVersion();
  const server = options.serverVersion;
  if (!server || !client || client === "dev") return { ok: true as const };
  if (client === server) return { ok: true as const };
  return {
    ok: false as const,
    message:
      "\uC0C8 \uBC84\uC804\uC774 \uBC30\uD3EC\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uAE08\uC735 \uC800\uC7A5 \uC804\uC5D0 '\uC0C8 \uBC84\uC804 \uC801\uC6A9'\uC744 \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.",
  };
}

/** Pure policy for "새 버전 적용" — never auto-reload with unsaved drafts; block same-version loop. */
export function planApplyNewVersion(options: {
  hasUnsavedDraft: boolean;
  serverVersion: string | null | undefined;
  lastReloadVersion: string | null | undefined;
}) {
  if (options.hasUnsavedDraft) {
    return { action: "block_unsaved" as const };
  }
  const server = String(options.serverVersion || "").trim();
  if (!server) return { action: "noop" as const };
  if (String(options.lastReloadVersion || "") === server) {
    return { action: "block_reload_loop" as const };
  }
  return { action: "reload" as const, serverVersion: server };
}

export function useDeployVersionGuard() {
  const clientVersion = getClientDeployVersion();
  const [serverVersion, setServerVersion] = useState<string | null>(null);
  const [mismatch, setMismatch] = useState(false);
  const [bannerVisible, setBannerVisible] = useState(false);
  const checkingRef = useRef(false);

  const refresh = useCallback(async () => {
    if (checkingRef.current) return;
    checkingRef.current = true;
    try {
      const remote = await fetchServerDeployVersion();
      setServerVersion(remote);
      const isMismatch = Boolean(remote && clientVersion && clientVersion !== "dev" && remote !== clientVersion);
      setMismatch(isMismatch);
      setBannerVisible(isMismatch);
    } finally {
      checkingRef.current = false;
    }
  }, [clientVersion]);

  useEffect(() => {
    void refresh();
    const onFocus = () => void refresh();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    const timer = window.setInterval(() => void refresh(), POLL_MS);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(timer);
    };
  }, [refresh]);

  const applyNewVersion = useCallback(() => {
    const plan = planApplyNewVersion({
      hasUnsavedDraft: hasErpUnsavedDraft(),
      serverVersion,
      lastReloadVersion: sessionStorage.getItem(RELOAD_ONCE_KEY),
    });
    if (plan.action === "block_unsaved") {
      window.alert(
        "\uBBF8\uC800\uC7A5 \uC785\uB825\uC774 \uC788\uC5B4 \uC790\uB3D9 \uC0C8\uB85C\uACE0\uCE68\uC744 \uC27D\uC2B5\uB2C8\uB2E4. \uC800\uC7A5 \uD6C4 '\uC0C8 \uBC84\uC804 \uC801\uC6A9'\uC744 \uB2E4\uC2DC \uB20C\uB7EC \uC8FC\uC138\uC694.",
      );
      return;
    }
    if (plan.action !== "reload") {
      setBannerVisible(true);
      return;
    }
    sessionStorage.setItem(RELOAD_ONCE_KEY, plan.serverVersion);
    window.location.reload();
  }, [serverVersion]);

  const guardFinancialSave = useCallback(() => {
    return assertFinancialSaveAllowed({ clientVersion, serverVersion });
  }, [clientVersion, serverVersion]);

  return {
    clientVersion,
    serverVersion,
    mismatch,
    bannerVisible,
    applyNewVersion,
    dismissBanner: () => setBannerVisible(false),
    refresh,
    guardFinancialSave,
  };
}
