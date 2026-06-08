import React, { createContext, useCallback, useContext, useMemo, useRef } from "react";
import {
  appendAuditLogs,
  buildAuditEntries,
  buildSummaryAuditEntry,
  diffAuditRecords,
  getAuditHistory,
  getLatestAuditEntry,
  type AuditAction,
  type AuditFieldDef,
  type AuditLogEntry,
  type AuditUser,
} from "@/utils/auditLog";

type RecordAuditInput = {
  entityType: string;
  entityId: string | number;
  entityLabel: string;
  screen: string;
  action: AuditAction;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  fields: AuditFieldDef[];
  user?: AuditUser;
};

type AuditContextValue = {
  auditLogs: AuditLogEntry[];
  recordAudit: (input: RecordAuditInput) => void;
  recordAuditEntries: (entries: AuditLogEntry[]) => void;
  recordSummaryAudit: (input: {
    entityType: string;
    entityId: string | number;
    entityLabel: string;
    screen: string;
    action: AuditAction;
    fieldLabel: string;
    before?: string;
    after: string;
    user?: AuditUser;
  }) => void;
  getFieldHistory: (entityType: string, entityId: string | number, field: string) => AuditLogEntry[];
  getLatestFieldAudit: (entityType: string, entityId: string | number, field: string) => AuditLogEntry | null;
  getEntityHistory: (entityType: string, entityId: string | number) => AuditLogEntry[];
};

const AuditContext = createContext<AuditContextValue | null>(null);

export function AuditProvider({
  auditLogs,
  setAuditLogs,
  currentUser,
  children,
}: {
  auditLogs: AuditLogEntry[];
  setAuditLogs: React.Dispatch<React.SetStateAction<AuditLogEntry[]>>;
  currentUser: AuditUser;
  children: React.ReactNode;
}) {
  const auditLogsRef = useRef(auditLogs);
  auditLogsRef.current = auditLogs;
  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;

  const recordAuditEntries = useCallback(
    (entries: AuditLogEntry[]) => {
      if (!entries.length) return;
      setAuditLogs((prev) => appendAuditLogs(prev, entries));
    },
    [setAuditLogs],
  );

  const recordAudit = useCallback(
    (input: RecordAuditInput) => {
      const before = input.before || {};
      const after = input.after || {};
      const changes =
        input.action === "create"
          ? diffAuditRecords({}, after, input.fields)
          : input.action === "delete"
            ? diffAuditRecords(before, {}, input.fields)
            : diffAuditRecords(before, after, input.fields);

      if (!changes.length) return;

      const entries = buildAuditEntries({
        entityType: input.entityType,
        entityId: input.entityId,
        entityLabel: input.entityLabel,
        screen: input.screen,
        user: input.user ?? currentUserRef.current,
        action: input.action,
        changes,
      });

      recordAuditEntries(entries);
    },
    [recordAuditEntries],
  );

  const recordSummaryAudit = useCallback(
    (input: {
      entityType: string;
      entityId: string | number;
      entityLabel: string;
      screen: string;
      action: AuditAction;
      fieldLabel: string;
      before?: string;
      after: string;
      user?: AuditUser;
    }) => {
      recordAuditEntries(buildSummaryAuditEntry(input));
    },
    [recordAuditEntries],
  );

  const value = useMemo(
    () => ({
      get auditLogs() {
        return auditLogsRef.current;
      },
      recordAudit,
      recordAuditEntries,
      recordSummaryAudit,
      getFieldHistory: (entityType: string, entityId: string | number, field: string) =>
        getAuditHistory(auditLogsRef.current, { entityType, entityId, field }),
      getLatestFieldAudit: (entityType: string, entityId: string | number, field: string) =>
        getLatestAuditEntry(auditLogsRef.current, { entityType, entityId, field }),
      getEntityHistory: (entityType: string, entityId: string | number) =>
        getAuditHistory(auditLogsRef.current, { entityType, entityId }),
    }),
    [recordAudit, recordAuditEntries, recordSummaryAudit],
  );

  return <AuditContext.Provider value={value}>{children}</AuditContext.Provider>;
}

export function useAudit() {
  const context = useContext(AuditContext);
  if (!context) {
    throw new Error("useAudit must be used within AuditProvider");
  }
  return context;
}
