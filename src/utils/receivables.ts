export function parseMoney(value: unknown) {
  return Number(String(value ?? "").replace(/[^0-9.-]/g, "")) || 0;
}

export function formatKRW(value: number) {
  return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 }).format(Number(value) || 0);
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function monthStartISO() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

export function addDaysISO(dateStr: string, days: number) {
  if (!dateStr) return "";
  const date = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(date.getTime())) return dateStr;
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function getUnpaid(row: { salesAmount?: number; amount?: number; paidAmount?: number; paid?: number }) {
  return Math.max((row.salesAmount || row.amount || 0) - (row.paidAmount ?? row.paid ?? 0), 0);
}

export function getStatus(row: { salesAmount?: number; amount?: number; paidAmount?: number; paid?: number }) {
  const unpaid = getUnpaid(row);
  const paid = row.paidAmount ?? row.paid ?? 0;
  if (unpaid <= 0) return "완료";
  if (paid > 0) return "일부수금";
  return "미수";
}

export const VAT_TYPE_OPTIONS = [
  { label: "포함", value: "included" },
  { label: "별도", value: "excluded" },
];

export const RECEIVABLE_STATUS_OPTIONS = ["전체", "미수", "일부수금", "완료"];

export type ReceivableRow = {
  id: number | string;
  client: string;
  businessNo?: string;
  manager?: string;
  phone?: string;
  date: string;
  voucherNo?: string;
  salesAmount: number;
  paidAmount: number;
  dueDate?: string;
  memo?: string;
  site?: string;
};

export function buildReceivableRowsFromSales(
  appliedSales: Array<Record<string, unknown>>,
  clientMaster: Array<{ name?: string; businessNo?: string; manager?: string; phone?: string }> = []
): ReceivableRow[] {
  const clientMap = Object.fromEntries(clientMaster.map((client) => [client.name, client]));

  return appliedSales.map((row) => {
    const master = clientMap[String(row.client)] || {};
    return {
      id: row.id as number | string,
      client: String(row.client || ""),
      businessNo: String(master.businessNo || ""),
      manager: String(master.manager || ""),
      phone: String(master.phone || ""),
      date: String(row.date || ""),
      voucherNo: String(row.voucherNo || row.id || ""),
      salesAmount: Number(row.amount) || 0,
      paidAmount: Number(row.paid) || 0,
      dueDate: addDaysISO(String(row.date || ""), 22),
      memo: String(row.memo || row.site || ""),
      site: String(row.site || ""),
    };
  });
}
