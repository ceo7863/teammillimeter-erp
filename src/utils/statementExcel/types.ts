export type WorkerStatementTotals = {
  count: number;
  basePay: number;
  overtime: number;
  lodging: number;
  meal: number;
  expense: number;
  totalPay: number;
};

export type WorkerStatementSummary = {
  grossPay: number;
  fee: number;
  netPay: number;
};

export type StatementExcelCompany = {
  name: string;
  headerLines: string[];
  headerLinks: string[];
  footerLines: string[];
  footerLinks: string[];
};

export type ClientStatementExcelPayload = {
  kind: "client";
  title: string;
  recipientName: string;
  company: StatementExcelCompany;
  meta: {
    businessNo: string;
    manager: string;
    phone: string;
    bankAccount: string;
    periodStart: string;
    periodEnd: string;
    issuedDate: string;
    subtotal: string;
    vatAmount: string;
    grandTotal: string;
  };
  dataColumns: string[];
  bodyRows: ClientStatementExcelBodyRow[];
  totalsRow: string[] | null;
  fillerRowCount: number;
  emptyMessage: string;
};

export type ClientStatementExcelBodyRow =
  | {
      type: "site";
      date: string;
      site: string;
      staffCount: string | number;
      totalConstructionCost: string;
      originalCost: string;
      overtimeCost: string;
      lodgingCost: string;
      mealCost: string;
      expenseCost: string;
      memo: string;
      rowSpan: number;
    }
  | {
      type: "worker-detail";
      site: string;
      staffCount: string | number;
      totalConstructionCost: string;
      originalCost: string;
      overtimeCost: string;
      lodgingCost: string;
      mealCost: string;
      expenseCost: string;
      memo: string;
    }
  | {
      type: "worker-merged";
      text: string;
    }
  | {
      type: "empty";
      message: string;
    };

export type WorkerStatementExcelPayload = {
  kind: "worker";
  title: string;
  recipientName: string;
  company: StatementExcelCompany;
  meta: {
    phone: string;
    bankAccount: string;
    periodStart: string;
    periodEnd: string;
    grossPay: string;
    fee: string;
    netPay: string;
  };
  dataColumns: string[];
  bodyRows: WorkerStatementExcelBodyRow[];
  totalsRow: string[] | null;
  fillerRowCount: number;
  emptyMessage: string;
};

export type WorkerStatementExcelBodyRow =
  | {
      type: "data";
      date: string;
      client: string;
      site: string;
      quantity: string | number;
      basePay: string;
      overtime: string;
      lodging: string;
      meal: string;
      expense: string;
      totalPay: string;
      memo: string;
    }
  | {
      type: "empty";
      message: string;
    };

export type StatementExcelPayload = ClientStatementExcelPayload | WorkerStatementExcelPayload;
