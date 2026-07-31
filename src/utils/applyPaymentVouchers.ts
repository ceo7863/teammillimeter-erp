type SaleLike = {
  id?: number | string;
  date?: string;
  client?: string;
  amount?: number;
  paid?: number;
  basePaid?: number;
  manualPaidCleared?: boolean;
};

type VoucherLike = {
  salesId?: number | string;
  client?: string;
  finalAmount?: number | string;
  amount?: number | string;
  statementSalesIds?: Array<number | string>;
  statementPeriodStart?: string;
  statementPeriodEnd?: string;
};

function parseMoney(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Apply stored payment vouchers onto sales.
 * Explicit salesId allocations are honored as stored (no re-FIFO across statementSalesIds).
 */
export function applyPaymentVouchers(sales: SaleLike[], vouchers: VoucherLike[]) {
  const copied = sales.map((row) => ({
    ...row,
    basePaid: row.basePaid ?? row.paid ?? 0,
    voucherPaid: 0,
    manualPaidCleared: row.manualPaidCleared || false,
  }));
  const clientCredits: Record<string, number> = {};

  const applyToRow = (row: (typeof copied)[number], amount: number) => {
    const unpaid = Math.max((row.amount || 0) - (row.basePaid || 0) - (row.voucherPaid || 0), 0);
    const applied = Math.min(unpaid, amount);
    row.voucherPaid += applied;
    return amount - applied;
  };

  vouchers.forEach((voucher) => {
    let remaining = parseMoney(voucher.finalAmount ?? voucher.amount);

    if (voucher.salesId != null && voucher.salesId !== "") {
      const target = copied.find((row) => String(row.id) === String(voucher.salesId));
      if (target && !target.manualPaidCleared) remaining = applyToRow(target, remaining);
      if (remaining > 0) {
        clientCredits[String(voucher.client || "")] =
          (clientCredits[String(voucher.client || "")] || 0) + remaining;
      }
      return;
    }

    let scopedRows = copied.filter((row) => row.client === voucher.client && !row.manualPaidCleared);

    if (voucher.statementSalesIds?.length) {
      const idSet = new Set(voucher.statementSalesIds.map((id) => String(id)));
      scopedRows = scopedRows.filter((row) => idSet.has(String(row.id)));
    } else if (voucher.statementPeriodStart || voucher.statementPeriodEnd) {
      scopedRows = scopedRows.filter((row) => {
        const date = String(row.date || "");
        if (voucher.statementPeriodStart && date < voucher.statementPeriodStart) return false;
        if (voucher.statementPeriodEnd && date > voucher.statementPeriodEnd) return false;
        return true;
      });
    }

    scopedRows
      .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")) || String(a.id).localeCompare(String(b.id)))
      .forEach((row) => {
        if (remaining <= 0) return;
        remaining = applyToRow(row, remaining);
      });

    if (remaining > 0) {
      clientCredits[String(voucher.client || "")] =
        (clientCredits[String(voucher.client || "")] || 0) + remaining;
    }
  });

  return {
    sales: copied.map((row) => ({
      ...row,
      paid: Math.min((row.basePaid || 0) + (row.voucherPaid || 0), row.amount || 0),
      prepaidBalance: clientCredits[String(row.client || "")] || 0,
    })),
    clientCredits,
  };
}
