import { getErpState, saveErpState } from "./db.mjs";
import { buildWorkerPortalStatement } from "./workerPortal.mjs";

const MAX_ACKS = 5000;
const MAX_SIGNATURE_LENGTH = 280_000;

export function workerPortalPreviousMonthKey(baseMonthKey) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(baseMonthKey || ""));
  if (!match) return "";
  const date = new Date(Number(match[1]), Number(match[2]) - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function currentStatementMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function isWorkerPortalAckEligibleMonth(monthKey, baseMonthKey = currentStatementMonthKey()) {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return false;
  return monthKey <= baseMonthKey;
}

export function makeWorkerPortalAckKey(workerId, monthKey) {
  return `${String(workerId)}::${monthKey}`;
}

export function listWorkerPortalStatementAcks(data = {}) {
  return Array.isArray(data.workerPortalStatementAcks) ? data.workerPortalStatementAcks : [];
}

export function findWorkerPortalStatementAck(data = {}, workerId, monthKey) {
  const key = makeWorkerPortalAckKey(workerId, monthKey);
  return listWorkerPortalStatementAcks(data).find((row) => makeWorkerPortalAckKey(row.workerId, row.monthKey) === key) || null;
}

function validateSignatureDataUrl(value) {
  const text = String(value || "").trim();
  if (!text.startsWith("data:image/png;base64,")) {
    return { ok: false, error: "\uC11C\uBA85 \uC774\uBBF8\uC9C0\uAC00 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4." };
  }
  if (text.length > MAX_SIGNATURE_LENGTH) {
    return { ok: false, error: "\uC11C\uBA85 \uC774\uBBF8\uC9C0\uAC00 \uB108\uBB34 \uD07D\uB2C8\uB2E4. \uB2E4\uC2DC \uC11C\uBA85\uD574 \uC8FC\uC138\uC694." };
  }
  const payload = text.slice("data:image/png;base64,".length);
  if (payload.length < 80) {
    return { ok: false, error: "\uC11C\uBA85\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694." };
  }
  return { ok: true, signatureDataUrl: text };
}

export function getWorkerPortalAcknowledgment(workerPortal, monthKey) {
  const state = getErpState();
  const data = state.data && typeof state.data === "object" ? state.data : {};
  const existing = findWorkerPortalStatementAck(data, workerPortal.workerId, monthKey);
  const eligible = isWorkerPortalAckEligibleMonth(monthKey);
  const statement = buildWorkerPortalStatement(workerPortal.workerName, monthKey, data);
  return {
    monthKey,
    eligible,
    currentMonthKey: currentStatementMonthKey(),
    previousMonthKey: workerPortalPreviousMonthKey(),
    canSubmit: eligible && (statement.rows || []).length > 0 && !existing,
    acknowledgment: existing
      ? {
          confirmedAt: existing.confirmedAt,
          workerName: existing.workerName,
          monthKey: existing.monthKey,
          signatureDataUrl: existing.signatureDataUrl,
          lineCount: existing.lineCount,
          grossPay: existing.grossPay,
          fee: existing.fee,
          netPay: existing.netPay,
        }
      : null,
  };
}

export function saveWorkerPortalAcknowledgment(workerPortal, input = {}) {
  const monthKey = String(input.monthKey || "").trim();
  if (!/^\d{4}-\d{2}$/.test(monthKey)) {
    return { ok: false, status: 400, error: "\uC6D4(YYYY-MM)\uC744 \uC9C0\uC815\uD574 \uC8FC\uC138\uC694." };
  }
  if (!isWorkerPortalAckEligibleMonth(monthKey)) {
    return {
      ok: false,
      status: 400,
      error: "\uBBF8\uB798 \uC6D4\uC740 \uD655\uC778 \uC800\uC7A5\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.",
    };
  }

  const signatureCheck = validateSignatureDataUrl(input.signatureDataUrl);
  if (!signatureCheck.ok) {
    return { ok: false, status: 400, error: signatureCheck.error };
  }

  const state = getErpState();
  const data = state.data && typeof state.data === "object" ? state.data : {};
  const existing = findWorkerPortalStatementAck(data, workerPortal.workerId, monthKey);
  if (existing) {
    return { ok: false, status: 409, error: "\uC774\uBBF8 \uD655\uC778\uC774 \uC644\uB8CC\uB41C \uC6D4\uC785\uB2C8\uB2E4." };
  }

  const statement = buildWorkerPortalStatement(workerPortal.workerName, monthKey, data);
  if (!(statement.rows || []).length) {
    return { ok: false, status: 400, error: "\uD655\uC778\uD560 \uC2DC\uACF5 \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." };
  }

  const entry = {
    id: `wp-ack-${Date.now()}`,
    workerId: workerPortal.workerId,
    workerName: statement.workerName,
    monthKey,
    signatureDataUrl: signatureCheck.signatureDataUrl,
    confirmedAt: new Date().toISOString(),
    portalLoginId: workerPortal.portalLoginId || "",
    lineCount: statement.rows.length,
    grossPay: statement.summary?.grossPay || 0,
    fee: statement.summary?.fee || 0,
    netPay: statement.summary?.netPay || 0,
  };

  const acks = listWorkerPortalStatementAcks(data);
  const nextAcks = [entry, ...acks.filter((row) => makeWorkerPortalAckKey(row.workerId, row.monthKey) !== makeWorkerPortalAckKey(entry.workerId, entry.monthKey))].slice(
    0,
    MAX_ACKS,
  );

  const saved = saveErpState(
    { ...data, workerPortalStatementAcks: nextAcks },
    state.version,
    `portal-ack:${entry.workerName}:${monthKey}`,
  );

  return {
    ok: true,
    acknowledgment: {
      confirmedAt: entry.confirmedAt,
      workerName: entry.workerName,
      monthKey: entry.monthKey,
      signatureDataUrl: entry.signatureDataUrl,
      lineCount: entry.lineCount,
      grossPay: entry.grossPay,
      fee: entry.fee,
      netPay: entry.netPay,
    },
    version: saved.version,
  };
}
