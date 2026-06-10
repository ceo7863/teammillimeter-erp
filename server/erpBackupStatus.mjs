import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BACKUP_LOG_PATH = path.join(rootDir, "logs", "erp-backup.log");
const BACKUP_DIR = path.join(rootDir, "data", "backups");
const DAILY_DIR = path.join(BACKUP_DIR, "daily");
const DEFAULT_RETAIN_DAYS = Number(process.env.ERP_BACKUP_RETAIN_DAYS || 7);

function directorySizeSync(dirPath) {
  let total = 0;
  const stack = [dirPath];
  while (stack.length) {
    const current = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      try {
        if (entry.isDirectory()) stack.push(entryPath);
        else if (entry.isFile()) total += fs.statSync(entryPath).size;
      } catch {
        // skip unreadable entries
      }
    }
  }
  return total;
}

function readLogTail(maxLines = 100) {
  if (!fs.existsSync(BACKUP_LOG_PATH)) {
    return { exists: false, lines: [] };
  }
  const raw = fs.readFileSync(BACKUP_LOG_PATH, "utf8");
  const lines = raw.split(/\r?\n/).map((line) => line.trimEnd()).filter(Boolean);
  return {
    exists: true,
    lines: lines.slice(-maxLines),
    totalLines: lines.length,
  };
}

function readSnapshots() {
  if (!fs.existsSync(DAILY_DIR)) return [];

  return fs
    .readdirSync(DAILY_DIR)
    .map((name) => {
      const dirPath = path.join(DAILY_DIR, name);
      try {
        if (!fs.statSync(dirPath).isDirectory()) return null;
      } catch {
        return null;
      }

      const manifestPath = path.join(dirPath, "manifest.json");
      let manifest = null;
      if (fs.existsSync(manifestPath)) {
        try {
          manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        } catch {
          manifest = null;
        }
      }

      const dbPath = path.join(dirPath, "erp.sqlite");
      const dbBytes = fs.existsSync(dbPath) ? fs.statSync(dbPath).size : null;

      return {
        date: name,
        dirPath,
        totalBytes: directorySizeSync(dirPath),
        dbBytes,
        createdAt: manifest?.createdAt || null,
        retentionDays: manifest?.retentionDays ?? null,
        folders: manifest?.folders || null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

export function collectErpBackupStatus(options = {}) {
  const logTail = Number(options.logTail) > 0 ? Number(options.logTail) : 100;
  const log = readLogTail(logTail);
  const snapshots = readSnapshots();

  return {
    generatedAt: new Date().toISOString(),
    scheduleLabel: "\uB9E4\uC77C \uC790\uC815 (KST)",
    cronExpression: "0 0 * * * TZ=Asia/Seoul",
    retainDays: DEFAULT_RETAIN_DAYS,
    logPath: BACKUP_LOG_PATH,
    logExists: log.exists,
    logLines: log.lines,
    logTotalLines: log.totalLines,
    backupDir: BACKUP_DIR,
    snapshots,
  };
}
