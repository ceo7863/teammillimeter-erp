import jwt from "jsonwebtoken";
import { config } from "./config.mjs";

const EMBED_TOKEN_TTL_SEC = 90;

export function isCalwalkEmbedConfigured() {
  const base = String(config.calwalk?.apiBaseUrl || "").trim();
  const secret = String(config.calwalk?.exportSecret || "").trim();
  const workspace = String(config.calwalk?.workspaceSlug || "").trim();
  return Boolean(base && secret && workspace);
}

export function createCalwalkEmbedToken(user) {
  const secret = String(config.calwalk?.exportSecret || "").trim();
  if (!secret) {
    throw new Error("CalWalk embed is not configured (CALWALK_ERP_EXPORT_SECRET).");
  }
  const loginId = String(user?.loginId || "").trim();
  const email = String(user?.email || "").trim();
  const name = String(user?.name || "").trim();
  if (!loginId && !email && !name) {
    throw new Error("User identity is required for CalWalk embed.");
  }
  return jwt.sign(
    {
      purpose: "calwalk-embed",
      loginId,
      email,
      name,
      erpRole: String(user?.role || "").trim(),
      erpUserId: user?.sub ?? user?.id ?? null,
      workspace: String(config.calwalk?.workspaceSlug || "").trim(),
    },
    secret,
    {
      expiresIn: EMBED_TOKEN_TTL_SEC,
      jwtid: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    },
  );
}

export function buildCalwalkEmbedEntryUrl(token) {
  const base = String(config.calwalk?.apiBaseUrl || "").trim().replace(/\/$/, "");
  const workspace = String(config.calwalk?.workspaceSlug || "").trim();
  if (!base) {
    throw new Error("CalWalk embed base URL is not configured.");
  }
  const params = new URLSearchParams({
    token,
    workspace,
  });
  return `${base}/api/integrations/erp/embed-login?${params.toString()}`;
}

export function getCalwalkEmbedSessionForUser(user) {
  if (config.calwalk?.embedEnabled === false) {
    return { ok: false, status: 503, error: "CalWalk 임베드가 비활성화되어 있습니다." };
  }
  if (!isCalwalkEmbedConfigured()) {
    return {
      ok: false,
      status: 503,
      error: "CalWalk 연동(CALWALK_ERP_EXPORT_SECRET·워크스페이스)이 설정되지 않았습니다.",
    };
  }
  try {
    const token = createCalwalkEmbedToken(user);
    const url = buildCalwalkEmbedEntryUrl(token);
    const base = String(config.calwalk?.apiBaseUrl || "").trim().replace(/\/$/, "");
    const workspace = String(config.calwalk?.workspaceSlug || "").trim();
    return {
      ok: true,
      url,
      expiresInSec: EMBED_TOKEN_TTL_SEC,
      calwalkBaseUrl: base,
      workspaceSlug: workspace,
      provider: "calwalk",
    };
  } catch (error) {
    return {
      ok: false,
      status: 500,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
