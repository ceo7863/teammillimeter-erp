export type SortDirection = "asc" | "desc";

export function compareSortValues(a: unknown, b: unknown, direction: SortDirection) {
  const factor = direction === "asc" ? 1 : -1;
  const aEmpty = a == null || a === "";
  const bEmpty = b == null || b === "";
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;

  if (typeof a === "number" && typeof b === "number") {
    return (a - b) * factor;
  }

  return String(a).localeCompare(String(b), "ko-KR") * factor;
}

export function sortRowsByColumn<T>(
  rows: T[],
  getValue: (row: T) => unknown,
  direction: SortDirection
) {
  return [...rows].sort((a, b) => compareSortValues(getValue(a), getValue(b), direction));
}
