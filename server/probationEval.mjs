import crypto from "crypto";
import { config } from "./config.mjs";
import { getErpState, saveErpState } from "./db.mjs";
import { normalizeWorkerAiRules } from "./workerAiRules.mjs";
import { resolveScScheduleSiteName } from "./scScheduleSiteName.mjs";
import { findEvalSubjectsOnSchedule, selectScheduleEvaluator } from "./probationEvalAssign.mjs";

const MAX_REQUESTS = 10000;
const SAVE_RETRY_ATTEMPTS = 8;
const PHONE_VERIFY_TTL_MS = 30 * 60 * 1000;
const PHONE_VERIFY_MAX_FAILURES = 5;
const PHONE_VERIFY_LOCK_MS = 15 * 60 * 1000;
const DEFAULT_PROBATION_EVAL_TEMPLATE_ID = "default-v1";

const phoneVerifySessions = new Map();
const phoneVerifyFailures = new Map();

const DEFAULT_QUESTIONS = [
  { id: "q-speed", label: "\uC791\uC5C5 \uC18D\uB3C4", type: "scale5", required: true, weight: 1.2, sortOrder: 1, active: true },
  { id: "q-quality", label: "\uC791\uC5C5 \uD488\uC9C8", type: "scale5", required: true, weight: 1.5, sortOrder: 2, active: true },
  { id: "q-safety", label: "\uC548\uC804 \u00B7 \uCCAD\uC18C", type: "scale5", required: true, weight: 1, sortOrder: 3, active: true },
  { id: "q-teamwork", label: "\uD611\uC5C5 \u00B7 \uCEE4\uBAE4\uB2C8\uCF00\uC774\uC158", type: "scale5", required: true, weight: 1, sortOrder: 4, active: true },
  { id: "q-customer", label: "\uACE0\uAC1D \uC751\uB300", type: "scale5", required: true, weight: 0.8, sortOrder: 5, active: true },
  { id: "q-rework", label: "\uC7AC\uC791\uC5C5 \uBC1C\uC0DD", type: "yesno", required: true, weight: 1, sortOrder: 6, active: true },
  { id: "q-attendance", label: "\uCD9C\uADFC \u00B7 \uC2DC\uAC04 \uC900\uC218", type: "scale5", required: true, weight: 1, sortOrder: 7, active: true },
  { id: "q-overall", label: "\uC885\uD569 \uD3C9\uAC00", type: "scale5", required: true, weight: 1.5, sortOrder: 8, active: true },
];

function createDefaultTemplate(now = new Date().toISOString()) {
  return {
    id: DEFAULT_PROBATION_EVAL_TEMPLATE_ID,
    name: "\uAE30\uBCF8 \uC218\uC2B5 \uD3C9\uAC00 \uC591\uC2DD",
    version: 1,
    questions: DEFAULT_QUESTIONS.map((row) => ({ ...row })),
    createdAt: now,
  };
}

function normalizeQuestion(raw, index) {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.id || "").trim();
  const label = String(raw.label || "").trim();
  if (!id || !label) return null;
  const type = raw.type === "yesno" || raw.type === "checkbox" ? raw.type : "scale5";
  const weight = Number(raw.weight);
  const sortOrder = Number.isFinite(Number(raw.sortOrder)) ? Number(raw.sortOrder) : index + 1;
  return {
    id,
    label,
    type,
    required: raw.required !== false,
    weight: Number.isFinite(weight) && weight > 0 ? weight : 1,
    sortOrder,
    active: raw.active !== false,
  };
}

export function normalizeProbationEvalTemplate(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.id || "").trim();
  if (!id) return null;
  const questions = (Array.isArray(raw.questions) ? raw.questions : [])
    .map((item, index) => normalizeQuestion(item, index))
    .filter(Boolean);
  questions.sort((a, b) => a.sortOrder - b.sortOrder);
  return {
    id,
    name: String(raw.name || "").trim() || "\uD3C9\uAC00 \uC591\uC2DD",
    version: Math.max(1, Math.round(Number(raw.version) || 1)),
    questions,
    createdAt: String(raw.createdAt || new Date().toISOString()),
  };
}

export function normalizeProbationEvalTemplates(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const normalized = list.map((item) => normalizeProbationEvalTemplate(item)).filter(Boolean);
  if (!normalized.some((row) => row.id === DEFAULT_PROBATION_EVAL_TEMPLATE_ID)) {
    normalized.unshift(createDefaultTemplate());
  }
  return normalized;
}

function normalizeAnswer(raw) {
  if (!raw || typeof raw !== "object") return null;
  const questionId = String(raw.questionId || "").trim();
  if (!questionId) return null;
  if (typeof raw.value === "boolean") return { questionId, value: raw.value };
  const num = Number(raw.value);
  if (!Number.isFinite(num)) return null;
  return { questionId, value: num };
}

export function normalizeProbationEvalRequest(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.id || "").trim();
  const token = String(raw.token || "").trim();
  const workDate = String(raw.workDate || "").slice(0, 10);
  const scheduleId = String(raw.scheduleId || "").trim();
  const probationWorkerId = String(raw.probationWorkerId || "").trim();
  const evaluatorWorkerId = String(raw.evaluatorWorkerId || "").trim();
  if (!id || !token || !workDate || !scheduleId || !probationWorkerId || !evaluatorWorkerId) return null;
  const status =
    raw.status === "sent" || raw.status === "submitted" || raw.status === "expired" ? raw.status : "pending";
  const selectionReason = raw.selectionReason === "highest_grade_fallback" ? "highest_grade_fallback" : "grade_match";
  const answers = (Array.isArray(raw.answers) ? raw.answers : [])
    .map((item) => normalizeAnswer(item))
    .filter(Boolean);
  return {
    id,
    token,
    workDate,
    scheduleId,
    siteName: String(raw.siteName || "").trim(),
    probationWorkerId,
    probationWorkerName: String(raw.probationWorkerName || "").trim(),
    evaluatorWorkerId,
    evaluatorName: String(raw.evaluatorName || "").trim(),
    evaluatorPhone: String(raw.evaluatorPhone || "").trim(),
    templateId: String(raw.templateId || DEFAULT_PROBATION_EVAL_TEMPLATE_ID).trim(),
    status,
    sentAt: raw.sentAt ? String(raw.sentAt) : undefined,
    submittedAt: raw.submittedAt ? String(raw.submittedAt) : undefined,
    reminderSentAt: raw.reminderSentAt ? String(raw.reminderSentAt) : undefined,
    selectionReason,
    answers: answers.length ? answers : undefined,
    totalScore: raw.totalScore != null && Number.isFinite(Number(raw.totalScore)) ? Number(raw.totalScore) : undefined,
  };
}

export function normalizeProbationEvalRequests(raw) {
  return (Array.isArray(raw) ? raw : [])
    .map((item) => normalizeProbationEvalRequest(item))
    .filter(Boolean);
}

export function probationEvalRequestKey(workDate, scheduleId, probationWorkerId) {
  return `${String(workDate).slice(0, 10)}:${String(scheduleId)}:${String(probationWorkerId)}`;
}

export function resolveActiveProbationEvalTemplate(templates, templateId) {
  const list = normalizeProbationEvalTemplates(templates);
  const targetId = String(templateId || DEFAULT_PROBATION_EVAL_TEMPLATE_ID).trim();
  return list.find((row) => row.id === targetId) || list[0] || createDefaultTemplate();
}

function computeAnswerScore(question, value) {
  if (question.type === "yesno") {
    const yes = value === true || value === 1;
    return yes ? 0 : 100;
  }
  if (question.type === "checkbox") {
    return value === true || value === 1 ? 100 : 0;
  }
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  const clamped = Math.min(5, Math.max(1, Math.round(num)));
  return ((clamped - 1) / 4) * 100;
}

export function computeTotalScore(answers, template) {
  const activeQuestions = template.questions.filter((row) => row.active);
  if (!activeQuestions.length) return 0;
  const answerMap = new Map(answers.map((row) => [row.questionId, row.value]));
  let weightedSum = 0;
  let weightTotal = 0;
  for (const question of activeQuestions) {
    const value = answerMap.get(question.id);
    if (value === undefined) continue;
    const score = computeAnswerScore(question, value);
    weightedSum += score * question.weight;
    weightTotal += question.weight;
  }
  if (!weightTotal) return 0;
  return Math.round((weightedSum / weightTotal) * 10) / 10;
}

function listTemplates(data = {}) {
  return normalizeProbationEvalTemplates(data.probationEvalTemplates);
}

function listRequests(data = {}) {
  return normalizeProbationEvalRequests(data.probationEvalRequests);
}

function capRequests(requests) {
  if (requests.length <= MAX_REQUESTS) return requests;
  return requests
    .slice()
    .sort((a, b) => String(b.workDate || "").localeCompare(String(a.workDate || "")))
    .slice(0, MAX_REQUESTS);
}

function saveProbationEvalPayload(patch, updatedBy) {
  for (let attempt = 0; attempt < SAVE_RETRY_ATTEMPTS; attempt += 1) {
    const state = getErpState();
    const data = state.data && typeof state.data === "object" ? state.data : {};
    const next = { ...data, ...patch };
    try {
      return saveErpState(next, state.version, updatedBy);
    } catch (error) {
      if (error?.status !== 409 || attempt === SAVE_RETRY_ATTEMPTS - 1) throw error;
    }
  }
  const err = new Error("PROBATION_EVAL_SAVE_FAILED");
  err.status = 500;
  throw err;
}

function generateToken() {
  return crypto.randomBytes(24).toString("hex");
}

function normalizePhone(phone) {
  return String(phone || "").replace(/\D/g, "");
}

function phoneLastFour(phone) {
  const digits = normalizePhone(phone);
  return digits.slice(-4);
}

function getRequestByToken(data, token) {
  const normalized = String(token || "").trim();
  if (!normalized) return null;
  return listRequests(data).find((row) => row.token === normalized) || null;
}

export function buildProbationEvalRequestsForSchedules(data, schedules, workDate, updatedBy = "probation-eval") {
  const rules = normalizeWorkerAiRules(data.workerAiRules);

  const workers = Array.isArray(data.workers) ? data.workers : [];
  const templates = listTemplates(data);
  const template = resolveActiveProbationEvalTemplate(templates, rules.probationEvalTemplateId);
  const existing = listRequests(data);
  const existingKeys = new Set(
    existing.map((row) => probationEvalRequestKey(row.workDate, row.scheduleId, row.probationWorkerId)),
  );
  const created = [];

  for (const schedule of schedules) {
    const dateKey = String(workDate || schedule.workDate || "").slice(0, 10);
    const evalSubjects = findEvalSubjectsOnSchedule(schedule, workers, rules);
    for (const { worker } of evalSubjects) {
      const key = probationEvalRequestKey(dateKey, schedule.id, worker.id);
      if (existingKeys.has(key)) continue;

      const evaluator = selectScheduleEvaluator(schedule, worker, workers, rules.probationEvalGrades);
      if (!evaluator) continue;

      const evaluatorPhone = normalizePhone(evaluator.worker.phone);
      if (!evaluatorPhone) continue;

      const request = {
        id: `pe-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
        token: generateToken(),
        workDate: dateKey,
        scheduleId: String(schedule.id ?? ""),
        siteName: resolveScScheduleSiteName(schedule) || String(schedule.projectName || schedule.clientName || "").trim(),
        probationWorkerId: String(worker.id ?? ""),
        probationWorkerName: String(worker.name || "").trim(),
        evaluatorWorkerId: String(evaluator.worker.id ?? ""),
        evaluatorName: String(evaluator.worker.name || evaluator.participantName || "").trim(),
        evaluatorPhone,
        templateId: template.id,
        status: "pending",
        selectionReason: evaluator.selectionReason,
      };

      created.push(request);
      existingKeys.add(key);
    }
  }

  if (!created.length) {
    return { created: [], skipped: 0, reason: "none" };
  }

  const nextRequests = capRequests([...created, ...existing]);
  saveProbationEvalPayload({ probationEvalRequests: nextRequests }, updatedBy);
  return { created, skipped: 0, reason: "ok" };
}

export function getPublicProbationEvalPayload(token) {
  const state = getErpState();
  const data = state.data && typeof state.data === "object" ? state.data : {};
  const request = getRequestByToken(data, token);
  if (!request) {
    return { ok: false, status: 404, error: "\uD3C9\uAC00 \uC694\uCCAD\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." };
  }
  if (request.status === "expired") {
    return { ok: false, status: 410, error: "\uB9CC\uB8CC\uB41C \uD3C9\uAC00 \uC694\uCCAD\uC785\uB2C8\uB2E4." };
  }

  const template = resolveActiveProbationEvalTemplate(listTemplates(data), request.templateId);
  const phoneHint = phoneLastFour(request.evaluatorPhone);
  const session = phoneVerifySessions.get(token);
  const phoneVerified = Boolean(session && session.expiresAt > Date.now());

  return {
    ok: true,
    request: {
      id: request.id,
      workDate: request.workDate,
      siteName: request.siteName,
      probationWorkerName: request.probationWorkerName,
      evaluatorName: request.evaluatorName,
      status: request.status,
      phoneVerified,
      phoneHint: phoneHint ? `\u2022\u2022\u2022\u2022${phoneHint}` : "",
      submittedAt: request.submittedAt || null,
      totalScore: request.totalScore ?? null,
      template: {
        id: template.id,
        name: template.name,
        questions: template.questions
          .filter((row) => row.active)
          .map((row) => ({
            id: row.id,
            label: row.label,
            type: row.type,
            required: row.required,
          })),
      },
    },
  };
}

export function verifyProbationEvalPhoneLastFour(token, phoneLast4Input) {
  const state = getErpState();
  const data = state.data && typeof state.data === "object" ? state.data : {};
  const request = getRequestByToken(data, token);
  if (!request) {
    return { ok: false, status: 404, error: "\uD3C9\uAC00 \uC694\uCCAD\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." };
  }
  if (request.status === "submitted") {
    return { ok: true, phoneVerified: true };
  }

  const lock = phoneVerifyFailures.get(token);
  if (lock?.lockedUntil && lock.lockedUntil > Date.now()) {
    return { ok: false, status: 429, error: "\uC778\uC99D \uC2DC\uB3C4 \uD56D\uC218\uB97C \uCD08\uACFC\uD588\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694." };
  }

  const input = String(phoneLast4Input || "").replace(/\D/g, "").slice(-4);
  if (input.length !== 4) {
    return { ok: false, status: 400, error: "\uD578\uB4DC\uD3F0 \uB4A4 4\uC790\uB9AC\uB97C \uC785\uB825\uD574 \uC8FC\uC138\uC694." };
  }

  const expected = phoneLastFour(request.evaluatorPhone);
  if (input !== expected) {
    const prev = phoneVerifyFailures.get(token) || { count: 0 };
    const count = prev.count + 1;
    const next = { count };
    if (count >= PHONE_VERIFY_MAX_FAILURES) {
      next.lockedUntil = Date.now() + PHONE_VERIFY_LOCK_MS;
    }
    phoneVerifyFailures.set(token, next);
    return { ok: false, status: 403, error: "\uD578\uB4DC\uD3F0 \uB4A4 4\uC790\uB9AC\uAC00 \uC77C\uCE58\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4." };
  }

  phoneVerifyFailures.delete(token);
  phoneVerifySessions.set(token, { expiresAt: Date.now() + PHONE_VERIFY_TTL_MS });
  return { ok: true, phoneVerified: true };
}

function requirePhoneVerified(token) {
  const session = phoneVerifySessions.get(token);
  if (!session || session.expiresAt <= Date.now()) {
    return { ok: false, status: 403, error: "\uD734\uB300\uD3F0 \uC778\uC99D\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." };
  }
  return { ok: true };
}

export function submitProbationEvalAnswers(token, body = {}) {
  const state = getErpState();
  const data = state.data && typeof state.data === "object" ? state.data : {};
  const request = getRequestByToken(data, token);
  if (!request) {
    return { ok: false, status: 404, error: "\uD3C9\uAC00 \uC694\uCCAD\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." };
  }
  if (request.status === "submitted") {
    return {
      ok: true,
      request: {
        status: request.status,
        totalScore: request.totalScore,
        submittedAt: request.submittedAt,
      },
    };
  }
  if (request.status === "expired") {
    return { ok: false, status: 410, error: "\uB9CC\uB8CC\uB41C \uD3C9\uAC00 \uC694\uCCAD\uC785\uB2C8\uB2E4." };
  }

  const verify = requirePhoneVerified(token);
  if (!verify.ok) return verify;

  const template = resolveActiveProbationEvalTemplate(listTemplates(data), request.templateId);
  const activeQuestions = template.questions.filter((row) => row.active);
  const rawAnswers = Array.isArray(body.answers) ? body.answers : [];
  const answers = rawAnswers.map((item) => normalizeAnswer(item)).filter(Boolean);

  for (const question of activeQuestions) {
    if (!question.required) continue;
    const answer = answers.find((row) => row.questionId === question.id);
    if (!answer) {
      return { ok: false, status: 400, error: `\uD544\uC218 \uD56D\uBAA9\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694: ${question.label}` };
    }
  }

  const totalScore = computeTotalScore(answers, template);
  const submittedAt = new Date().toISOString();
  const nextRequests = listRequests(data).map((row) =>
    row.token === token
      ? {
          ...row,
          status: "submitted",
          answers,
          totalScore,
          submittedAt,
        }
      : row,
  );

  saveProbationEvalPayload({ probationEvalRequests: nextRequests }, "probation-eval-submit");
  phoneVerifySessions.delete(token);

  return {
    ok: true,
    request: {
      status: "submitted",
      totalScore,
      submittedAt,
    },
  };
}

export function updateProbationEvalRequests(nextRequests, updatedBy = "system") {
  saveProbationEvalPayload({ probationEvalRequests: capRequests(normalizeProbationEvalRequests(nextRequests)) }, updatedBy);
}

export function updateProbationEvalTemplates(nextTemplates, updatedBy = "system") {
  saveProbationEvalPayload(
    { probationEvalTemplates: normalizeProbationEvalTemplates(nextTemplates) },
    updatedBy,
  );
}

export function formatProbationEvalTemplateVars(request) {
  const baseUrl = config.alimtalk.erpBaseUrl.replace(/\/$/, "");
  const subjectName = String(request.probationWorkerName || "").trim() || "-";
  return {
    date: String(request.workDate || "").slice(0, 10),
    siteName: String(request.siteName || "").trim() || "-",
    probationWorkerName: subjectName,
    subjectWorkerName: subjectName,
    token: String(request.token || "").trim(),
    surveyUrl: `${baseUrl}/eval/${request.token}`,
  };
}

export function sanitizeProbationEvalRequestForAdmin(request) {
  if (!request) return null;
  const baseUrl = config.alimtalk.erpBaseUrl.replace(/\/$/, "");
  return {
    ...request,
    surveyUrl: `${baseUrl}/eval/${request.token}`,
  };
}
