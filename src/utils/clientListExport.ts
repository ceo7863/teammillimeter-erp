export type ClientListSheetRow = {
  id?: number | string;
  name?: string;
  businessNo?: string;
  manager?: string;
  phone?: string;
  vat?: string;
};

export type ClientListActivityFilter = "all" | "excludeStale";

const STALE_DAYS = 90;

export function daysSinceClientSaleDate(dateStr: string) {
  const saleDate = new Date(`${dateStr}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (Number.isNaN(saleDate.getTime())) return Number.POSITIVE_INFINITY;
  return Math.floor((today.getTime() - saleDate.getTime()) / (1000 * 60 * 60 * 24));
}

export function buildClientLastSaleDateMap(
  sales: Array<{ client?: string; date?: string }> = []
) {
  const map = new Map<string, string>();
  for (const sale of sales) {
    const name = String(sale.client || "").trim();
    const date = String(sale.date || "").slice(0, 10);
    if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const prev = map.get(name);
    if (!prev || date > prev) map.set(name, date);
  }
  return map;
}

export function isClientStaleOver3Months(
  clientName: string,
  lastSaleByClient: Map<string, string>
) {
  const name = String(clientName || "").trim();
  const lastSaleDate = lastSaleByClient.get(name);
  if (!lastSaleDate) return true;
  return daysSinceClientSaleDate(lastSaleDate) > STALE_DAYS;
}

export function filterClientsForExport(
  clients: ClientListSheetRow[],
  activityFilter: ClientListActivityFilter,
  lastSaleByClient: Map<string, string>
) {
  if (activityFilter === "all") return clients;
  return clients.filter((client) => !isClientStaleOver3Months(client.name || "", lastSaleByClient));
}

export function resolveClientActivityFilterLabel(activityFilter: ClientListActivityFilter) {
  if (activityFilter === "excludeStale") return "3\uAC1C\uC6D4\u2191 \uBBF8\uAC70\uB798 \uC81C\uC678";
  return "\uC804\uCCB4";
}

export function resolveClientExportFileName(activityFilter: ClientListActivityFilter) {
  const base = "\uAC70\uB798\uCC98\uBAA9\uB85D";
  if (activityFilter === "excludeStale") return `${base}_3\uAC1C\uC6D4\uB0B4\uAC70\uB798`;
  return base;
}
