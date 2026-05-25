type SaleDateRow = { id?: number | string; date?: string };

type PaymentVoucherRow = {
  salesId?: number | string;
  date?: string;
  amount?: number;
  vatAmount?: number;
  finalAmount?: number;
  client?: string;
};

export function summarizePaymentVatBySaleDate(
  paymentVouchers: PaymentVoucherRow[],
  sales: SaleDateRow[],
  startDate = "",
  endDate = "",
  client = ""
) {
  const saleDateById = sales.reduce<Record<string, string>>((acc, row) => {
    if (row.id != null && row.date) acc[String(row.id)] = row.date;
    return acc;
  }, {});

  const round = (value: number) => Math.round(Number(value) || 0);

  return paymentVouchers.reduce(
    (acc, voucher) => {
      const saleDate = (voucher.salesId != null ? saleDateById[String(voucher.salesId)] : "") || voucher.date || "";
      const startMatch = startDate ? saleDate >= startDate : true;
      const endMatch = endDate ? saleDate <= endDate : true;
      const clientMatch = client ? voucher.client === client : true;
      if (!startMatch || !endMatch || !clientMatch) return acc;

      const vat = round(voucher.vatAmount);
      const final = round(voucher.finalAmount ?? voucher.amount);
      acc.vat += vat;
      if (vat > 0) {
        acc.count += 1;
        acc.final += final;
      }
      return acc;
    },
    { count: 0, vat: 0, final: 0 }
  );
}
