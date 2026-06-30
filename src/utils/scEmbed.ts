import { apiRequest, isApiModeEnabled } from "@/utils/erpApi";

export type ScEmbedSession = {
  url: string;
  expiresInSec: number;
  scBaseUrl: string;
  calwalkBaseUrl?: string;
  workspaceSlug?: string;
  provider?: "calwalk" | "sc" | string;
};

export async function fetchScEmbedSession(): Promise<ScEmbedSession> {
  if (!isApiModeEnabled()) {
    throw new Error("SC ??? ???? API ????? ??? ? ????.");
  }
  return apiRequest<ScEmbedSession>("/sc-embed/session");
}
