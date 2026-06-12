import {
  OFFICE_PAYROLL_PAY_TYPE_LABELS,
  roundPayAmount,
  sumMoneyLines,
  type OfficePayrollLine,
  type OfficePayrollPayType,
  type OfficePayrollSheet,
} from "@/utils/officePayroll";

export type OfficePayrollLineTaxBreakdown = {
  grossPay: number;
  netPay: number;
  incomeTax: number;
  localTax: number;
  withholdingTotal: number;
  nationalPension: number;
  healthInsurance: number;
  longTermCare: number;
  employmentInsurance: number;
  otherDeductions: number;
};

export type OfficePayrollMonthlyTaxRow = {
  staffId: string;
  staffName: string;
  department?: string;
  payType: OfficePayrollPayType;
  incomeCategory: "근로소득" | "기타소득";
  grossPay: number;
  netPay: number;
  tax: OfficePayrollLineTaxBreakdown;
};

export type OfficePayrollMonthlyTaxSummary = {
  monthKey: string;
  sheetStatus?: OfficePayrollSheet["status"];
  rows: OfficePayrollMonthlyTaxRow[];
  totals: OfficePayrollLineTaxBreakdown & { headcount: number };
  laborIncome: OfficePayrollLineTaxBreakdown & { headcount: number };
  otherIncome: OfficePayrollLineTaxBreakdown & { headcount: number };
};

export type OfficePayrollYearlyStaffRow = {
  staffId: string;
  staffName: string;
  department?: string;
  payTypes: OfficePayrollPayType[];
  months: string[];
  grossPay: number;
  netPay: number;
  tax: OfficePayrollLineTaxBreakdown;
  monthly: Array<{
    monthKey: string;
    grossPay: number;
    netPay: number;
    tax: OfficePayrollLineTaxBreakdown;
  }>;
};

export type OfficePayrollYearlyTaxSummary = {
  year: string;
  rows: OfficePayrollYearlyStaffRow[];
  totals: OfficePayrollLineTaxBreakdown & { headcount: number; monthCount: number };
};

export function isPayrollSheetEligibleForTax(sheet: OfficePayrollSheet) {
  return sheet.status === "confirmed" || sheet.status === "paid";
}

function sumDeductionByLabel(
  deductions: OfficePayrollLine["deductions"],
  labels: string[],
) {
  const normalized = labels.map((label) => label.trim());
  return roundPayAmount(
    deductions
      .filter((row) => normalized.some((label) => row.label.includes(label)))
      .reduce((sum, row) => sum + row.amount, 0),
  );
}

function emptyTaxBreakdown(): OfficePayrollLineTaxBreakdown {
  return {
    grossPay: 0,
    netPay: 0,
    incomeTax: 0,
    localTax: 0,
    withholdingTotal: 0,
    nationalPension: 0,
    healthInsurance: 0,
    longTermCare: 0,
    employmentInsurance: 0,
    otherDeductions: 0,
  };
}

export function extractOfficePayrollLineTaxBreakdown(line: OfficePayrollLine): OfficePayrollLineTaxBreakdown {
  const grossPay = roundPayAmount(line.grossPay);
  const netPay = roundPayAmount(line.netPay);
  const nationalPension = sumDeductionByLabel(line.deductions, ["국민연금"]);
  const healthInsurance = sumDeductionByLabel(line.deductions, ["건강보험"]);
  const longTermCare = sumDeductionByLabel(line.deductions, ["장기요양"]);
  const employmentInsurance = sumDeductionByLabel(line.deductions, ["고용보험"]);
  const incomeTaxManual = sumDeductionByLabel(line.deductions, ["소득세"]);
  const localTaxManual = sumDeductionByLabel(line.deductions, ["지방세"]);
  const known =
    nationalPension +
    healthInsurance +
    longTermCare +
    employmentInsurance +
    incomeTaxManual +
    localTaxManual;
  const otherDeductions = Math.max(sumMoneyLines(line.deductions) - known, 0);

  if (line.payType === "daily_33") {
    const withholdingTotal = roundPayAmount(line.withholdingAmount);
    const incomeTax = roundPayAmount(grossPay * 0.03);
    const localTax = Math.max(withholdingTotal - incomeTax, 0);
    return {
      grossPay,
      netPay,
      incomeTax,
      localTax,
      withholdingTotal,
      nationalPension: 0,
      healthInsurance: 0,
      longTermCare: 0,
      employmentInsurance: 0,
      otherDeductions,
    };
  }

  return {
    grossPay,
    netPay,
    incomeTax: incomeTaxManual,
    localTax: localTaxManual,
    withholdingTotal: incomeTaxManual + localTaxManual,
    nationalPension,
    healthInsurance,
    longTermCare,
    employmentInsurance,
    otherDeductions,
  };
}

function addTaxBreakdown(
  target: OfficePayrollLineTaxBreakdown,
  source: OfficePayrollLineTaxBreakdown,
) {
  target.grossPay += source.grossPay;
  target.netPay += source.netPay;
  target.incomeTax += source.incomeTax;
  target.localTax += source.localTax;
  target.withholdingTotal += source.withholdingTotal;
  target.nationalPension += source.nationalPension;
  target.healthInsurance += source.healthInsurance;
  target.longTermCare += source.longTermCare;
  target.employmentInsurance += source.employmentInsurance;
  target.otherDeductions += source.otherDeductions;
}

function finalizeTaxBreakdown(row: OfficePayrollLineTaxBreakdown) {
  row.grossPay = roundPayAmount(row.grossPay);
  row.netPay = roundPayAmount(row.netPay);
  row.incomeTax = roundPayAmount(row.incomeTax);
  row.localTax = roundPayAmount(row.localTax);
  row.withholdingTotal = roundPayAmount(row.withholdingTotal);
  row.nationalPension = roundPayAmount(row.nationalPension);
  row.healthInsurance = roundPayAmount(row.healthInsurance);
  row.longTermCare = roundPayAmount(row.longTermCare);
  row.employmentInsurance = roundPayAmount(row.employmentInsurance);
  row.otherDeductions = roundPayAmount(row.otherDeductions);
  return row;
}

export function buildOfficePayrollMonthlyTaxSummary(
  sheet: OfficePayrollSheet | null | undefined,
): OfficePayrollMonthlyTaxSummary | null {
  if (!sheet || !isPayrollSheetEligibleForTax(sheet)) return null;

  const rows: OfficePayrollMonthlyTaxRow[] = sheet.lines
    .filter((line) => !line.excluded)
    .map((line) => {
      const tax = extractOfficePayrollLineTaxBreakdown(line);
      return {
        staffId: line.staffId,
        staffName: line.staffName,
        department: line.department,
        payType: line.payType,
        incomeCategory: line.payType === "daily_33" ? "기타소득" : "근로소득",
        grossPay: tax.grossPay,
        netPay: tax.netPay,
        tax,
      };
    })
    .sort((a, b) => a.staffName.localeCompare(b.staffName, "ko"));

  const totals = { ...emptyTaxBreakdown(), headcount: rows.length };
  const laborIncome = { ...emptyTaxBreakdown(), headcount: 0 };
  const otherIncome = { ...emptyTaxBreakdown(), headcount: 0 };

  for (const row of rows) {
    addTaxBreakdown(totals, row.tax);
    if (row.incomeCategory === "근로소득") {
      laborIncome.headcount += 1;
      addTaxBreakdown(laborIncome, row.tax);
    } else {
      otherIncome.headcount += 1;
      addTaxBreakdown(otherIncome, row.tax);
    }
  }

  finalizeTaxBreakdown(totals);
  finalizeTaxBreakdown(laborIncome);
  finalizeTaxBreakdown(otherIncome);

  return {
    monthKey: sheet.monthKey,
    sheetStatus: sheet.status,
    rows,
    totals,
    laborIncome,
    otherIncome,
  };
}

export function buildOfficePayrollYearlyTaxSummary(
  year: string,
  sheets: OfficePayrollSheet[],
): OfficePayrollYearlyTaxSummary {
  const yearPrefix = String(year || "").trim();
  const eligible = sheets
    .filter((sheet) => sheet.monthKey.startsWith(`${yearPrefix}-`) && isPayrollSheetEligibleForTax(sheet))
    .sort((a, b) => a.monthKey.localeCompare(b.monthKey));

  const staffMap = new Map<string, OfficePayrollYearlyStaffRow>();

  for (const sheet of eligible) {
    for (const line of sheet.lines) {
      if (line.excluded) continue;
      const tax = extractOfficePayrollLineTaxBreakdown(line);
      let row = staffMap.get(line.staffId);
      if (!row) {
        row = {
          staffId: line.staffId,
          staffName: line.staffName,
          department: line.department,
          payTypes: [],
          months: [],
          grossPay: 0,
          netPay: 0,
          tax: emptyTaxBreakdown(),
          monthly: [],
        };
        staffMap.set(line.staffId, row);
      }
      if (!row.payTypes.includes(line.payType)) row.payTypes.push(line.payType);
      if (!row.months.includes(sheet.monthKey)) row.months.push(sheet.monthKey);
      row.grossPay += tax.grossPay;
      row.netPay += tax.netPay;
      addTaxBreakdown(row.tax, tax);
      row.monthly.push({
        monthKey: sheet.monthKey,
        grossPay: tax.grossPay,
        netPay: tax.netPay,
        tax,
      });
    }
  }

  const rows = [...staffMap.values()]
    .map((row) => {
      finalizeTaxBreakdown(row.tax);
      row.monthly.sort((a, b) => a.monthKey.localeCompare(b.monthKey));
      row.grossPay = roundPayAmount(row.grossPay);
      row.netPay = roundPayAmount(row.netPay);
      return row;
    })
    .sort((a, b) => a.staffName.localeCompare(b.staffName, "ko"));

  const totals = {
    ...emptyTaxBreakdown(),
    headcount: rows.length,
    monthCount: eligible.length,
  };
  for (const row of rows) addTaxBreakdown(totals, row.tax);
  finalizeTaxBreakdown(totals);

  return { year: yearPrefix, rows, totals };
}

export function formatPayTypeList(payTypes: OfficePayrollPayType[]) {
  return payTypes.map((type) => OFFICE_PAYROLL_PAY_TYPE_LABELS[type]).join(", ");
}

export function currentPayrollYear() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date()).slice(0, 4);
}
