import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditSalesBilling, normalizeSalesRecords } from "../src/utils/saleBilling.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const seedPaths = [path.join(rootDir, "public", "erp-seed.json"), path.join(rootDir, "dist", "erp-seed.json")];

function loadSeed(seedPath: string) {
  if (!fs.existsSync(seedPath)) return null;
  return JSON.parse(fs.readFileSync(seedPath, "utf8")) as {
    sales?: unknown[];
    workers?: Array<{ name?: string; feeRate?: number }>;
    [key: string]: unknown;
  };
}

function countAmountMismatches(sales: Array<{ amount?: number }>, workers: Array<{ name?: string; feeRate?: number }> = []) {
  const before = auditSalesBilling(sales);
  const normalized = normalizeSalesRecords(sales, workers);
  const after = auditSalesBilling(normalized);
  return { before, after, normalized };
}

function formatSummary(label: string, audit: ReturnType<typeof auditSalesBilling>) {
  console.log(`${label}: ${audit.issueCount} issues / ${audit.totalSales} sales`);
}

for (const seedPath of seedPaths) {
  const payload = loadSeed(seedPath);
  if (!payload) {
    console.log(`Skip (not found): ${seedPath}`);
    continue;
  }

  const sales = (payload.sales || []) as Array<{ amount?: number }>;
  const workers = payload.workers || [];
  const { before, after, normalized } = countAmountMismatches(sales, workers);

  console.log(`\n${path.relative(rootDir, seedPath)}`);
  formatSummary("  Before", before);
  formatSummary("  After ", after);

  payload.sales = normalized;
  fs.writeFileSync(seedPath, `${JSON.stringify(payload)}\n`, "utf8");
  console.log(`  Saved (${normalized.length} sales normalized)`);
}

console.log("\nDone.");
