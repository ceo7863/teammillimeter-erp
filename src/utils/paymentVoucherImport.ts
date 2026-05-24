import { excelDateToISO } from "./excelDates";

function parseMoney(value: unknown) {
  return Number(String(value ?? "").replace(/[^0-9.-]/g, "")) || 0;
}

export type PaymentVatInfo = {
  vatAmount: number;
  paidAmount: number;
  paymentDate?: string;
};

export type PaymentVatLookup = Map<string, PaymentVatInfo>;

export type ExcelPaymentVoucher = {
  id: number;
  salesId: number;
  date: string;
  client: string;
  site: string;
  workerCount: number;
  totalSalesAmount: number;
  amount: number;
  vatType: "included" | "excluded";
  supplyAmount: number;
  vatAmount: number;
  finalAmount: number;
  memo: string;
};

export function buildPaymentVatLookupKey(saleDate: string, client: string, site: string, bill: number) {
  return `${saleDate}|${client}|${site}|${bill}`;
}

/** 입금내역검색 시트(일자·거래처·현장·총시공비·입금액·부가세) → lookup */
export function buildPaymentVatLookupFromRows(rows: unknown[][]): PaymentVatLookup {
  const lookup: PaymentVatLookup = new Map();

  rows.slice(8).forEach((row) => {
    if (row[0] === "" || row[0] == null) return;

    const saleDate = excelDateToISO(row[0]);
    const client = String(row[1] || "").trim();
    const site = String(row[2] || "").trim();
    const bill = parseMoney(row[4]);
    if (!saleDate || !client) return;

    lookup.set(buildPaymentVatLookupKey(saleDate, client, site, bill), {
      vatAmount: parseMoney(row[7]),
      paidAmount: parseMoney(row[6]),
      paymentDate: excelDateToISO(row[5]) || undefined,
    });
  });

  return lookup;
}

function resolvePaymentVat(finalPaid: number, bill: number, lookup?: PaymentVatInfo) {
  if (lookup) {
    const vatAmount = Math.max(0, lookup.vatAmount);
    const supplyAmount = Math.max(0, finalPaid - vatAmount);
    return {
      vatAmount,
      supplyAmount,
      finalAmount: finalPaid,
      vatType: vatAmount > 0 ? ("included" as const) : ("excluded" as const),
    };
  }

  if (finalPaid > bill && bill > 0) {
    const vatAmount = Math.round(finalPaid - bill);
    return {
      vatAmount,
      supplyAmount: Math.max(0, finalPaid - vatAmount),
      finalAmount: finalPaid,
      vatType: "included" as const,
    };
  }

  return {
    vatAmount: 0,
    supplyAmount: finalPaid,
    finalAmount: finalPaid,
    vatType: "excluded" as const,
  };
}

/** 매출내역서 입금일(23열)·입금액(24열) + 입금내역검색 부가세 → 입금등록 전표 */
export function createExcelPaymentVoucher(input: {
  saleId: number;
  paymentDateRaw: unknown;
  paidRaw: unknown;
  saleDate: string;
  client: string;
  site: string;
  amount: number;
  workerCount: number;
  vatLookup?: PaymentVatLookup;
}): ExcelPaymentVoucher | null {
  const finalPaid = parseMoney(input.paidRaw);
  if (finalPaid <= 0) return null;

  const lookupKey = buildPaymentVatLookupKey(input.saleDate, input.client, input.site, input.amount);
  const lookup = input.vatLookup?.get(lookupKey);
  const paymentDate = excelDateToISO(input.paymentDateRaw) || lookup?.paymentDate || input.saleDate;
  const { vatAmount, supplyAmount, finalAmount, vatType } = resolvePaymentVat(finalPaid, input.amount, lookup);

  return {
    id: 1_000_000_000 + input.saleId,
    salesId: input.saleId,
    date: paymentDate,
    client: input.client,
    site: input.site,
    workerCount: input.workerCount,
    totalSalesAmount: input.amount,
    amount: supplyAmount,
    vatType,
    supplyAmount,
    vatAmount,
    finalAmount,
    memo: "엑셀 import",
  };
}
