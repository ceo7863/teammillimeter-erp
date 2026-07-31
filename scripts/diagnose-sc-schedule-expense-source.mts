/**
 * Read-only Indiffer (인디퍼) CalWalk expense dry-run. Never mutates sales.
 * Usage: npx tsx scripts/diagnose-sc-schedule-expense-source.mts [--date=2026-07-30] [--client=인디퍼]
 */
import { getDb, getErpState } from "../server/db.mjs";
import { buildSaleFormFromScSchedule } from "../src/utils/scScheduleSaleImport.ts";
import { listStoredScSchedules } from "../server/scScheduleSync.mjs";

const dateArg = process.argv.find((arg) => arg.startsWith("--date="));
const clientArg = process.argv.find((arg) => arg.startsWith("--client="));
const workDate = dateArg ? dateArg.slice("--date=".length) : "2026-07-30";
const clientFilter = clientArg ? clientArg.slice("--client=".length) : "인디퍼";
const sqliteArg = process.argv.find((arg) => arg.endsWith(".sqlite"));
process.env.DATABASE_PATH = sqliteArg || "data/erp.sqlite";

getDb();
const { data } = getErpState();
const workers = Array.isArray(data.workers) ? data.workers : [];
const clients = Array.isArray(data.clients) ? data.clients : [];
const salesHistory = Array.isArray(data.sales) ? data.sales : [];

const monthKey = workDate.slice(0, 7);
const schedules = listStoredScSchedules({ monthKey }).filter((row: { workDate?: string; clientName?: string }) => {
  if (String(row.workDate || "").slice(0, 10) !== workDate) return false;
  if (!clientFilter) return true;
  return String(row.clientName || "").includes(clientFilter);
});

const rows = schedules.map((schedule: any) => {
  const form = buildSaleFormFromScSchedule(schedule, workers, clients, salesHistory);
  const phantomWorkers = form.workers
    .filter((line) => String(line.worker || "").trim())
    .filter((line) => {
      const scWorker = (schedule.participants || []).find(
        (p: any) =>
          String(p.participantName || p.name || "").trim() === String(line.worker || "").trim(),
      );
      const scExpenseMissing =
        !scWorker ||
        (scWorker.expense == null &&
          scWorker.expenseCost == null &&
          scWorker.expenseAmount == null &&
          (!Array.isArray(scWorker.expenses) || scWorker.expenses.length === 0));
      return scExpenseMissing && Number(line.expense || 0) > 0;
    });
  return {
    scheduleId: schedule.id,
    workDate: schedule.workDate,
    client: schedule.clientName,
    workerCount: form.workers.filter((line) => String(line.worker || "").trim()).length,
    phantomExpenseCount: phantomWorkers.length,
    workers: form.workers
      .filter((line) => String(line.worker || "").trim())
      .map((line) => ({
        worker: line.worker,
        meal: line.meal || "",
        expense: line.expense || "",
      })),
  };
});

const phantomExpenseCount = rows.reduce((sum, row) => sum + row.phantomExpenseCount, 0);

console.log(
  JSON.stringify(
    {
      dryRun: true,
      customerDataMutation: 0,
      historicalSalesMutation: 0,
      workDate,
      clientFilter,
      scheduleCount: rows.length,
      phantomExpenseCount,
      rows,
    },
    null,
    2,
  ),
);
