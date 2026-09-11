#!/usr/bin/env node
/**
 * Count-only forensic audit of historical team-chat SSE query tokens in nginx logs.
 * NEVER prints token strings, user ids, or account info.
 *
 * Usage (on server):
 *   node scripts/audit-team-chat-sse-query-token-logs.mjs
 *   node scripts/audit-team-chat-sse-query-token-logs.mjs --since-deploy-iso 2026-09-11T01:00:00Z
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import zlib from "zlib";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

function parseArgs(argv) {
  const out = { sinceDeployIso: null, logDir: "/var/log/nginx" };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--since-deploy-iso") out.sinceDeployIso = argv[++i];
    else if (a === "--log-dir") out.logDir = argv[++i];
  }
  return out;
}

function fingerprint(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex").slice(0, 12);
}

function decodeJwtPayload(token) {
  try {
    const part = String(token).split(".")[1];
    if (!part) return null;
    const json = Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function parseNginxTime(raw) {
  // 11/Sep/2026:00:32:25 +0000
  const m = String(raw).match(/(\d{2})\/([A-Za-z]{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2})\s+([+-]\d{4})/);
  if (!m) return null;
  const months = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
  const mon = months[m[2]];
  if (mon == null) return null;
  const iso = `${m[3]}-${String(mon + 1).padStart(2, "0")}-${m[1]}T${m[4]}:${m[5]}:${m[6]}${m[7].slice(0, 3)}:${m[7].slice(3)}`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function* readLines(filePath) {
  let data;
  if (filePath.endsWith(".gz")) {
    data = zlib.gunzipSync(fs.readFileSync(filePath)).toString("utf8");
  } else {
    data = fs.readFileSync(filePath, "utf8");
  }
  for (const line of data.split(/\r?\n/)) {
    if (line) yield line;
  }
}

function listLogFiles(logDir) {
  if (!fs.existsSync(logDir)) return [];
  return fs
    .readdirSync(logDir)
    .filter((name) => name.startsWith("access.log"))
    .map((name) => path.join(logDir, name))
    .sort();
}

const args = parseArgs(process.argv);
const now = Date.now() / 1000;
const sinceDeploy = args.sinceDeployIso ? new Date(args.sinceDeployIso) : null;

let historicalCount = 0;
let first = null;
let last = null;
const fps = new Set();
let possiblyValid = 0;
let postDeployQueryToken = 0;
let postDeployCredentialLog = 0;

const tokenRe = /\/api\/team-chat\/events\?[^"\s]*token=([^&\s"]+)/i;
const timeRe = /\[([^\]]+)\]/;

for (const file of listLogFiles(args.logDir)) {
  for (const line of readLines(file)) {
    const tm = line.match(tokenRe);
    if (!tm) {
      // credential-like Authorization in access log (should be 0 with default format)
      if (/\/api\/team-chat\/events/.test(line) && /authorization/i.test(line) && /bearer\s+[A-Za-z0-9_-]+\./i.test(line)) {
        const t = parseNginxTime((line.match(timeRe) || [])[1] || "");
        if (sinceDeploy && t && t >= sinceDeploy) postDeployCredentialLog += 1;
      }
      continue;
    }
    historicalCount += 1;
    const token = decodeURIComponent(tm[1]);
    fps.add(fingerprint(token));
    const t = parseNginxTime((line.match(timeRe) || [])[1] || "");
    if (t) {
      if (!first || t < first) first = t;
      if (!last || t > last) last = t;
      if (sinceDeploy && t >= sinceDeploy) postDeployQueryToken += 1;
    }
    const payload = decodeJwtPayload(token);
    const exp = Number(payload?.exp || 0);
    if (exp && exp > now) possiblyValid += 1;
  }
}

const report = {
  historicalQueryTokenLogCount: historicalCount,
  historicalFirstOccurrence: first ? first.toISOString() : null,
  historicalLastOccurrence: last ? last.toISOString() : null,
  distinctTokenFingerprintCount: fps.size,
  possiblyValidTokenCount: possiblyValid,
  postDeployQueryTokenLogCount: postDeployQueryToken,
  postDeployCredentialLogCount: postDeployCredentialLog,
  note: "Token strings, user ids, and accounts are intentionally omitted.",
  approvalRequiredIfRotatingSecret: possiblyValid > 0,
};

console.log(JSON.stringify(report, null, 2));
