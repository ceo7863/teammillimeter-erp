import assert from "node:assert/strict";
import {
  resolveShortShiftChargeAmount,
  resolveShortShiftUnitCost,
  roundShortShiftPayToManwon,
  applyShortShiftEqualPayDiscount,
  truncateShortShiftChargeToManwon,
  computeShortShiftChargeAmount,
  computeScheduleOvertimeHours,
  computeScheduleWorkHours,
} from "../src/utils/saleAiRules.ts";
import { buildSaleFormFromScSchedule } from "../src/utils/scScheduleSaleImport.ts";

assert.equal(computeScheduleOvertimeHours("17:00"), 0);
assert.equal(computeScheduleOvertimeHours("18:00"), 0);
assert.equal(computeScheduleOvertimeHours("19:00"), 2);
assert.equal(computeScheduleOvertimeHours("19:30"), 2);
assert.equal(computeScheduleOvertimeHours("20:00"), 3);

assert.equal(computeScheduleWorkHours("09:00", "11:00"), 2);
assert.equal(computeShortShiftChargeAmount(2), 150000);
assert.equal(truncateShortShiftChargeToManwon(125000), 120000);
assert.equal(truncateShortShiftChargeToManwon(150000), 150000);
assert.equal(resolveShortShiftChargeAmount(1.5), 120000);
assert.equal(resolveShortShiftChargeAmount(4, undefined, 250000), 250000);
assert.equal(resolveShortShiftChargeAmount(4, undefined, 200000), 200000);
assert.equal(resolveShortShiftUnitCost(250000, 200000), "200000");
assert.equal(resolveShortShiftUnitCost(150000, 330000), "330000");
assert.equal(resolveShortShiftUnitCost(250000, 250000), "240000");
assert.equal(roundShortShiftPayToManwon(313500), 310000);
assert.equal(roundShortShiftPayToManwon(237500), 240000);
assert.equal(applyShortShiftEqualPayDiscount(250000, 250000), 240000);
assert.equal(applyShortShiftEqualPayDiscount(330000, 330000), 310000);
assert.equal(applyShortShiftEqualPayDiscount(250000, 330000), 330000);

const workLogForm = buildSaleFormFromScSchedule(
  {
    id: "sc-wl",
    workDate: "2026-06-10",
    startTime: "09:00",
    endTime: "18:00",
    workType: "site",
    clientName: "client",
    participantNames: ["worker"],
    workLog: { startTime: "10:00", endTime: "12:00", durationMinutes: 120 },
  },
  [{ name: "worker", constructionCost: 330000, overtimeCost: 30000, feeRate: 0.1 }],
  [{ name: "client", constructionCost: 330000, overtimeCost: 30000, mealIncluded: "Y" }],
  [],
);

assert.equal(workLogForm.workers[0].chargeAmount, "150000");
assert.match(workLogForm.workers[0].memo || "", /10:00/);
assert.doesNotMatch(workLogForm.workers[0].memo || "", /09:00/);

const form = buildSaleFormFromScSchedule(
  {
    id: "sc-1",
    workDate: "2026-06-10",
    startTime: "09:00",
    endTime: "11:00",
    workType: "?????",
    clientName: "??",
    participantNames: ["???"],
  },
  [{ name: "???", constructionCost: 330000, overtimeCost: 30000, feeRate: 0.1 }],
  [{ name: "??", constructionCost: 330000, overtimeCost: 30000, mealIncluded: "Y" }],
  [],
);

assert.equal(form.client, "??");
assert.equal(form.site, "?????");
assert.equal(form.workers[0].worker, "???");
assert.equal(form.workers[0].chargeAmount, "150000");
assert.equal(form.workers[0].unitCost, "330000");
assert.match(form.workers[0].memo || "", /09:00/);

const overtimeForm = buildSaleFormFromScSchedule(
  {
    id: "sc-2",
    workDate: "2026-06-10",
    startTime: "09:00",
    endTime: "20:00",
    workType: "????",
    clientName: "??",
    participantNames: ["???"],
  },
  [{ name: "???", constructionCost: 330000, overtimeCost: 30000, feeRate: 0.1 }],
  [{ name: "??", constructionCost: 330000, overtimeCost: 30000, mealIncluded: "Y" }],
  [],
);

assert.equal(overtimeForm.workers[0].overtimeHours, "3");
assert.equal(overtimeForm.workers[0].overtimeCost, "30000");
assert.equal(Number(overtimeForm.workers[0].overtimeHours) * Number(overtimeForm.workers[0].overtimeCost), 90000);
assert.match(overtimeForm.workers[0].memo || "", /20:00/);

const scExtrasForm = buildSaleFormFromScSchedule(
  {
    id: "sc-3",
    workDate: "2026-06-10",
    startTime: "09:00",
    endTime: "18:00",
    workType: "?????",
    clientName: "???A",
    participantNames: ["???"],
    participants: [{ participantName: "???", name: "???", meal: 10000, expense: 5000 }],
  },
  [{ name: "???", constructionCost: 330000, overtimeCost: 30000, feeRate: 0.1 }],
  [{ name: "???A", constructionCost: 330000, overtimeCost: 30000, mealIncluded: "N" }],
  [{ client: "???A", workers: [{ worker: "???", meal: "99999", expense: "88888" }] }],
);

assert.equal(scExtrasForm.workers[0].meal, "10000");
assert.equal(scExtrasForm.workers[0].expense, "5000");

const scExpenseItemsForm = buildSaleFormFromScSchedule(
  {
    id: "sc-4",
    workDate: "2026-06-10",
    startTime: "09:00",
    endTime: "18:00",
    workType: "?????",
    clientName: "???A",
    participantNames: ["???"],
    participants: [
      {
        participantName: "???",
        name: "???",
        expenses: [
          { category: "MEALS", amount: 12000 },
          { category: "PARKING", amount: 4000 },
          { category: "FUEL", amount: 6000 },
        ],
      },
    ],
  },
  [{ name: "???", constructionCost: 330000, overtimeCost: 30000, feeRate: 0.1 }],
  [{ name: "???A", constructionCost: 330000, overtimeCost: 30000, mealIncluded: "N" }],
  [{ client: "???A", workers: [{ worker: "???", meal: "99999", expense: "88888" }] }],
);

assert.equal(scExpenseItemsForm.workers[0].meal, "12000");
assert.equal(scExpenseItemsForm.workers[0].expense, "10000");

const capForm = buildSaleFormFromScSchedule(
  {
    id: "sc-cap",
    workDate: "2026-06-10",
    startTime: "09:00",
    endTime: "13:00",
    workType: "site",
    clientName: "client",
    participantNames: ["worker"],
  },
  [{ name: "worker", constructionCost: 330000, customChargeCost: 120000, overtimeCost: 30000, feeRate: 0.1 }],
  [{ name: "client", constructionCost: 330000, overtimeCost: 30000, mealIncluded: "Y" }],
  [],
);

assert.equal(capForm.workers[0].chargeAmount, "120000");
assert.equal(capForm.workers[0].unitCost, "330000");

const workerBasicCapForm = buildSaleFormFromScSchedule(
  {
    id: "sc-basic-cap",
    workDate: "2026-06-10",
    startTime: "09:00",
    endTime: "13:00",
    workType: "site",
    clientName: "client",
    participantNames: ["worker"],
  },
  [{ name: "worker", constructionCost: 200000, overtimeCost: 30000, feeRate: 0.1 }],
  [{ name: "client", constructionCost: 330000, overtimeCost: 30000, mealIncluded: "Y" }],
  [],
);

assert.equal(workerBasicCapForm.workers[0].chargeAmount, "200000");
assert.equal(workerBasicCapForm.workers[0].unitCost, "190000");

const payForm = buildSaleFormFromScSchedule(
  {
    id: "sc-pay",
    workDate: "2026-06-10",
    startTime: "09:00",
    endTime: "13:00",
    workType: "site",
    clientName: "client",
    participantNames: ["worker"],
  },
  [{ name: "worker", constructionCost: 330000, overtimeCost: 30000, feeRate: 0.1 }],
  [{ name: "client", constructionCost: 330000, overtimeCost: 30000, mealIncluded: "Y" }],
  [],
);

assert.equal(payForm.workers[0].chargeAmount, "250000");
assert.equal(payForm.workers[0].unitCost, "330000");

const manwonForm = buildSaleFormFromScSchedule(
  {
    id: "sc-manwon",
    workDate: "2026-06-10",
    startTime: "09:00",
    endTime: "10:30",
    workType: "site",
    clientName: "client",
    participantNames: ["worker"],
  },
  [{ name: "worker", constructionCost: 330000, overtimeCost: 30000, feeRate: 0.1 }],
  [{ name: "client", constructionCost: 330000, overtimeCost: 30000, mealIncluded: "Y" }],
  [],
);

assert.equal(manwonForm.workers[0].chargeAmount, "120000");

console.log("verify-sc-schedule-sale-import: ok");
