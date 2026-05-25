import fs from "node:fs";

function parseWorkerMoney(value) {
  return Number(String(value ?? "").replace(/[^0-9.-]/g, "")) || 0;
}

function calculateWorkerLineAmounts(line) {
  const quantity = parseWorkerMoney(line.quantity || "1") || 1;
  const unitCost = parseWorkerMoney(line.unitCost);
  const chargeAmount = parseWorkerMoney(line.chargeAmount) || unitCost;
  const meal = parseWorkerMoney(line.meal);
  const lodging = parseWorkerMoney(line.lodging || line.accommodation || line.room);
  const expense = parseWorkerMoney(line.expense || line.extraExpense);
  const overtime = parseWorkerMoney(line.overtimeHours) * (parseWorkerMoney(line.overtimeCost) || 30000);
  const extras = meal + lodging + expense + overtime;
  return { bill: quantity * chargeAmount + extras, extras, meal, lodging, expense, overtime };
}

function hasExplicitLineBill(line) {
  return line.lineBill != null && String(line.lineBill).trim() !== "";
}

function getWorkerLineBill(line) {
  if (hasExplicitLineBill(line)) return parseWorkerMoney(line.lineBill);
  return calculateWorkerLineAmounts(line).bill;
}

function getWorkerLineExtras(line) {
  return calculateWorkerLineAmounts(line);
}

function getSaleWorkerLines(sale) {
  if (sale.workers?.length) return sale.workers.filter((line) => String(line.worker || "").trim());
  return [];
}

function getSaleTotalBill(sale) {
  const lines = getSaleWorkerLines(sale);
  if (!lines.length) return sale.amount || 0;
  return lines.reduce((sum, line) => sum + getWorkerLineBill(line), 0);
}

function aggregateSaleBilling(sale) {
  const lines = getSaleWorkerLines(sale);
  let overtimeCost = 0;
  let mealCost = 0;
  let lodgingCost = 0;
  let expenseCost = 0;
  let originalCost = 0;

  for (const line of lines) {
    const bill = getWorkerLineBill(line);
    const extras = getWorkerLineExtras(line);
    originalCost += Math.max(bill - extras.extras, 0);
    overtimeCost += extras.overtime;
    mealCost += extras.meal;
    lodgingCost += extras.lodging;
    expenseCost += extras.expense;
  }

  const totalConstructionCost = getSaleTotalBill(sale);
  return { totalConstructionCost, originalCost, overtimeCost, mealCost, lodgingCost, expenseCost };
}

const seedPath = process.argv[2] || "public/erp-seed.json";
const raw = JSON.parse(fs.readFileSync(seedPath, "utf8"));
const sales = raw.sales || [];

const amountIssues = [];
const componentIssues = [];

for (const sale of sales) {
  if (!getSaleWorkerLines(sale).length) continue;
  const billing = aggregateSaleBilling(sale);
  const stored = sale.amount || 0;
  const computed = billing.totalConstructionCost;
  const components =
    billing.originalCost + billing.overtimeCost + billing.mealCost + billing.lodgingCost + billing.expenseCost;

  if (stored !== computed) {
    amountIssues.push({ id: sale.id, client: sale.client, stored, computed, diff: computed - stored });
  }
  if (computed !== components) {
    componentIssues.push({ id: sale.id, client: sale.client, computed, components, diff: components - computed });
  }
}

console.log(`Audited ${sales.length} sales from ${seedPath}`);
console.log(`amount mismatch (stored vs computed bill): ${amountIssues.length}`);
console.log(`component mismatch (bill vs original+extras): ${componentIssues.length}`);

if (amountIssues.length) {
  console.log("\nSample amount issues:");
  amountIssues.slice(0, 5).forEach((row) => console.log(row));
}

if (componentIssues.length) {
  console.log("\nSample component issues:");
  componentIssues.slice(0, 5).forEach((row) => console.log(row));
}

process.exit(amountIssues.length || componentIssues.length ? 1 : 0);
