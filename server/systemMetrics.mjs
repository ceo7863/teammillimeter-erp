import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { config } from "./config.mjs";

const execFileAsync = promisify(execFile);

function round1(value) {
  return Math.round(Number(value) * 10) / 10;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fileSizeSafe(filePath) {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return null;
  }
}

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

function listDataStorageBreakdown(dataDir) {
  const entries = [
    { key: "db", label: "SQLite DB", target: config.dbPath, file: true },
    { key: "pdf", label: "PDF \uC544\uCE74\uC774\uBE0C", target: config.pdfArchiveDir },
    { key: "contracts", label: "\uACC4\uC57D\uC11C", target: config.clientContractsDir },
    { key: "businessReg", label: "\uC0AC\uC5C5\uC790\uB4F1\uB85D\uC99D", target: config.clientBusinessRegDir },
    { key: "board", label: "\uAC8C\uC2DC\uD310 \uCCA8\uBD80", target: config.boardAttachmentDir },
  ];

  const rows = [];
  for (const entry of entries) {
    const target = entry.target;
    if (!target) continue;
    let bytes = null;
    try {
      const stat = fs.statSync(target);
      if (entry.file && stat.isFile()) bytes = stat.size;
      else if (!entry.file && stat.isDirectory()) bytes = directorySizeSync(target);
    } catch {
      bytes = null;
    }
    if (bytes == null) continue;
    rows.push({
      key: entry.key,
      label: entry.label,
      path: target,
      bytes,
    });
  }

  let dataDirBytes = null;
  try {
    if (fs.statSync(dataDir).isDirectory()) dataDirBytes = directorySizeSync(dataDir);
  } catch {
    dataDirBytes = null;
  }

  rows.sort((a, b) => b.bytes - a.bytes);
  return { dataDir, dataDirBytes, rows };
}

async function diskUsageForPath(label, targetPath) {
  try {
    const stats = await fs.promises.statfs(targetPath);
    const totalBytes = stats.blocks * stats.bsize;
    const freeBytes = stats.bavail * stats.bsize;
    const usedBytes = Math.max(0, totalBytes - freeBytes);
    const usedPercent = totalBytes > 0 ? round1((usedBytes / totalBytes) * 100) : 0;
    return {
      label,
      path: targetPath,
      totalBytes,
      usedBytes,
      freeBytes,
      usedPercent,
    };
  } catch {
    return null;
  }
}

async function sampleCpuUsagePercent(sampleMs = 250) {
  const start = os.cpus();
  await sleep(sampleMs);
  const end = os.cpus();
  let idleDiff = 0;
  let totalDiff = 0;
  for (let i = 0; i < end.length; i += 1) {
    const startTimes = start[i]?.times || {};
    const endTimes = end[i]?.times || {};
    const idle = (endTimes.idle || 0) - (startTimes.idle || 0);
    const total = Object.keys(endTimes).reduce(
      (sum, key) => sum + ((endTimes[key] || 0) - (startTimes[key] || 0)),
      0,
    );
    idleDiff += idle;
    totalDiff += total;
  }
  if (totalDiff <= 0) return 0;
  return round1(((totalDiff - idleDiff) / totalDiff) * 100);
}

async function readPm2Processes() {
  try {
    const { stdout } = await execFileAsync("pm2", ["jlist"], {
      timeout: 5000,
      windowsHide: true,
    });
    const list = JSON.parse(stdout);
    if (!Array.isArray(list)) return null;
    return list.map((item) => ({
      name: String(item?.name || ""),
      status: String(item?.pm2_env?.status || "unknown"),
      cpu: round1(Number(item?.monit?.cpu) || 0),
      memoryBytes: Math.round(Number(item?.monit?.memory) || 0),
      pid: Number(item?.pid) || 0,
      restarts: Number(item?.pm2_env?.restart_time) || 0,
      uptimeMs: item?.pm2_env?.pm_uptime ? Date.now() - Number(item.pm2_env.pm_uptime) : null,
    }));
  } catch {
    return null;
  }
}

export async function collectSystemMetrics() {
  const cpus = os.cpus();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const load = os.loadavg();
  const procMem = process.memoryUsage();
  const dataDir = path.dirname(config.dbPath);
  const rootPath = process.platform === "win32" ? path.parse(process.cwd()).root : "/";
  const storage = listDataStorageBreakdown(dataDir);

  const diskCandidates = [await diskUsageForPath("\uC11C\uBC84 \uB514\uC2A4\uD06C", rootPath)].filter(Boolean);

  return {
    generatedAt: new Date().toISOString(),
    host: {
      hostname: os.hostname(),
      platform: process.platform,
      arch: os.arch(),
      release: os.release(),
      uptimeSeconds: Math.round(os.uptime()),
    },
    cpu: {
      model: String(cpus[0]?.model || "").trim(),
      cores: cpus.length,
      speedMhz: Math.round(Number(cpus[0]?.speed) || 0),
      usagePercent: await sampleCpuUsagePercent(),
      loadAverage:
        process.platform === "win32" ? null : [round1(load[0]), round1(load[1]), round1(load[2])],
    },
    memory: {
      totalBytes: totalMem,
      usedBytes: usedMem,
      freeBytes: freeMem,
      usedPercent: totalMem > 0 ? round1((usedMem / totalMem) * 100) : 0,
    },
    disk: diskCandidates,
    process: {
      pid: process.pid,
      uptimeSeconds: Math.round(process.uptime()),
      nodeVersion: process.version,
      memoryRssBytes: Math.round(procMem.rss),
      memoryHeapUsedBytes: Math.round(procMem.heapUsed),
      memoryHeapTotalBytes: Math.round(procMem.heapTotal),
    },
    pm2: await readPm2Processes(),
    storage: {
      dbPath: config.dbPath,
      dbBytes: fileSizeSafe(config.dbPath),
      dataDir: storage.dataDir,
      dataDirBytes: storage.dataDirBytes,
      breakdown: storage.rows,
    },
  };
}
