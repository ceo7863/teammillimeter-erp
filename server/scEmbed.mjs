import jwt from "jsonwebtoken";
import { config } from "./config.mjs";

const EMBED_TOKEN_TTL_SEC = 90;

export function isScEmbedConfigured() {
  return Boolean(String(config.sc.syncSecret || "").trim()) && Boolean(String(config.sc.apiBaseUrl || "").trim());
}

export function createScEmbedToken(user) {
  const secret = String(config.sc.syncSecret || "").trim();
  if (!secret) {
    throw new Error("SC embed is not configured (SC_SYNC_SECRET).");
  }
  const loginId = String(user?.loginId || "").trim();
  const name = String(user?.name || "").trim();
  if (!loginId && !name) {
    throw new Error("User identity is required for SC embed.");
  }
  return jwt.sign(
    {
      purpose: "sc-embed",
      loginId,
      name,
      erpRole: String(user?.role || "").trim(),
      erpUserId: user?.sub ?? user?.id ?? null,
    },
    secret,
    {
      expiresIn: EMBED_TOKEN_TTL_SEC,
      jwtid: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    },
  );
}

export function buildScEmbedEntryUrl(token) {
  const base = String(config.sc.apiBaseUrl || config.sc.sharePublicUrl || "").trim().replace(/\/$/, "");
  if (!base) {
    throw new Error("SC embed base URL is not configured.");
  }
  return `${base}/api/erp/embed-login?token=${encodeURIComponent(token)}`;
}

export function getScEmbedSessionForUser(user) {
  if (!config.sc.embedEnabled) {
    return { ok: false, status: 503, error: "SC ??? ???? ?????? ????." };
  }
  if (!isScEmbedConfigured()) {
    return { ok: false, status: 503, error: "SC ??(SYNC_SECRET)? ???? ?????." };
  }
  try {
    const token = createScEmbedToken(user);
    const url = buildScEmbedEntryUrl(token);
    return {
      ok: true,
      url,
      expiresInSec: EMBED_TOKEN_TTL_SEC,
      scBaseUrl: String(config.sc.apiBaseUrl || "").trim().replace(/\/$/, ""),
    };
  } catch (error) {
    return {
      ok: false,
      status: 500,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
