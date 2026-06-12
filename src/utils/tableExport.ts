import * as XLSX from "xlsx";
import { createPdfPreviewWindow, downloadPdfFromHtmlElement } from "@/utils/statementPdf";

export type ParsedTable = {
  headers: string[];
  rows: string[][];
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function safeExportFileName(name: string) {
  return String(name || "export").replace(/[\\/:*?"<>|]/g, "_").trim() || "export";
}

function normalizeCellText(cell: Element) {
  const clone = cell.cloneNode(true) as HTMLElement;

  const sortLabel = clone.querySelector(".erp-pivot-sort-btn > span:first-child");
  if (sortLabel) {
    const text = sortLabel.textContent?.replace(/\s+/g, " ").trim();
    if (text) return text;
  }

  const pivotLabel = clone.querySelector(".erp-pivot-label-name");
  if (pivotLabel) {
    const text = pivotLabel.textContent?.replace(/\s+/g, " ").trim();
    if (text) return text;
  }

  clone.querySelectorAll("button, svg, .erp-table-export-skip").forEach((node) => node.remove());

  const fields = Array.from(clone.querySelectorAll("input, select, textarea")) as Array<
    HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
  >;
  if (fields.length === 1 && !clone.querySelector("button")) {
    const field = fields[0];
    if (field instanceof HTMLInputElement && field.type === "checkbox") {
      return field.checked ? "Y" : "N";
    }
    return String("value" in field ? field.value : field.textContent || "").trim();
  }

  return clone.textContent?.replace(/\s+/g, " ").trim() || "";
}

function shouldSkipHeader(th: HTMLTableCellElement) {
  if (th.classList.contains("erp-table-export-skip")) return true;
  if (Number(th.colSpan || 1) > 1) return true;
  const label = normalizeCellText(th);
  if (label === "관리") return true;
  if (th.querySelector('input[type="checkbox"]') && !label.replace(/전체\s*선택/g, "").trim()) return true;
  return false;
}

function getHeaderRow(table: HTMLTableElement) {
  const rows = Array.from(table.querySelectorAll("thead tr")).filter((row) =>
    Array.from(row.querySelectorAll("th")).some((th) => Number(th.colSpan || 1) === 1)
  );
  return rows[rows.length - 1] || table.querySelector("thead tr");
}

function isPlaceholderRow(row: HTMLTableRowElement) {
  const cells = row.querySelectorAll("td");
  if (cells.length !== 1) return false;
  const text = normalizeCellText(cells[0]);
  return /불러오는|없습니다|표시할|조건에 맞는|저장된 PDF/.test(text);
}

export function parseDomTable(table: HTMLTableElement): ParsedTable {
  const headerRow = getHeaderRow(table);
  const headers: string[] = [];
  const skipIndexes = new Set<number>();

  headerRow?.querySelectorAll("th").forEach((th, index) => {
    if (shouldSkipHeader(th)) {
      skipIndexes.add(index);
      return;
    }
    headers.push(normalizeCellText(th));
  });

  const rows: string[][] = [];
  table.querySelectorAll("tbody tr, tfoot tr").forEach((row) => {
    if (!(row instanceof HTMLTableRowElement)) return;
    if (row.classList.contains("erp-table-export-skip")) return;
    if (isPlaceholderRow(row)) return;

    const cells = Array.from(row.querySelectorAll("td"));
    const parsed: string[] = [];
    cells.forEach((td, index) => {
      if (skipIndexes.has(index) || td.classList.contains("erp-table-export-skip")) return;
      parsed.push(normalizeCellText(td));
    });

    if (parsed.length && parsed.some((value) => value)) {
      rows.push(parsed);
    }
  });

  return { headers, rows };
}

export function buildTableElementFromParsed(parsed: ParsedTable) {
  const clone = document.createElement("table");
  clone.className = "erp-table-export-print";

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  parsed.headers.forEach((header) => {
    const th = document.createElement("th");
    th.textContent = header;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  clone.appendChild(thead);

  const tbody = document.createElement("tbody");
  parsed.rows.forEach((row) => {
    const tr = document.createElement("tr");
    row.forEach((value) => {
      const td = document.createElement("td");
      td.textContent = value;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  clone.appendChild(tbody);

  return clone;
}

function cloneTableForExport(table: HTMLTableElement) {
  return buildTableElementFromParsed(parseDomTable(table));
}

function buildPrintHtml(tableHtml: string, title: string) {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8"/>
<title>${title}</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  body { font-family: "Malgun Gothic", sans-serif; color: #0f172a; margin: 0; padding: 16px; }
  h1 { font-size: 16px; margin: 0 0 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { border: 1px solid #cbd5e1; padding: 4px 6px; white-space: nowrap; }
  th { background: #f1f5f9; text-align: left; }
  td.num, th.text-right, td.text-right { text-align: right; }
</style>
</head>
<body>
  <h1>${title}</h1>
  ${tableHtml}
</body>
</html>`;
}

export function downloadParsedTableExcel(parsed: ParsedTable, fileName: string) {
  const sheetRows = parsed.rows.length ? [parsed.headers, ...parsed.rows] : [parsed.headers, ["(데이터 없음)"]];
  const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
  XLSX.writeFile(workbook, `${safeExportFileName(fileName)}_${todayISO()}.xlsx`);
}

export function exportDomTableExcel(table: HTMLTableElement, fileName: string) {
  downloadParsedTableExcel(parseDomTable(table), fileName);
}

export function printParsedTable(parsed: ParsedTable, title: string) {
  printDomTable(buildTableElementFromParsed(parsed), title);
}

export async function exportParsedTablePdf(parsed: ParsedTable, fileName: string, title: string) {
  return exportDomTablePdf(buildTableElementFromParsed(parsed), fileName, title);
}

export function printDomTable(table: HTMLTableElement, title: string) {
  const cleaned = cloneTableForExport(table);
  const html = buildPrintHtml(cleaned.outerHTML, title);
  printHtmlDocument(html);
}

/** 팝업 없이 HTML 문서를 인쇄합니다 (모바일·팝업 차단 환경 대응). */
export function printHtmlDocument(html: string) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.title = "print-frame";
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;";
  document.body.appendChild(frame);

  const cleanup = () => {
    window.setTimeout(() => {
      if (frame.parentNode) frame.parentNode.removeChild(frame);
    }, 1000);
  };

  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  if (!doc || !win) {
    cleanup();
    return false;
  }

  doc.open();
  doc.write(html);
  doc.close();

  const triggerPrint = () => {
    try {
      win.focus();
      win.print();
    } catch {
      cleanup();
      return false;
    }
    cleanup();
    return true;
  };

  if (doc.readyState === "complete") {
    window.setTimeout(triggerPrint, 200);
  } else {
    frame.onload = () => window.setTimeout(triggerPrint, 200);
    window.setTimeout(triggerPrint, 600);
  }

  return true;
}

export async function exportDomTablePdf(table: HTMLTableElement, fileName: string, title: string) {
  const container = document.createElement("div");
  container.setAttribute("data-pdf-export-root", "true");
  container.style.cssText =
    "position:fixed;left:-10000px;top:0;z-index:-1;background:#fff;padding:16px 20px;width:max-content;max-width:1200px;";

  const heading = document.createElement("h2");
  heading.textContent = title;
  heading.style.cssText = "margin:0 0 12px;font-size:16px;font-family:Malgun Gothic,sans-serif;color:#0f172a;";
  container.appendChild(heading);

  const cleaned = cloneTableForExport(table);
  cleaned.style.fontSize = "10px";
  cleaned.style.width = "100%";
  container.appendChild(cleaned);
  document.body.appendChild(container);

  try {
    const previewWindow = createPdfPreviewWindow();
    const orientation = parseDomTable(table).headers.length > 6 ? "landscape" : "portrait";
    return await downloadPdfFromHtmlElement(container, `${safeExportFileName(fileName)}_${todayISO()}.pdf`, {
      orientation,
      paginate: false,
      previewWindow,
    });
  } finally {
    container.remove();
  }
}
