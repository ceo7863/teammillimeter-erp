import fs from "fs";
import path from "path";
import { getErpState, getDb } from "../server/db.mjs";

const data = getErpState().data || {};
const auditLogs = Array.isArray(data.auditLogs) ? data.auditLogs : [];
const bizRegAudits = auditLogs.filter((row) => {
  const text = JSON.stringify(row).toLowerCase();
  return text.includes("businessreg") || text.includes("?????");
});

const regDir = path.join(process.cwd(), "data", "client-business-reg");
const diskFiles = fs.existsSync(regDir)
  ? fs.readdirSync(regDir).map((name) => {
      const full = path.join(regDir, name);
      const stat = fs.statSync(full);
      return { name, size: stat.size, mtime: stat.mtime.toISOString() };
    })
  : [];

console.log(
  JSON.stringify(
    {
      auditHits: bizRegAudits.length,
      auditSample: bizRegAudits.slice(-5),
      diskFiles,
    },
    null,
    2,
  ),
);
