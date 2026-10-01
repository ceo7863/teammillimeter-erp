import type { ScSchedule, ScScheduleWorkerInfo } from "@/utils/scSchedules";
import { extractScParticipantExtras, parseScParticipantMoney } from "@/utils/scSchedules";

export const CALWALK_SOURCE_TYPE = "CALWALK" as const;

/** Provenance written on a sale worker line imported from a CalWalk schedule participant. */
export type CalwalkLineProvenance = {
  sourceType: typeof CALWALK_SOURCE_TYPE;
  sourceScheduleId: string;
  sourceMemberId: string;
  sourceParticipantName: string;
  sourceExpenseItemId: string;
  sourceUpdatedAt: string;
  importedAt: string;
  /** Raw CalWalk values at import time: null = not provided, 0 = explicit zero. */
  sourceMeal: number | null;
  sourceExpense: number | null;
  sourceHash: string;
};

type LineLike = {
  worker?: string;
  meal?: string | number | null;
  expense?: string | number | null;
} & Partial<CalwalkLineProvenance>;

type SaleLike = {
  id?: string | number;
  scScheduleId?: string | number | null;
  workers?: LineLike[];
};

function fnv1aHex(text: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** Stable across re-syncs: excludes syncedAt/importedAt; changes only when the source amounts or identity change. */
export function computeCalwalkSourceHash(input: {
  scheduleId: string;
  memberKey: string;
  meal: number | null;
  expense: number | null;
  expenseItemIds?: string[];
}) {
  const canonical = JSON.stringify([
    String(input.scheduleId || ""),
    String(input.memberKey || ""),
    input.meal == null ? null : Number(input.meal),
    input.expense == null ? null : Number(input.expense),
    [...(input.expenseItemIds || [])].map(String).sort(),
  ]);
  return `cw1:${fnv1aHex(canonical)}`;
}

export function resolveCalwalkParticipantExtras(workerInfo: Partial<ScScheduleWorkerInfo>) {
  const extras = extractScParticipantExtras(workerInfo as Record<string, unknown>);
  return {
    meal: parseScParticipantMoney(workerInfo.meal) ?? extras.meal,
    expense: parseScParticipantMoney(workerInfo.expense) ?? extras.expense,
  };
}

function participantKey(workerInfo: Partial<ScScheduleWorkerInfo>) {
  return String(workerInfo.participantName || workerInfo.name || "").trim();
}

export function buildCalwalkLineProvenance(
  schedule: Pick<ScSchedule, "id" | "sourceUpdatedAt">,
  workerInfo: Partial<ScScheduleWorkerInfo>,
  importedAt = new Date().toISOString(),
): CalwalkLineProvenance {
  const { meal, expense } = resolveCalwalkParticipantExtras(workerInfo);
  const memberId = String(workerInfo.memberId || "").trim();
  const name = participantKey(workerInfo);
  const expenseItemIds = Array.isArray(workerInfo.expenseItemIds) ? workerInfo.expenseItemIds : [];
  return {
    sourceType: CALWALK_SOURCE_TYPE,
    sourceScheduleId: String(schedule.id || "").trim(),
    sourceMemberId: memberId,
    sourceParticipantName: name,
    sourceExpenseItemId: expenseItemIds.join(","),
    sourceUpdatedAt: String(schedule.sourceUpdatedAt || "").trim(),
    importedAt,
    sourceMeal: meal,
    sourceExpense: expense,
    sourceHash: computeCalwalkSourceHash({
      scheduleId: String(schedule.id || ""),
      memberKey: memberId || name,
      meal,
      expense,
      expenseItemIds,
    }),
  };
}

export function hasCalwalkProvenance(line: LineLike | null | undefined): line is LineLike & CalwalkLineProvenance {
  return Boolean(line && line.sourceType === CALWALK_SOURCE_TYPE && String(line.sourceScheduleId || "").trim());
}

export function stripCalwalkProvenance<T extends Record<string, unknown>>(line: T): T {
  const next = { ...line };
  for (const key of [
    "sourceType",
    "sourceScheduleId",
    "sourceMemberId",
    "sourceParticipantName",
    "sourceExpenseItemId",
    "sourceUpdatedAt",
    "importedAt",
    "sourceMeal",
    "sourceExpense",
    "sourceHash",
  ]) {
    delete (next as Record<string, unknown>)[key];
  }
  return next;
}

export type CalwalkExtrasField = "meal" | "expense";

export type CalwalkFieldStatus =
  | "unchanged"
  | "update"
  | "remove"
  | "conflict"
  | "source_unclear"
  | "suppressed";

export type CalwalkFieldPreview = {
  field: CalwalkExtrasField;
  calwalk: number | null;
  erp: string;
  planned: string;
  delta: number;
  status: CalwalkFieldStatus;
  source: "CALWALK" | "ERP_OVERRIDE" | "UNKNOWN";
  message: string;
};

export type CalwalkRowStatus = "matched" | "added" | "removed" | "ambiguous";

export type CalwalkReimportRow = {
  key: string;
  worker: string;
  memberId: string;
  rowStatus: CalwalkRowStatus;
  fields: CalwalkFieldPreview[];
  warnings: string[];
};

export type CalwalkReimportPreview = {
  scheduleId: string;
  saleId: string;
  applicable: boolean;
  rows: CalwalkReimportRow[];
  changeCount: number;
  conflictCount: number;
  warningCount: number;
};

export const CALWALK_REIMPORT_MESSAGES = {
  unchanged: "\uBCC0\uACBD \uC5C6\uC74C",
  update: "CalWalk \uAC12\uC73C\uB85C \uAC31\uC2E0 \uC608\uC815",
  remove: "CalWalk\uC5D0\uC11C \uC0AD\uC81C\uB428 \u00B7 \uC81C\uAC70 \uC608\uC815",
  conflict: "ERP\uC5D0\uC11C \uC218\uC815\uB41C \uAC12 \u00B7 \uC790\uB3D9 \uBCC0\uACBD\uD558\uC9C0 \uC54A\uC74C",
  sourceUnclear: "\uCD9C\uCC98 \uBD88\uBA85 \u00B7 CalWalk\uC5D0 \uAC12 \uC5C6\uC74C",
  legacyMismatch: "\uC774\uC804 \uAC00\uC838\uC624\uAE30 \uAE30\uB85D \uC5C6\uC74C \u00B7 \uD655\uC778 \uD544\uC694",
  suppressed: "\uC2DD\uB300 \uD3EC\uD568 \uAC70\uB798\uCC98",
  stale: "CalWalk \uC6D0\uBCF8\uC774 \uC774\uC804 \uAC00\uC838\uC624\uAE30\uBCF4\uB2E4 \uC624\uB798\uB428",
  ambiguous: "\uAC19\uC740 \uC774\uB984 \uCC38\uC5EC\uC790\uAC00 \uC5EC\uB7EC \uBA85 \u00B7 \uC790\uB3D9 \uB9E4\uCE6D\uD558\uC9C0 \uC54A\uC74C",
  added: "CalWalk\uC5D0 \uCD94\uAC00\uB41C \uCC38\uC5EC\uC790",
  removed: "CalWalk\uC5D0\uC11C \uBE60\uC9C4 \uCC38\uC5EC\uC790",
} as const;

function toAmountString(value: number | null) {
  return value == null ? "" : String(value);
}

function parseLineAmount(value: unknown): number | null {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  const amount = Number(text.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(amount) ? amount : null;
}

function sameAmount(a: unknown, b: unknown) {
  return (parseLineAmount(a) ?? 0) === (parseLineAmount(b) ?? 0);
}

function previewField(
  field: CalwalkExtrasField,
  line: LineLike | null,
  calwalk: number | null,
  options: { suppressed?: boolean; stale?: boolean } = {},
): CalwalkFieldPreview {
  const erp = String(line?.[field] ?? "").trim();
  const known = hasCalwalkProvenance(line);
  const previousSource = known ? (field === "meal" ? line.sourceMeal ?? null : line.sourceExpense ?? null) : undefined;
  const userOverride = known && !sameAmount(erp, toAmountString(previousSource ?? null));
  const keep = (status: CalwalkFieldStatus, message: string, source: CalwalkFieldPreview["source"]) => ({
    field,
    calwalk,
    erp,
    planned: erp,
    delta: 0,
    status,
    source,
    message,
  });
  const change = (planned: string, status: CalwalkFieldStatus, message: string) => ({
    field,
    calwalk,
    erp,
    planned,
    delta: (parseLineAmount(planned) ?? 0) - (parseLineAmount(erp) ?? 0),
    status,
    source: "CALWALK" as const,
    message,
  });

  if (options.suppressed) return keep("suppressed", CALWALK_REIMPORT_MESSAGES.suppressed, "CALWALK");
  if (options.stale) return keep("conflict", CALWALK_REIMPORT_MESSAGES.stale, "CALWALK");
  if (!line) {
    return calwalk == null
      ? keep("unchanged", CALWALK_REIMPORT_MESSAGES.unchanged, "CALWALK")
      : change(toAmountString(calwalk), "update", CALWALK_REIMPORT_MESSAGES.added);
  }

  if (calwalk == null) {
    if (known && previousSource != null) {
      if (userOverride) return keep("conflict", CALWALK_REIMPORT_MESSAGES.conflict, "ERP_OVERRIDE");
      return change("", "remove", CALWALK_REIMPORT_MESSAGES.remove);
    }
    if (!known && parseLineAmount(erp)) {
      return keep("source_unclear", CALWALK_REIMPORT_MESSAGES.sourceUnclear, "UNKNOWN");
    }
    return keep("unchanged", CALWALK_REIMPORT_MESSAGES.unchanged, known ? "CALWALK" : "UNKNOWN");
  }

  if (sameAmount(erp, calwalk)) {
    return keep("unchanged", CALWALK_REIMPORT_MESSAGES.unchanged, "CALWALK");
  }
  if (!known) return keep("conflict", CALWALK_REIMPORT_MESSAGES.legacyMismatch, "UNKNOWN");
  if (userOverride) return keep("conflict", CALWALK_REIMPORT_MESSAGES.conflict, "ERP_OVERRIDE");
  return change(toAmountString(calwalk), "update", CALWALK_REIMPORT_MESSAGES.update);
}

function lineMatchesParticipant(line: LineLike, info: Partial<ScScheduleWorkerInfo>, scheduleId: string) {
  const memberId = String(info.memberId || "").trim();
  if (
    memberId
    && hasCalwalkProvenance(line)
    && line.sourceScheduleId === scheduleId
    && String(line.sourceMemberId || "").trim()
  ) {
    return String(line.sourceMemberId).trim() === memberId;
  }
  const worker = String(line.worker || "").trim();
  if (!worker) return false;
  const names = new Set([String(info.name || "").trim(), String(info.participantName || "").trim()].filter(Boolean));
  return names.has(worker);
}

function isSourceOlder(incoming: string, imported: string) {
  if (!incoming || !imported) return false;
  const a = Date.parse(incoming);
  const b = Date.parse(imported);
  return Number.isFinite(a) && Number.isFinite(b) && a < b;
}

/**
 * Read-only comparison of a registered sale with the current CalWalk schedule.
 * Identity: same scheduleId, then memberId (or exact participant name within that schedule).
 * Never sums across schedules or dates, never fills from history, never overwrites ERP overrides.
 */
export function buildCalwalkReimportPreview(
  sale: SaleLike | null | undefined,
  schedule: Pick<ScSchedule, "id" | "sourceUpdatedAt">,
  participants: Array<Partial<ScScheduleWorkerInfo>>,
  options: { mealIncluded?: boolean } = {},
): CalwalkReimportPreview {
  const scheduleId = String(schedule.id || "").trim();
  const saleId = String(sale?.id ?? "");
  const empty: CalwalkReimportPreview = {
    scheduleId,
    saleId,
    applicable: false,
    rows: [],
    changeCount: 0,
    conflictCount: 0,
    warningCount: 0,
  };
  if (!sale || !scheduleId || String(sale.scScheduleId ?? "").trim() !== scheduleId) return empty;

  const lines = (sale.workers || []).filter((line) => String(line?.worker || "").trim());
  const nameCounts = new Map<string, number>();
  for (const info of participants) {
    const key = participantKey(info);
    if (key) nameCounts.set(key, (nameCounts.get(key) || 0) + 1);
  }

  const usedLines = new Set<number>();
  const rows: CalwalkReimportRow[] = participants.map((info) => {
    const key = participantKey(info);
    const memberId = String(info.memberId || "").trim();
    const worker = String(info.name || key).trim();
    const extras = resolveCalwalkParticipantExtras(info);
    const ambiguous = !memberId && (nameCounts.get(key) || 0) > 1;
    if (ambiguous) {
      return {
        key,
        worker,
        memberId,
        rowStatus: "ambiguous" as const,
        fields: [],
        warnings: [CALWALK_REIMPORT_MESSAGES.ambiguous],
      };
    }
    const lineIndex = lines.findIndex(
      (line, index) => !usedLines.has(index) && lineMatchesParticipant(line, info, scheduleId),
    );
    const line = lineIndex >= 0 ? lines[lineIndex] : null;
    if (lineIndex >= 0) usedLines.add(lineIndex);
    const stale = Boolean(
      line
      && hasCalwalkProvenance(line)
      && isSourceOlder(String(schedule.sourceUpdatedAt || ""), String(line.sourceUpdatedAt || "")),
    );
    return {
      key,
      worker,
      memberId,
      rowStatus: line ? ("matched" as const) : ("added" as const),
      fields: [
        previewField("meal", line, extras.meal, { suppressed: Boolean(options.mealIncluded), stale }),
        previewField("expense", line, extras.expense, { stale }),
      ],
      warnings: line ? (stale ? [CALWALK_REIMPORT_MESSAGES.stale] : []) : [CALWALK_REIMPORT_MESSAGES.added],
    };
  });

  const ambiguousNames = new Set(rows.filter((row) => row.rowStatus === "ambiguous").map((row) => row.key));
  lines.forEach((line, index) => {
    if (usedLines.has(index)) return;
    if (ambiguousNames.has(String(line.worker || "").trim())) return;
    rows.push({
      key: String(line.worker || "").trim(),
      worker: String(line.worker || "").trim(),
      memberId: String(line.sourceMemberId || ""),
      rowStatus: "removed",
      fields: (["meal", "expense"] as const).map((field) => previewField(field, line, null)),
      warnings: [CALWALK_REIMPORT_MESSAGES.removed],
    });
  });

  let changeCount = 0;
  let conflictCount = 0;
  let warningCount = 0;
  for (const row of rows) {
    warningCount += row.warnings.length;
    for (const field of row.fields) {
      if (field.status === "update" || field.status === "remove") changeCount += 1;
      if (field.status === "conflict") conflictCount += 1;
      if (field.status === "source_unclear") warningCount += 1;
    }
  }
  return { scheduleId, saleId, applicable: true, rows, changeCount, conflictCount, warningCount };
}

export function formatCalwalkAmount(value: number | null | undefined) {
  if (value == null) return "-";
  return `${Number(value).toLocaleString("ko-KR")}\uC6D0`;
}
