/**
 * CalWalk is the source of truth for meal/expense on SC schedule import.
 * Usage: npx tsx scripts/test-sc-schedule-expense-source-of-truth.ts
 */
import assert from "node:assert/strict";
import { buildSaleFormFromScSchedule, getWorkerExtrasHistoryReference } from "../src/utils/scScheduleSaleImport.ts";
import { parseScParticipantMoney } from "../src/utils/scSchedules.ts";

let failed = 0;

function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`PASS: ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL: ${name}`);
    console.error(error);
  }
}

const history = [
  {
    client: "인디퍼",
    workers: [{ worker: "김작업", meal: "15000", expense: "100000" }],
  },
  {
    client: "인디퍼",
    workers: [{ worker: "김작업", meal: "15000", expense: "24000" }],
  },
];

check("parseScParticipantMoney: missing => null, 0 => 0, positive => amount", () => {
  assert.equal(parseScParticipantMoney(null), null);
  assert.equal(parseScParticipantMoney(""), null);
  assert.equal(parseScParticipantMoney(0), 0);
  assert.equal(parseScParticipantMoney("0"), 0);
  assert.equal(parseScParticipantMoney(24000), 24000);
});

check("missing CalWalk expense + history present => blank expense", () => {
  const form = buildSaleFormFromScSchedule(
    {
      id: "sc-missing",
      workDate: "2026-07-30",
      startTime: "09:00",
      endTime: "18:00",
      workType: "현장",
      clientName: "인디퍼",
      participantNames: ["김작업"],
      participants: [{ participantName: "김작업", name: "김작업" }],
    },
    [{ name: "김작업", constructionCost: 330000, overtimeCost: 30000, feeRate: 0.1 }],
    [{ name: "인디퍼", constructionCost: 330000, overtimeCost: 30000, mealIncluded: "N" }],
    history,
  );
  assert.equal(String(form.workers[0].expense || ""), "");
  assert.equal(String(form.workers[0].meal || ""), "");
});

check("explicit CalWalk expense 0 + history => expense 0", () => {
  const form = buildSaleFormFromScSchedule(
    {
      id: "sc-zero",
      workDate: "2026-07-30",
      startTime: "09:00",
      endTime: "18:00",
      workType: "현장",
      clientName: "인디퍼",
      participantNames: ["김작업"],
      participants: [{ participantName: "김작업", name: "김작업", meal: 0, expense: 0 }],
    },
    [{ name: "김작업", constructionCost: 330000, overtimeCost: 30000, feeRate: 0.1 }],
    [{ name: "인디퍼", constructionCost: 330000, overtimeCost: 30000, mealIncluded: "N" }],
    history,
  );
  assert.equal(form.workers[0].expense, "0");
  assert.equal(form.workers[0].meal, "0");
});

check("positive CalWalk expense is copied", () => {
  const form = buildSaleFormFromScSchedule(
    {
      id: "sc-pos",
      workDate: "2026-07-30",
      startTime: "09:00",
      endTime: "18:00",
      workType: "현장",
      clientName: "인디퍼",
      participantNames: ["김작업"],
      participants: [{ participantName: "김작업", name: "김작업", expense: 35000, meal: 12000 }],
    },
    [{ name: "김작업", constructionCost: 330000, overtimeCost: 30000, feeRate: 0.1 }],
    [{ name: "인디퍼", constructionCost: 330000, overtimeCost: 30000, mealIncluded: "N" }],
    history,
  );
  assert.equal(form.workers[0].expense, "35000");
  assert.equal(form.workers[0].meal, "12000");
});

check("only workers with CalWalk expense receive it", () => {
  const form = buildSaleFormFromScSchedule(
    {
      id: "sc-multi",
      workDate: "2026-07-30",
      startTime: "09:00",
      endTime: "18:00",
      workType: "현장",
      clientName: "인디퍼",
      participantNames: ["김작업", "이작업"],
      participants: [
        { participantName: "김작업", name: "김작업", expense: 50000 },
        { participantName: "이작업", name: "이작업" },
      ],
    },
    [
      { name: "김작업", constructionCost: 330000, overtimeCost: 30000, feeRate: 0.1 },
      { name: "이작업", constructionCost: 330000, overtimeCost: 30000, feeRate: 0.1 },
    ],
    [{ name: "인디퍼", constructionCost: 330000, overtimeCost: 30000, mealIncluded: "N" }],
    [
      ...history,
      { client: "인디퍼", workers: [{ worker: "이작업", expense: "99999" }] },
    ],
  );
  assert.equal(form.workers[0].expense, "50000");
  assert.equal(String(form.workers[1].expense || ""), "");
});

check("similar client/worker names do not auto-match history", () => {
  const form = buildSaleFormFromScSchedule(
    {
      id: "sc-similar",
      workDate: "2026-07-30",
      startTime: "09:00",
      endTime: "18:00",
      workType: "현장",
      clientName: "인디퍼",
      participantNames: ["김작"],
      participants: [{ participantName: "김작", name: "김작" }],
    },
    [{ name: "김작", constructionCost: 330000, overtimeCost: 30000, feeRate: 0.1 }],
    [{ name: "인디퍼", constructionCost: 330000, overtimeCost: 30000, mealIncluded: "N" }],
    history,
  );
  assert.equal(String(form.workers[0].expense || ""), "");
});

check("2026-07-30 Indiffer fixture: phantom expense count 0", () => {
  const form = buildSaleFormFromScSchedule(
    {
      id: "sc-indiffer-20260730",
      workDate: "2026-07-30",
      startTime: "09:00",
      endTime: "18:00",
      workType: "시공",
      clientName: "인디퍼",
      participantNames: ["김작업"],
      participants: [{ participantName: "김작업", name: "김작업" }],
    },
    [{ name: "김작업", constructionCost: 330000, overtimeCost: 30000, feeRate: 0.1 }],
    [{ name: "인디퍼", constructionCost: 330000, overtimeCost: 30000, mealIncluded: "N" }],
    history,
  );
  const phantomExpenseCount = form.workers.filter((row) => Number(row.expense || 0) > 0).length;
  assert.equal(phantomExpenseCount, 0);
  const ref = getWorkerExtrasHistoryReference(history, "인디퍼", "김작업");
  assert.ok((ref.expense || 0) > 0, "reference hint may exist");
  assert.notEqual(String(form.workers[0].expense || ""), String(ref.expense));
});

check("preview payload leaves blanks when CalWalk missing (save payload match)", () => {
  const form = buildSaleFormFromScSchedule(
    {
      id: "sc-payload",
      workDate: "2026-07-30",
      startTime: "09:00",
      endTime: "18:00",
      workType: "현장",
      clientName: "인디퍼",
      participantNames: ["김작업"],
      participants: [{ participantName: "김작업", name: "김작업" }],
    },
    [{ name: "김작업", constructionCost: 330000, overtimeCost: 30000, feeRate: 0.1 }],
    [{ name: "인디퍼", constructionCost: 330000, overtimeCost: 30000, mealIncluded: "N" }],
    history,
  );
  assert.equal(String(form.workers[0].meal || ""), "");
  assert.equal(String(form.workers[0].expense || ""), "");
});

check("mealIncluded=Y still suppresses meal auto-fill even when CalWalk meal exists", () => {
  const form = buildSaleFormFromScSchedule(
    {
      id: "sc-meal-y",
      workDate: "2026-07-30",
      startTime: "09:00",
      endTime: "18:00",
      workType: "현장",
      clientName: "인디퍼",
      participantNames: ["김작업"],
      participants: [{ participantName: "김작업", name: "김작업", meal: 15000, expense: 20000 }],
    },
    [{ name: "김작업", constructionCost: 330000, overtimeCost: 30000, feeRate: 0.1 }],
    [{ name: "인디퍼", constructionCost: 330000, overtimeCost: 30000, mealIncluded: "Y" }],
    history,
  );
  assert.equal(String(form.workers[0].meal || ""), "");
  assert.equal(form.workers[0].expense, "20000");
});

if (failed) {
  console.error(`test-sc-schedule-expense-source-of-truth: ${failed} failed`);
  process.exit(1);
}
console.log("test-sc-schedule-expense-source-of-truth: PASS");
