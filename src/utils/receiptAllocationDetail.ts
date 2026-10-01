/**
 * Receipt detail rows: one row per allocation of a Receipt, split per sale.
 * A Receipt carries gross cash only — VAT is never generated from it; the supply / VAT shown
 * here belong to the sale's own tax treatment.
 */
import { computeSaleTaxAmounts, splitGrossForSale, type TaxTreatment } from "./saleTaxTreatment";

export type ReceiptDetailSaleLike = {
  id?: string | number;
  date?: string;
  site?: string;
  voucherNo?: string;
  amount?: number;
  taxTreatment?: string | null;
  arBilledAmount?: number;
  outstandingAmount?: number;
};

export type ReceiptDetailAllocationLike = {
  id?: string | number;
  receiptId?: string | number;
  saleId?: string | number;
  amount?: number;
  site?: string;
  status?: string;
};

export type ReceiptAllocationDetailRow = {
  allocationId: string;
  saleId: string;
  saleDate: string;
  voucherNo: string;
  site: string;
  taxTreatment: TaxTreatment;
  supplyAmount: number;
  vatAmount: number;
  grossReceivableAmount: number;
  priorAppliedAmount: number;
  thisAllocationAmount: number;
  thisAllocationSupply: number;
  thisAllocationVat: number;
  remainingAmount: number;
  status: string;
};

function money(value: unknown) {
  const amount = Math.round(Number(value) || 0);
  return Number.isFinite(amount) ? amount : 0;
}

export function buildReceiptAllocationDetailRows(
  receiptAllocations: ReceiptDetailAllocationLike[],
  sales: ReceiptDetailSaleLike[],
): ReceiptAllocationDetailRow[] {
  const saleById = new Map(sales.map((sale) => [String(sale?.id ?? ""), sale]));
  const lastIndexBySale = new Map<string, number>();
  receiptAllocations.forEach((row, index) => lastIndexBySale.set(String(row.saleId ?? ""), index));
  return receiptAllocations.map((row, index) => {
    const saleId = String(row.saleId ?? "");
    const sale = saleById.get(saleId) || {};
    const tax = computeSaleTaxAmounts(sale);
    const gross = sale.arBilledAmount != null ? money(sale.arBilledAmount) : tax.grossReceivableAmount;
    const thisAmount = money(row.amount);
    const remaining =
      sale.outstandingAmount != null ? Math.max(money(sale.outstandingAmount), 0) : Math.max(gross - thisAmount, 0);
    const isLast = lastIndexBySale.get(saleId) === index;
    // Later allocations of this same receipt to the sale are not "prior" for this row.
    const laterInReceipt = receiptAllocations
      .slice(index + 1)
      .filter((other) => String(other.saleId ?? "") === saleId)
      .reduce((sum, other) => sum + money(other.amount), 0);
    const prior = Math.max(gross - remaining - thisAmount - laterInReceipt, 0);
    const alreadySplitVat = gross > 0 ? Math.round((prior * tax.vatAmount) / gross) : 0;
    const split = splitGrossForSale(sale, thisAmount, {
      alreadySplitVat,
      isLastForSale: isLast && remaining <= 0,
    });
    return {
      allocationId: String(row.id ?? ""),
      saleId,
      saleDate: String(sale.date || ""),
      voucherNo: String(sale.voucherNo || ""),
      site: String(row.site || sale.site || ""),
      taxTreatment: tax.taxTreatment,
      supplyAmount: tax.supplyAmount,
      vatAmount: tax.vatAmount,
      grossReceivableAmount: gross,
      priorAppliedAmount: prior,
      thisAllocationAmount: thisAmount,
      thisAllocationSupply: split.supplyAmount,
      thisAllocationVat: split.vatAmount,
      remainingAmount: remaining + laterInReceipt,
      status: String(row.status || ""),
    };
  });
}
