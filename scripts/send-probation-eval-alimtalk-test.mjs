#!/usr/bin/env node
/**
 * Create a real probation-eval request in DB, then send alimtalk test.
 * Usage: node --import tsx scripts/send-probation-eval-alimtalk-test.mjs 01012345678
 */
import crypto from "crypto";
import { loadEnv } from "../server/loadEnv.mjs";
import { config } from "../server/config.mjs";
import { getErpState } from "../server/db.mjs";
import { sendProbationEvalAlimtalk } from "../server/alimtalkNotify.mjs";
import {
  formatProbationEvalTemplateVars,
  normalizeProbationEvalRequests,
  updateProbationEvalRequests,
} from "../server/probationEval.mjs";

loadEnv();

const phone = String(process.argv[2] || "").replace(/\D/g, "");
if (!phone) {
  console.error("Usage: node --import tsx scripts/send-probation-eval-alimtalk-test.mjs <phone>");
  process.exit(1);
}

const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
const token = crypto.randomBytes(16).toString("hex");
const requestId = `test-${crypto.randomBytes(6).toString("hex")}`;
const scheduleId = `manual-test-${Date.now()}`;

const state = getErpState();
const data = state.data && typeof state.data === "object" ? state.data : {};
const existing = normalizeProbationEvalRequests(data.probationEvalRequests);

const request = {
  id: requestId,
  token,
  workDate: today,
  scheduleId,
  siteName: "테스트 현장",
  probationWorkerId: "manual-test-worker",
  probationWorkerName: "테스트 시공자",
  evaluatorWorkerId: "manual-test-evaluator",
  evaluatorName: "테스트 평가자",
  evaluatorPhone: phone,
  templateId: "default-v1",
  status: "pending",
  selectionReason: "grade_match",
};

updateProbationEvalRequests([request, ...existing], "probation-eval-alimtalk-test");

const variables = formatProbationEvalTemplateVars(request);
const result = await sendProbationEvalAlimtalk({ phones: [phone], variables });

if (result.ok) {
  const sentAt = new Date().toISOString();
  const refreshed = getErpState();
  const freshData =
    refreshed.data && typeof refreshed.data === "object" ? refreshed.data : {};
  const next = normalizeProbationEvalRequests(freshData.probationEvalRequests).map((row) =>
    row.id === requestId ? { ...row, status: "sent", sentAt } : row,
  );
  updateProbationEvalRequests(next, "probation-eval-alimtalk-test");
}

const surveyUrl = `${config.alimtalk.erpBaseUrl.replace(/\/$/, "")}/eval/${token}`;
console.log(
  JSON.stringify(
    {
      phone,
      phoneLast4: phone.slice(-4),
      token,
      surveyUrl,
      template: config.alimtalk.probationEvalTemplate,
      result,
    },
    null,
    2,
  ),
);
process.exit(result.ok ? 0 : 1);
