import { getSaleTotalBill, getSaleWorkerLines } from "./saleBilling";

type SaleDuplicateLike = {
  id?: number | string;
  date?: string;
  client?: string;
  site?: string;
  amount?: number;
  worker?: string;
  workers?: { worker?: string }[];
};

function normalizeSearchText(value?: string | null) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function getSortedWorkerNames(row: SaleDuplicateLike) {
  return getSaleWorkerLines(row)
    .map((line) => normalizeSearchText(line.worker))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "ko"));
}

export function buildSaleDuplicateKey(row: SaleDuplicateLike) {
  const workers = getSortedWorkerNames(row).join(",");

  return [
    normalizeSearchText(row.date),
    normalizeSearchText(row.client),
    normalizeSearchText(row.site),
    String(getSaleTotalBill(row) || row.amount || 0),
    workers,
  ].join("\u0001");
}

export function buildSaleClientWorkerDuplicateKey(row: SaleDuplicateLike) {
  const workers = getSortedWorkerNames(row).join(",");

  return [
    normalizeSearchText(row.date),
    normalizeSearchText(row.client),
    workers,
  ].join("\u0001");
}

export function findSalesWithSameClientWorkerDate(
  sales: SaleDuplicateLike[] = [],
  candidate: SaleDuplicateLike,
  excludeId?: number | string | null
) {
  const candidateKey = buildSaleClientWorkerDuplicateKey(candidate);
  return sales.filter((row) => {
    if (excludeId != null && String(row.id) === String(excludeId)) return false;
    return buildSaleClientWorkerDuplicateKey(row) === candidateKey;
  });
}

export function buildSaleDuplicateIndex(sales: SaleDuplicateLike[] = []) {
  const counts = new Map<string, number>();
  const rowsByKey = new Map<string, SaleDuplicateLike[]>();

  sales.forEach((row) => {
    const key = buildSaleDuplicateKey(row);
    counts.set(key, (counts.get(key) || 0) + 1);
    const bucket = rowsByKey.get(key) || [];
    bucket.push(row);
    rowsByKey.set(key, bucket);
  });

  const duplicateKeys = new Set<string>();
  counts.forEach((count, key) => {
    if (count > 1) duplicateKeys.add(key);
  });

  return { counts, duplicateKeys, rowsByKey };
}

export function isDuplicateSale(row: SaleDuplicateLike, duplicateKeys: Set<string>) {
  return duplicateKeys.has(buildSaleDuplicateKey(row));
}

export function countDuplicateSales(sales: SaleDuplicateLike[] = []) {
  const { duplicateKeys, rowsByKey } = buildSaleDuplicateIndex(sales);
  let rowCount = 0;
  duplicateKeys.forEach((key) => {
    rowCount += rowsByKey.get(key)?.length || 0;
  });
  return { groupCount: duplicateKeys.size, rowCount };
}
