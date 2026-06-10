import { getErpState, saveErpDomains, getErpVersionMeta } from "./db.mjs";

const MAX_CHAT_AUDIT_LOGS = 500;

export function appendErpChatAuditLog(user, question, toolNames = []) {
  try {
    const state = getErpState(["settings"]);
    const data = state.data || {};
    const auditLogs = Array.isArray(data.auditLogs) ? [...data.auditLogs] : [];
    const nextId = auditLogs.reduce((max, row) => Math.max(max, Number(row?.id) || 0), 0) + 1;
    const toolsLabel = toolNames.length ? toolNames.join(", ") : "-";

    auditLogs.unshift({
      id: nextId,
      entityType: "erpChat",
      entityId: String(user?.sub || ""),
      entityLabel: String(user?.name || user?.loginId || "user"),
      field: "question",
      fieldLabel: "AI \uCC57\uBD07 \uC9C8\uBB38",
      before: "",
      after: String(question || "").slice(0, 500),
      action: "create",
      screen: `erpChat:${toolsLabel}`,
      userName: String(user?.name || ""),
      userEmail: String(user?.email || user?.loginId || ""),
      at: new Date().toISOString(),
    });

    while (auditLogs.length > MAX_CHAT_AUDIT_LOGS) auditLogs.pop();

    saveErpDomains(
      { settings: { auditLogs } },
      state.version,
      String(user?.loginId || user?.name || "erp-chat"),
    );
  } catch (error) {
    console.warn("[erp-chat] audit append skipped:", error instanceof Error ? error.message : error);
  }
}

export function readErpChatAuditFromSettings(limit = 100) {
  const state = getErpState(["settings"]);
  const auditLogs = Array.isArray(state.data?.auditLogs) ? state.data.auditLogs : [];
  return auditLogs
    .filter((row) => String(row?.entityType || "") === "erpChat")
    .slice(0, Math.min(Number(limit) || 100, 500));
}

export function getErpVersionForChat() {
  return getErpVersionMeta();
}
