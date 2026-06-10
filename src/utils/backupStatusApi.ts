import { apiRequest } from "@/utils/erpApi";

export type ErpBackupSnapshot = {
  date: string;
  dirPath: string;
  totalBytes: number;
  dbBytes: number | null;
  createdAt: string | null;
  retentionDays: number | null;
  folders: Record<string, { files: number; bytes: number }> | null;
};

export type ErpBackupStatus = {
  generatedAt: string;
  scheduleLabel: string;
  cronExpression: string;
  retainDays: number;
  logPath: string;
  logExists: boolean;
  logLines: string[];
  logTotalLines: number;
  backupDir: string;
  snapshots: ErpBackupSnapshot[];
};

export async function fetchErpBackupStatus(logTail = 100) {
  return apiRequest<{ status: ErpBackupStatus }>(`/admin/backup-status?logTail=${logTail}`);
}

export type ErpBackupRestoreResult = {
  date: string;
  snapshotDir: string;
  preRestoreDbPath: string;
  restoredAt: string;
};

export async function restoreErpBackupSnapshot(date: string) {
  return apiRequest<{ ok: true; result: ErpBackupRestoreResult }>("/admin/backup-restore", {
    method: "POST",
    body: JSON.stringify({ date }),
  });
}
