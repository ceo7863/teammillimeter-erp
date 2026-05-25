import * as XLSX from "xlsx-js-style";
import { loadStatementLogo } from "./statementLogo";
import { finalizeStatementXlsx, type StatementLogoAnchor } from "./xlsxPostProcess";
import type { CellStyle } from "./styles";

export function decodeRange(ref?: string) {
  return ref ? XLSX.utils.decode_range(ref) : { s: { r: 0, c: 0 }, e: { r: 0, c: 0 } };
}

export function setCell(
  ws: XLSX.WorkSheet,
  row: number,
  col: number,
  value: string | number,
  style?: CellStyle
) {
  const addr = XLSX.utils.encode_cell({ r: row, c: col });
  ws[addr] = {
    t: typeof value === "number" ? "n" : "s",
    v: value,
    ...(style ? { s: style } : {}),
  };
}

export function mergeCells(merges: XLSX.Range[], startRow: number, startCol: number, endRow: number, endCol: number) {
  if (startRow > endRow || startCol > endCol) return;
  if (startRow === endRow && startCol === endCol) return;

  const next = { s: { r: startRow, c: startCol }, e: { r: endRow, c: endCol } };
  const overlaps = merges.some((merge) => rangesOverlap(merge, next));
  if (overlaps) return;

  merges.push(next);
}

function rangesOverlap(a: XLSX.Range, b: XLSX.Range) {
  return !(a.e.r < b.s.r || b.e.r < a.s.r || a.e.c < b.s.c || b.e.c < a.s.c);
}

export function writeMergedCells(
  ws: XLSX.WorkSheet,
  merges: XLSX.Range[],
  row: number,
  startCol: number,
  endCol: number,
  value: string | number,
  style?: CellStyle,
  endRow = row
) {
  for (let r = row; r <= endRow; r += 1) {
    for (let c = startCol; c <= endCol; c += 1) {
      const cellValue = r === row && c === startCol ? value : "";
      setCell(ws, r, c, cellValue, style);
    }
  }
  mergeCells(merges, row, startCol, endRow, endCol);
}

export function writeRowValues(
  ws: XLSX.WorkSheet,
  row: number,
  values: Array<{ value: string | number; style?: CellStyle }>,
  startCol = 0
) {
  values.forEach((entry, index) => {
    setCell(ws, row, startCol + index, entry.value, entry.style);
  });
}

function expandRefForMerges(ws: XLSX.WorkSheet, merges: XLSX.Range[]) {
  const cells = Object.keys(ws).filter((key) => !key.startsWith("!"));
  let maxRow = 0;
  let maxCol = 0;

  cells.forEach((addr) => {
    const { r, c } = XLSX.utils.decode_cell(addr);
    maxRow = Math.max(maxRow, r);
    maxCol = Math.max(maxCol, c);
  });

  merges.forEach((merge) => {
    maxRow = Math.max(maxRow, merge.e.r);
    maxCol = Math.max(maxCol, merge.e.c);
  });

  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxRow, c: maxCol } });
}

export function finalizeWorksheet(
  ws: XLSX.WorkSheet,
  merges: XLSX.Range[],
  columnWidths: Array<{ wch: number }>,
  rowHeights?: Array<number | undefined>
) {
  ws["!merges"] = merges;
  ws["!cols"] = columnWidths;
  if (rowHeights?.length) {
    ws["!rows"] = rowHeights.map((height) => (height ? { hpt: height } : {}));
  }
  expandRefForMerges(ws, merges);
  return ws;
}

function triggerBlobDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function downloadWorksheet(
  ws: XLSX.WorkSheet,
  sheetName: string,
  fileName: string,
  logoAnchor?: StatementLogoAnchor
) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, ws, sheetName.slice(0, 31));
  const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array", compression: true }) as ArrayBuffer;

  const logoAsset = logoAnchor ? await loadStatementLogo() : null;
  const blob = await finalizeStatementXlsx(buffer, {
    logo:
      logoAnchor && logoAsset
        ? {
            bytes: logoAsset.bytes,
            anchor: logoAnchor,
            width: logoAsset.width,
            height: logoAsset.height,
            mediaPath: logoAsset.mediaPath,
          }
        : undefined,
  });
  triggerBlobDownload(blob, fileName);
}
