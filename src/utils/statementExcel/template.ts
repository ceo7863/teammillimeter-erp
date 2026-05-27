import type * as XLSX from "xlsx-js-style";
import type { ClientStatementExcelPayload, StatementExcelCompany, WorkerStatementExcelPayload } from "./types";
import {
  companyLineStyle,
  companyLinkStyle,
  companyNameStyle,
  dataCenterStyle,
  dataEmptyStyle,
  dataFillerStyle,
  dataFooterStyle,
  dataHeaderStyle,
  dataNumberStyle,
  dataTextStyle,
  footerBrandStyle,
  footerLinkStyle,
  metaAmountStyle,
  metaCenterStyle,
  metaLabelStyle,
  metaValueStyle,
  plainStyle,
  recipientCellStyle,
  titleCellStyle,
} from "./styles";
import { finalizeWorksheet, setCell, writeMergedCells, writeRowValues } from "./workbook";
import type { StatementLogoAnchor } from "./xlsxPostProcess";

const CLIENT_COLS = 10;
const WORKER_COLS = 11;
const CLIENT_WIDTHS = [8, 18, 5, 9, 9, 8, 10, 10, 10, 19].map((wch) => ({ wch }));
const WORKER_WIDTHS = [8, 12, 15, 5, 9, 8, 10, 10, 10, 9, 11].map((wch) => ({ wch }));
const HEADER_BLOCK_ROW_HPT = 18;
const TITLE_ROW_HPT = 30;
const FILLER_ROW_HPT = 16.5;
/** Screen header min-height 96px ≈ 5 rows at 18hpt even when company info is sparse */
const MIN_HEADER_BLOCK_ROWS = 5;

function spacedTitle(title: string) {
  return title.trim().split(/\s+/).filter(Boolean).join("  ");
}

function writeHeader(
  ws: XLSX.WorkSheet,
  merges: XLSX.Range[],
  row: number,
  colCount: number,
  company: StatementExcelCompany,
  title: string,
  rowHeights: Array<number | undefined>
): { nextRow: number; logoAnchor: StatementLogoAnchor } {
  const leftEnd = Math.min(4, colCount - 2);
  const rightStart = Math.max(leftEnd + 1, colCount - 3);
  const headerStartRow = row;
  const contentRowCount = 1 + company.headerLines.length + company.headerLinks.length;
  const blockRowCount = Math.max(MIN_HEADER_BLOCK_ROWS, contentRowCount);
  const headerEndRow = headerStartRow + blockRowCount - 1;

  writeMergedCells(ws, merges, headerStartRow, rightStart, colCount - 1, "", plainStyle(), headerEndRow);
  writeMergedCells(ws, merges, headerStartRow, 0, leftEnd, company.name, companyNameStyle());
  for (let blockRow = headerStartRow; blockRow <= headerEndRow; blockRow += 1) {
    rowHeights[blockRow] = HEADER_BLOCK_ROW_HPT;
  }
  row = headerStartRow + 1;

  company.headerLines.forEach((line) => {
    writeMergedCells(ws, merges, row, 0, leftEnd, line, companyLineStyle());
    row += 1;
  });

  company.headerLinks.forEach((line) => {
    writeMergedCells(ws, merges, row, 0, leftEnd, line, companyLinkStyle());
    row += 1;
  });

  while (row <= headerEndRow) {
    writeMergedCells(ws, merges, row, 0, leftEnd, "", plainStyle());
    row += 1;
  }

  row += 1;
  const titleRow = row;
  writeMergedCells(ws, merges, titleRow, 0, colCount - 1, spacedTitle(title), titleCellStyle());
  rowHeights[titleRow] = TITLE_ROW_HPT;
  return {
    nextRow: row + 2,
    logoAnchor: {
      fromCol: rightStart,
      fromRow: headerStartRow,
      toCol: colCount - 1,
      toRow: headerEndRow,
    },
  };
}

function writeMetaRow(
  ws: XLSX.WorkSheet,
  merges: XLSX.Range[],
  row: number,
  lastCol: number,
  label1: string,
  value1: string,
  label2: string,
  value2: string,
  amount = false
) {
  setCell(ws, row, 0, label1, metaLabelStyle());
  writeMergedCells(ws, merges, row, 1, 3, value1, metaValueStyle());
  setCell(ws, row, 4, label2, metaLabelStyle());
  writeMergedCells(ws, merges, row, 5, lastCol, value2, amount ? metaAmountStyle() : metaValueStyle());
  return row + 1;
}

function writeMetaPeriodRow(
  ws: XLSX.WorkSheet,
  merges: XLSX.Range[],
  row: number,
  lastCol: number,
  label: string,
  start: string,
  end: string,
  amountLabel: string,
  amount: string
) {
  setCell(ws, row, 0, label, metaLabelStyle());
  setCell(ws, row, 1, start, metaValueStyle());
  setCell(ws, row, 2, "~", metaCenterStyle());
  setCell(ws, row, 3, end, metaValueStyle());
  setCell(ws, row, 4, amountLabel, metaLabelStyle());
  writeMergedCells(ws, merges, row, 5, lastCol, amount, metaAmountStyle());
  return row + 1;
}

function writeMetaAmountOnlyRow(
  ws: XLSX.WorkSheet,
  merges: XLSX.Range[],
  row: number,
  lastCol: number,
  label: string,
  amount: string
) {
  writeMergedCells(ws, merges, row, 0, 3, "", plainStyle());
  setCell(ws, row, 4, label, metaLabelStyle());
  writeMergedCells(ws, merges, row, 5, lastCol, amount, metaAmountStyle());
  return row + 1;
}

function writeClientMeta(ws: XLSX.WorkSheet, merges: XLSX.Range[], row: number, payload: ClientStatementExcelPayload) {
  const lastCol = CLIENT_COLS - 1;
  row = writeMetaRow(ws, merges, row, lastCol, "사업자번호", payload.meta.businessNo, "계좌정보", payload.meta.bankAccount);
  row = writeMetaRow(ws, merges, row, lastCol, "담당자", payload.meta.manager, "합계", payload.meta.subtotal, true);
  row = writeMetaRow(ws, merges, row, lastCol, "연락처", payload.meta.phone, "부가세", payload.meta.vatAmount, true);
  row = writeMetaPeriodRow(
    ws,
    merges,
    row,
    lastCol,
    "시공일자",
    payload.meta.periodStart,
    payload.meta.periodEnd,
    "총합계",
    payload.meta.grandTotal
  );
  return row + 1;
}

function writeWorkerMeta(ws: XLSX.WorkSheet, merges: XLSX.Range[], row: number, payload: WorkerStatementExcelPayload) {
  const lastCol = WORKER_COLS - 1;
  row = writeMetaRow(ws, merges, row, lastCol, "연락처", payload.meta.phone, "계좌정보", payload.meta.bankAccount);
  row = writeMetaPeriodRow(
    ws,
    merges,
    row,
    lastCol,
    "시공기간",
    payload.meta.periodStart,
    payload.meta.periodEnd,
    "합계",
    payload.meta.grossPay
  );
  row = writeMetaAmountOnlyRow(ws, merges, row, lastCol, "수수료", payload.meta.fee);
  row = writeMetaAmountOnlyRow(ws, merges, row, lastCol, "실수령", payload.meta.netPay);
  return row + 1;
}

function writeFooter(ws: XLSX.WorkSheet, merges: XLSX.Range[], row: number, colCount: number, company: StatementExcelCompany) {
  row += 1;
  if (company.footerLines.length) {
    writeMergedCells(ws, merges, row, 0, colCount - 1, company.footerLines[0], footerBrandStyle(true));
    row += 1;
  }
  company.footerLines.slice(1).forEach((line) => {
    writeMergedCells(ws, merges, row, 0, colCount - 1, line, footerBrandStyle(false));
    row += 1;
  });
  company.footerLinks.forEach((line) => {
    writeMergedCells(ws, merges, row, 0, colCount - 1, line, footerLinkStyle());
    row += 1;
  });
  return row;
}

function writeClientBody(ws: XLSX.WorkSheet, merges: XLSX.Range[], row: number, payload: ClientStatementExcelPayload) {
  let pendingDateColRows = 0;

  payload.bodyRows.forEach((bodyRow) => {
    if (bodyRow.type === "empty") {
      pendingDateColRows = 0;
      writeMergedCells(ws, merges, row, 0, CLIENT_COLS - 1, bodyRow.message, dataEmptyStyle());
      row += 1;
      return;
    }

    if (bodyRow.type === "worker-merged") {
      if (pendingDateColRows > 0) pendingDateColRows -= 1;
      writeMergedCells(ws, merges, row, 1, CLIENT_COLS - 1, `↳ ${bodyRow.text}`, dataTextStyle(true));
      row += 1;
      return;
    }

    if (bodyRow.type === "site") {
      pendingDateColRows = Math.max(0, bodyRow.rowSpan - 1);
      if (bodyRow.rowSpan > 1) {
        writeMergedCells(ws, merges, row, 0, 0, bodyRow.date, dataCenterStyle(), row + bodyRow.rowSpan - 1);
      } else {
        setCell(ws, row, 0, bodyRow.date, dataCenterStyle());
      }
      writeRowValues(
        ws,
        row,
        [
          { value: bodyRow.site, style: dataTextStyle() },
          { value: bodyRow.staffCount, style: dataNumberStyle() },
          { value: bodyRow.totalConstructionCost, style: dataNumberStyle() },
          { value: bodyRow.originalCost, style: dataNumberStyle() },
          { value: bodyRow.overtimeCost, style: dataNumberStyle() },
          { value: bodyRow.lodgingCost, style: dataNumberStyle() },
          { value: bodyRow.mealCost, style: dataNumberStyle() },
          { value: bodyRow.expenseCost, style: dataNumberStyle() },
          { value: bodyRow.memo, style: dataTextStyle() },
        ],
        1
      );
      row += 1;
      return;
    }

    if (pendingDateColRows > 0) pendingDateColRows -= 1;
    writeRowValues(
      ws,
      row,
      [
        { value: `↳ ${bodyRow.site}`, style: dataTextStyle(true) },
        { value: bodyRow.staffCount, style: dataNumberStyle(true) },
        { value: bodyRow.totalConstructionCost, style: dataNumberStyle(true) },
        { value: bodyRow.originalCost, style: dataNumberStyle(true) },
        { value: bodyRow.overtimeCost, style: dataNumberStyle(true) },
        { value: bodyRow.lodgingCost, style: dataNumberStyle(true) },
        { value: bodyRow.mealCost, style: dataNumberStyle(true) },
        { value: bodyRow.expenseCost, style: dataNumberStyle(true) },
        { value: bodyRow.memo, style: dataTextStyle(true) },
      ],
      1
    );
    row += 1;
  });

  return row;
}

function writeClientTotals(ws: XLSX.WorkSheet, merges: XLSX.Range[], row: number, payload: ClientStatementExcelPayload) {
  if (!payload.totalsRow) return row;

  writeMergedCells(ws, merges, row, 0, 1, payload.totalsRow[0], dataFooterStyle());
  writeRowValues(
    ws,
    row,
    payload.totalsRow.slice(2).map((value) => ({ value, style: dataFooterStyle() })),
    2
  );
  return row + 1;
}

function writeWorkerBody(ws: XLSX.WorkSheet, merges: XLSX.Range[], row: number, payload: WorkerStatementExcelPayload) {
  payload.bodyRows.forEach((bodyRow) => {
    if (bodyRow.type === "empty") {
      writeMergedCells(ws, merges, row, 0, WORKER_COLS - 1, bodyRow.message, dataEmptyStyle());
      row += 1;
      return;
    }

    writeRowValues(ws, row, [
      { value: bodyRow.date, style: dataCenterStyle() },
      { value: bodyRow.client, style: dataTextStyle() },
      { value: bodyRow.site, style: dataTextStyle() },
      { value: bodyRow.quantity, style: dataNumberStyle() },
      { value: bodyRow.basePay, style: dataNumberStyle() },
      { value: bodyRow.overtime, style: dataNumberStyle() },
      { value: bodyRow.lodging, style: dataNumberStyle() },
      { value: bodyRow.meal, style: dataNumberStyle() },
      { value: bodyRow.expense, style: dataNumberStyle() },
      { value: bodyRow.totalPay, style: dataNumberStyle() },
      { value: bodyRow.memo, style: dataTextStyle() },
    ]);
    row += 1;
  });

  return row;
}

function writeWorkerTotals(ws: XLSX.WorkSheet, merges: XLSX.Range[], row: number, payload: WorkerStatementExcelPayload) {
  if (!payload.totalsRow) return row;

  writeMergedCells(ws, merges, row, 0, 2, payload.totalsRow[0], dataFooterStyle());
  writeRowValues(
    ws,
    row,
    payload.totalsRow.slice(3).map((value) => ({ value, style: dataFooterStyle() })),
    3
  );
  return row + 1;
}

function writeFillerRows(
  ws: XLSX.WorkSheet,
  row: number,
  colCount: number,
  count: number,
  rowHeights: Array<number | undefined>
) {
  for (let index = 0; index < count; index += 1) {
    for (let col = 0; col < colCount; col += 1) {
      setCell(ws, row, col, "", dataFillerStyle());
    }
    rowHeights[row] = FILLER_ROW_HPT;
    row += 1;
  }
  return row;
}

export function buildClientStatementWorksheet(payload: ClientStatementExcelPayload) {
  const ws: XLSX.WorkSheet = {};
  const merges: XLSX.Range[] = [];
  const rowHeights: Array<number | undefined> = [];
  let row = 0;

  const header = writeHeader(ws, merges, row, CLIENT_COLS, payload.company, payload.title, rowHeights);
  row = header.nextRow;
  writeMergedCells(ws, merges, row, 0, CLIENT_COLS - 1, `${payload.recipientName}  귀하`, recipientCellStyle());
  row += 2;
  row = writeClientMeta(ws, merges, row, payload);
  row += 1;
  writeRowValues(
    ws,
    row,
    payload.dataColumns.map((column) => ({ value: column, style: dataHeaderStyle() }))
  );
  row += 1;
  row = writeClientBody(ws, merges, row, payload);
  row = writeFillerRows(ws, row, CLIENT_COLS, payload.fillerRowCount, rowHeights);
  row = writeClientTotals(ws, merges, row, payload);
  writeFooter(ws, merges, row, CLIENT_COLS, payload.company);

  return { ws: finalizeWorksheet(ws, merges, CLIENT_WIDTHS, rowHeights), logoAnchor: header.logoAnchor };
}

export function buildWorkerStatementWorksheet(payload: WorkerStatementExcelPayload) {
  const ws: XLSX.WorkSheet = {};
  const merges: XLSX.Range[] = [];
  const rowHeights: Array<number | undefined> = [];
  let row = 0;

  const header = writeHeader(ws, merges, row, WORKER_COLS, payload.company, payload.title, rowHeights);
  row = header.nextRow;
  writeMergedCells(ws, merges, row, 0, WORKER_COLS - 1, `${payload.recipientName}  귀하`, recipientCellStyle());
  row += 2;
  row = writeWorkerMeta(ws, merges, row, payload);
  row += 1;
  writeRowValues(
    ws,
    row,
    payload.dataColumns.map((column) => ({ value: column, style: dataHeaderStyle() }))
  );
  row += 1;
  row = writeWorkerBody(ws, merges, row, payload);
  row = writeFillerRows(ws, row, WORKER_COLS, payload.fillerRowCount, rowHeights);
  row = writeWorkerTotals(ws, merges, row, payload);
  writeFooter(ws, merges, row, WORKER_COLS, payload.company);

  return { ws: finalizeWorksheet(ws, merges, WORKER_WIDTHS, rowHeights), logoAnchor: header.logoAnchor };
}
