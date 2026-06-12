export const WORKER_PORTAL_STANDALONE_PATH = "/worker-portal";

export function isWorkerPortalStandaloneRoute() {
  if (typeof window === "undefined") return false;
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  return path.toLowerCase() === WORKER_PORTAL_STANDALONE_PATH;
}

export function buildWorkerPortalLoginUrl(origin = typeof window !== "undefined" ? window.location.origin : "") {
  return `${origin.replace(/\/$/, "")}${WORKER_PORTAL_STANDALONE_PATH}`;
}
