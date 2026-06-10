import fs from "fs";
import path from "path";
import { getErpState } from "../server/db.mjs";

const data = getErpState().data || {};
const clients = Array.isArray(data.clients) ? data.clients : [];
const regDir = path.join(process.cwd(), "data", "client-business-reg");
const diskFiles = fs.existsSync(regDir) ? fs.readdirSync(regDir) : [];

const clientIds = new Set(clients.map((c) => String(c.id)));
const matches = [];

for (const fileName of diskFiles) {
  const id = fileName.replace(/\.[^.]+$/, "");
  const tsPart = id.match(/^bizreg-(\d+)-/)?.[1];
  const byFileId = clients.find((c) => String(c.businessRegFileId || "") === id);
  const byClientId = clientIds.has(tsPart || "") ? clients.find((c) => String(c.id) === tsPart) : null;
  matches.push({
    fileName,
    fileId: id,
    tsPart,
    matchedClientByFileId: byFileId ? { id: byFileId.id, name: byFileId.name } : null,
    matchedClientByTs: byClientId ? { id: byClientId.id, name: byClientId.name } : null,
  });
}

console.log(JSON.stringify({ matches }, null, 2));
