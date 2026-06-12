#!/usr/bin/env node
/**
 * Query production ERP for client "???" business registration info.
 * Standalone  does not import erpChatTools.
 */
import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

const HOST = "ubuntu@52.78.74.101";
const REMOTE_DB = "~/teammillimeter-erp/data/erp.sqlite";
const KEY_CANDIDATES = [
  path.join(os.homedir(), ".ssh", "teammillimeter-deploy.pem"),
  path.join(process.env.USERPROFILE || "", ".ssh", "teammillimeter-deploy.pem"),
].filter((p) => p && fs.existsSync(p));

const keyPath = KEY_CANDIDATES[0];
if (!keyPath) {
  console.error("SSH key not found (teammillimeter-deploy.pem)");
  process.exit(1);
}

const REMOTE_SCRIPT = `
import fs from "fs";
import { DatabaseSync } from "node:sqlite";

const dbPath = process.env.HOME + "/teammillimeter-erp/data/erp.sqlite";
const db = new DatabaseSync(dbPath, { readOnly: true });

function loadClients() {
  try {
    const row = db.prepare("SELECT payload FROM erp_domain_state WHERE domain = 'clients'").get();
    if (row?.payload) {
      const parsed = JSON.parse(String(row.payload));
      if (Array.isArray(parsed.clients)) return parsed.clients;
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  try {
    const row = db.prepare("SELECT payload FROM erp_state WHERE id = 1").get();
    const data = JSON.parse(String(row.payload));
    const d = data.data || data;
    if (Array.isArray(d.clients)) return d.clients;
  } catch {}
  return [];
}

function loadContracts() {
  try {
    const row = db.prepare("SELECT payload FROM erp_domain_state WHERE domain = 'clientContracts'").get();
    if (row?.payload) {
      const parsed = JSON.parse(String(row.payload));
      if (Array.isArray(parsed.clientContracts)) return parsed.clientContracts;
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  try {
    const row = db.prepare("SELECT payload FROM erp_state WHERE id = 1").get();
    const data = JSON.parse(String(row.payload));
    const d = data.data || data;
    if (Array.isArray(d.clientContracts)) return d.clientContracts;
  } catch {}
  return [];
}

const needle = "???";
const clients = loadClients().filter((c) => String(c.name || "").includes(needle));
const contracts = loadContracts().filter((c) => String(c.clientName || "").includes(needle));

const bizRegRows = [];
for (const client of clients) {
  const clientId = String(client.id ?? "");
  const row = db
    .prepare("SELECT * FROM client_business_reg_files WHERE client_id = ?")
    .get(clientId);
  let fileExists = false;
  let fileSizeOnDisk = null;
  if (row?.storage_path) {
    try {
      const st = fs.statSync(row.storage_path);
      fileExists = st.isFile();
      fileSizeOnDisk = st.size;
    } catch {}
  }
  bizRegRows.push({
    clientId,
    clientName: client.name,
    businessNo: client.businessNo || "",
    businessRegFileId: client.businessRegFileId || "",
    businessRegFileName: client.businessRegFileName || "",
    businessRegUploadedAt: client.businessRegUploadedAt || "",
    dbRow: row
      ? {
          id: row.id,
          fileName: row.file_name,
          mimeType: row.mime_type,
          fileSize: row.file_size,
          storagePath: row.storage_path,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        }
      : null,
    fileExistsOnDisk: fileExists,
    fileSizeOnDisk,
  });
}

const contractSummary = contracts.map((c) => ({
  id: c.id,
  clientName: c.clientName,
  status: c.status,
  signedPdfKey: c.signedPdfStorageKey || c.signedPdfKey || "",
  originalPdfKey: c.originalPdfStorageKey || c.originalPdfKey || "",
  createdAt: c.createdAt,
  signedAt: c.signedAt,
}));

console.log(
  JSON.stringify(
    {
      dbPath,
      matchedClients: clients.length,
      clients: clients.map((c) => ({
        id: c.id,
        name: c.name,
        businessNo: c.businessNo,
        ceoName: c.ceoName,
        manager: c.manager,
        phone: c.phone,
        businessRegFileId: c.businessRegFileId || "",
        businessRegFileName: c.businessRegFileName || "",
        businessRegUploadedAt: c.businessRegUploadedAt || "",
        isActive: c.isActive,
      })),
      businessReg: bizRegRows,
      contracts: contractSummary,
    },
    null,
    2,
  ),
);

db.close();
`.trim();

const remoteCmd = `echo ${Buffer.from(REMOTE_SCRIPT, "utf8").toString("base64")} | base64 -d | node --input-type=module`;

const sshArgs = [
  "-i",
  keyPath,
  "-o",
  "StrictHostKeyChecking=accept-new",
  "-o",
  "BatchMode=yes",
  HOST,
  remoteCmd,
];

const result = spawnSync("ssh", sshArgs, { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 });

if (result.error) {
  console.error("SSH failed:", result.error.message);
  process.exit(1);
}
if (result.status !== 0) {
  console.error(result.stderr || result.stdout || "SSH exited with error");
  process.exit(result.status || 1);
}

process.stdout.write(result.stdout);
