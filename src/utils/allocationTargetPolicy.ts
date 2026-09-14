/**
 * Receipt allocation target modes for register UX / planner.
 * Controls how registerCanonicalReceipt scopes auto-allocation.
 */

export type AllocationTargetMode =
  | "STATEMENT"
  | "PERIOD"
  | "SELECTED_SALES"
  | "GLOBAL_FIFO"
  | "UNAPPLIED"
  | "OPENING_ADJUSTMENT"; // forbidden on Receipt

export type AllocationTargetInput = {
  mode: AllocationTargetMode;
  statementId?: string | null;
  statementIds?: string[];
  periodStart?: string | null;
  periodEnd?: string | null;
  saleIds?: Array<string | number>;
  allocations?: Array<{ saleId: string | number; amount: number }>;
};

export type ReceiptAllocationDisplayStatus =
  | "미충당"
  | "부분충당"
  | "전액충당"
  | "선수금";

export const GLOBAL_FIFO_WARNING =
  "과거 입금이 누락된 경우 오래된 매출에 잘못 충당될 수 있습니다.";

export const ALLOCATION_TARGET_MODE_LABELS: Record<AllocationTargetMode, string> = {
  UNAPPLIED: "우선 미충당",
  STATEMENT: "특정 내역서",
  PERIOD: "기간",
  SELECTED_SALES: "매출 선택",
  GLOBAL_FIFO: "오래된 미수부터",
  OPENING_ADJUSTMENT: "기초 조정(입금전표 금지)",
};

export const ALLOCATION_TARGET_MODE_OPTIONS: Array<{
  value: AllocationTargetMode;
  label: string;
  hint: string;
}> = [
  { value: "UNAPPLIED", label: "우선 미충당", hint: "입금만 등록하고 배정은 나중에" },
  { value: "STATEMENT", label: "특정 내역서", hint: "발송 내역서 범위 FIFO" },
  { value: "PERIOD", label: "기간", hint: "지정 기간 매출에 배정" },
  { value: "SELECTED_SALES", label: "매출 선택", hint: "선택한 매출에만 배정" },
  { value: "GLOBAL_FIFO", label: "오래된 미수부터", hint: "회사 전체 FIFO (주의)" },
];

function money(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

export function allocationTargetModeLabel(mode: AllocationTargetMode | string | null | undefined) {
  const key = String(mode || "") as AllocationTargetMode;
  return ALLOCATION_TARGET_MODE_LABELS[key] || String(mode || "");
}

/** Throws if mode is forbidden on Receipt create/register. */
export function assertReceiptTargetMode(mode: AllocationTargetMode): void {
  if (mode === "OPENING_ADJUSTMENT") {
    throw new Error("OPENING_ADJUSTMENT는 입금전표 배정 모드로 사용할 수 없습니다.");
  }
}

/** Default register mode: without an explicit target, keep cash unapplied. */
export function resolveDefaultTargetMode(hasExplicitTarget: boolean): AllocationTargetMode {
  return hasExplicitTarget ? "STATEMENT" : "UNAPPLIED";
}

/**
 * Infer a sensible UI default from partial register form state.
 * Prefer explicit initialTargetMode when present.
 */
export function resolveDefaultAllocationTargetMode(input: {
  initialTargetMode?: AllocationTargetMode | null;
  initialAllocations?: Array<{ saleId: string | number; amount: number }> | null;
  initialPeriodStart?: string | null;
  initialPeriodEnd?: string | null;
  sentStatementId?: string | null;
}): AllocationTargetMode {
  if (input.initialTargetMode) {
    if (input.initialTargetMode === "OPENING_ADJUSTMENT") return "UNAPPLIED";
    return input.initialTargetMode;
  }
  if (input.initialAllocations && input.initialAllocations.length > 0) return "SELECTED_SALES";
  if (input.initialPeriodStart || input.initialPeriodEnd) return "PERIOD";
  if (input.sentStatementId) return "STATEMENT";
  return resolveDefaultTargetMode(false);
}

/** autoAllocate for register API — never silent company-wide FIFO. */
export function shouldAutoAllocate(mode: AllocationTargetMode) {
  return mode !== "UNAPPLIED" && mode !== "SELECTED_SALES" && mode !== "OPENING_ADJUSTMENT";
}

/**
 * Cash application status from identity amounts.
 * 선수금 = nothing applied yet (full prepaid); 미충당 kept for zero-gross edge.
 */
export function receiptAllocationStatus(
  gross: unknown,
  allocated: unknown,
  unallocated: unknown,
): ReceiptAllocationDisplayStatus {
  const g = money(gross);
  const a = money(allocated);
  const u = money(unallocated);
  if (a <= 0 && u > 0) return "선수금";
  if (a <= 0) return "미충당";
  if (u <= 0 && a >= g) return "전액충당";
  if (u <= 0) return "전액충당";
  return "부분충당";
}

export function receiptDisplayStatusLabel(status: string | null | undefined) {
  const key = String(status || "").trim();
  if (!key) return "";
  if (key === "cancelled" || key === "reversed" || key === "취소") return "취소";
  if (key === "identity_broken" || key === "확인 필요") return "확인 필요";
  return key;
}
