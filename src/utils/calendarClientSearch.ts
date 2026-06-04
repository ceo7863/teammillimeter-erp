import type { ClientDepositMatchSource } from "@/utils/clientDepositAliases";

export type CalendarClientSearchRow = {
  client: string;
  monthBill: number;
  monthPaid: number;
  monthUnpaid: number;
  monthCount: number;
  latestDate: string;
  firstDateInMonth: string;
};

export const CALENDAR_CLIENT_SEARCH_RESULT_LIMIT = 200;

function normalizeHaystackPart(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export function buildCalendarClientSearchHaystacks(
  rows: CalendarClientSearchRow[],
  clients: ClientDepositMatchSource[] = [],
): Map<string, string> {
  const masterByName = new Map<string, ClientDepositMatchSource>();
  clients.forEach((client) => {
    const name = String(client.name || "").trim();
    if (name) masterByName.set(name, client);
  });

  const haystacks = new Map<string, string>();
  for (const row of rows) {
    const master = masterByName.get(row.client);
    const aliasParts = Array.isArray(master?.depositNameAliases)
      ? master.depositNameAliases
      : master?.depositNameAliases
        ? [master.depositNameAliases]
        : [];
    haystacks.set(
      row.client,
      [
        row.client,
        master?.manager,
        master?.phone,
        ...aliasParts,
      ]
        .map(normalizeHaystackPart)
        .filter(Boolean)
        .join(" "),
    );
  }
  return haystacks;
}

export function filterCalendarClientSearchRows(
  rows: CalendarClientSearchRow[],
  haystacks: Map<string, string>,
  query: string,
  sort: "name" | "sales",
  limit = CALENDAR_CLIENT_SEARCH_RESULT_LIMIT,
): { rows: CalendarClientSearchRow[]; truncated: boolean } {
  const normalizedQuery = query.trim().toLowerCase();
  let filtered = rows;
  if (normalizedQuery) {
    filtered = rows.filter((row) => {
      if (row.client.toLowerCase().includes(normalizedQuery)) return true;
      const haystack = haystacks.get(row.client);
      return haystack ? haystack.includes(normalizedQuery) : false;
    });
  }

  const sorted =
    sort === "sales"
      ? [...filtered].sort(
          (a, b) => b.monthBill - a.monthBill || a.client.localeCompare(b.client, "ko-KR"),
        )
      : [...filtered].sort((a, b) => a.client.localeCompare(b.client, "ko-KR"));

  if (sorted.length <= limit) {
    return { rows: sorted, truncated: false };
  }
  return { rows: sorted.slice(0, limit), truncated: true };
}
