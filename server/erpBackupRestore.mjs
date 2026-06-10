import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { fileURLToPath } from "url";
import { config } from "./config.mjs";

const execFileAsync = promisify(execFile);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BACKUP_LOG_PATH = path.join(rootDir, "logs", "erp-backup.log");
const DAILY_DIR = path.join(rootDir, "data", "backups", "daily");
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const FOLDERS = [
  { key: "pdf-archives", target: config.pdfArchiveDir },
  { key: "client-business-reg", target: config.clientBusinessRegDir },
  { key: "client-contracts", target: config.clientContractsDir },
  { key: "board-attachments", target: config.boardAttachmentDir },
];

function appendBackupLog(message) {
  fs.mkdirSync(path.dirname(BACKUP_LOG_PATH), { recursive: true });
  fs.appendFileSync(BACKUP_LOG_PATH, `[${new Date().toISOString()}] ${message}\n`, "utf8");
}

async function copyTree(sourceDir, targetDir) {
  if (!fs.existsSync(sourceDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
    return;
  }
  fs.mkdirSync(targetDir, { recursive: true });
  try {
    await execFileAsync("rsync", ["-a", "--delete", `${sourceDir}/`, `${targetDir}/`], {
      timeout: 300000,
      windowsHide: true,
    });
    return;
  } catch {
    // fall through to manual copy
  }
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const src = path.join(sourceDir, entry.name);
    const dest = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      await copyTree(src, dest);
    } else if (entry.isFile()) {
      fs.copyFileSync(src, dest);
    }
  }
}

function removeWalSidecars(dbPath) {
  for (const suffix of ["-wal", "-shm"]) {
    try {
      fs.unlinkSync(`${dbPath}${suffix}`);
    } catch {
      // ignore missing sidecars
    }
  }
}

async function backupCurrentDb(targetPath) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  if (fs.existsSync(config.dbPath)) {
    try {
      await execFileAsync("sqlite3", [config.dbPath, `.backup '${targetPath}'`], {
        timeout: 120000,
        windowsHide: true,
      });
      return;
    } catch {
      fs.copyFileSync(config.dbPath, targetPath);
    }
  }
}

export function resolveBackupSnapshotDir(date) {
  const normalized = String(date || "").trim();
  if (!DATE_RE.test(normalized)) {
    throw new Error("\uBC31\uC5C5 \uB0A0\uC9DC \uD615\uC2DD\uC774 \uC798\uBABB\uB418\uC5C8\uC2B5\uB2C8\uB2E4.");
  }
  const snapshotDir = path.join(DAILY_DIR, normalized);
  const backupDbPath = path.join(snapshotDir, "erp.sqlite");
  if (!fs.existsSync(backupDbPath)) {
    throw new Error("\uC120\uD0DD\uD55C \uBC31\uC5C5 \uC2A4\uB0B9\uC0F7\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
  }
  return { date: normalized, snapshotDir, backupDbPath };
}

export async function restoreErpBackupSnapshot(date) {
  const { date: normalized, snapshotDir, backupDbPath } = resolveBackupSnapshotDir(date);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const preRestoreDbPath = path.join(rootDir, "data", `erp.sqlite.bak-pre-restore-${stamp}`);

  await backupCurrentDb(preRestoreDbPath);
  fs.copyFileSync(backupDbPath, config.dbPath);
  removeWalSidecars(config.dbPath);

  for (const folder of FOLDERS) {
    await copyTree(path.join(snapshotDir, folder.key), folder.target);
  }

  appendBackupLog(
    `restore ok from ${snapshotDir} (pre-restore db: ${preRestoreDbPath})`,
  );

  return {
    date: normalized,
    snapshotDir,
    preRestoreDbPath,
    restoredAt: new Date().toISOString(),
  };
}

export function scheduleErpProcessRestart() {
  setImmediate(() => {
    execFile("pm2", ["restart", "erp"], { windowsHide: true }, () => {});
  });
}
