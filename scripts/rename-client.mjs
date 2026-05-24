import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const FROM = "에이치";
const TO = "미무";

const jsonFiles = [
  path.join(root, "public/erp-seed.json"),
  path.join(root, "dist/erp-seed.json"),
];

function renameClientInPayload(payload) {
  let clientRenamed = 0;
  let salesRenamed = 0;
  let paymentsRenamed = 0;

  if (Array.isArray(payload.clients)) {
    payload.clients.forEach((client) => {
      if (client.name === FROM) {
        client.name = TO;
        clientRenamed += 1;
      }
    });
  }

  if (Array.isArray(payload.sales)) {
    payload.sales.forEach((sale) => {
      if (sale.client === FROM) {
        sale.client = TO;
        salesRenamed += 1;
      }
    });
  }

  if (Array.isArray(payload.paymentVouchers)) {
    payload.paymentVouchers.forEach((voucher) => {
      if (voucher.client === FROM) {
        voucher.client = TO;
        paymentsRenamed += 1;
      }
    });
  }

  if (Array.isArray(payload.auditLogs)) {
    payload.auditLogs.forEach((entry) => {
      if (typeof entry.entityLabel === "string" && entry.entityLabel.includes(FROM)) {
        entry.entityLabel = entry.entityLabel.replaceAll(FROM, TO);
      }
      if (entry.field === "client" && entry.before === FROM) entry.before = TO;
      if (entry.field === "client" && entry.after === FROM) entry.after = TO;
    });
  }

  return { clientRenamed, salesRenamed, paymentsRenamed };
}

for (const filePath of jsonFiles) {
  if (!fs.existsSync(filePath)) continue;
  const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const stats = renameClientInPayload(payload);
  fs.writeFileSync(filePath, JSON.stringify(payload));
  console.log(`${filePath}`, stats);
}

const textFiles = [
  path.join(root, "src/App.tsx"),
  path.join(root, "src/Teammillimeter_Web_Erp_Mvp_snapshot.tsx"),
];

for (const filePath of textFiles) {
  if (!fs.existsSync(filePath)) continue;
  const original = fs.readFileSync(filePath, "utf8");
  let next = original;
  next = next.replaceAll(`"name":"${FROM}"`, `"name":"${TO}"`);
  next = next.replaceAll(`"client":"${FROM}"`, `"client":"${TO}"`);
  next = next.replaceAll(`"name": "${FROM}"`, `"name": "${TO}"`);
  next = next.replaceAll(`name: "${FROM}"`, `name: "${TO}"`);
  if (next !== original) {
    fs.writeFileSync(filePath, next);
    console.log(`${filePath} updated (${(original.match(new RegExp(FROM, "g")) || []).length} → ${(next.match(new RegExp(FROM, "g")) || []).length} remaining)`);
  }
}

console.log("Done.");
