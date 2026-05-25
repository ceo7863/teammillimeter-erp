import { A4_PORTRAIT_HEIGHT_PX, A4_PORTRAIT_WIDTH_PX, getStatementFillerRowCount } from "./statementSheetLayout";

export type StatementPageVariant = "screen" | "capture";

function cloneNode<T extends Node>(node: T | null | undefined): T | null {
  return node ? (node.cloneNode(true) as T) : null;
}

export function getStatementBodyRows(dataTable: Element | null): HTMLTableRowElement[] {
  if (!dataTable) return [];

  const rows = Array.from(dataTable.querySelectorAll("tbody tr")).filter((row) => !row.classList.contains("excel-filler-row")) as HTMLTableRowElement[];
  const dataRows = rows.filter((row) => !row.querySelector(".excel-empty-cell"));
  if (dataRows.length) return dataRows;

  const emptyRow = rows.find((row) => row.querySelector(".excel-empty-cell"));
  return emptyRow ? [emptyRow] : [];
}

function countVisibleBodyRows(rows: HTMLTableRowElement[]) {
  const dataRows = rows.filter((row) => !row.querySelector(".excel-empty-cell"));
  return dataRows.length || 1;
}

function getTableColumnCount(sourceTable: Element | null) {
  const colCount = sourceTable?.querySelectorAll("colgroup col").length;
  if (colCount) return colCount;
  return sourceTable?.querySelectorAll("thead th").length || 10;
}

function appendFillerRows(tbody: HTMLElement, columnCount: number, rowCount: number) {
  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const row = document.createElement("tr");
    row.className = "excel-filler-row";
    row.setAttribute("aria-hidden", "true");
    for (let cellIndex = 0; cellIndex < columnCount; cellIndex += 1) {
      row.appendChild(document.createElement("td"));
    }
    tbody.appendChild(row);
  }
}

export function createMeasureHost(): HTMLElement {
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-12000px";
  host.style.top = "0";
  host.style.width = `${A4_PORTRAIT_WIDTH_PX}px`;
  host.style.opacity = "0";
  host.style.pointerEvents = "none";
  host.style.zIndex = "-1";
  document.body.appendChild(host);
  return host;
}

export function buildStatementPageElement(
  source: HTMLElement,
  options: {
    showFullHeader: boolean;
    bodyRows: HTMLTableRowElement[];
    showTableFooter: boolean;
    variant?: StatementPageVariant;
  }
) {
  const variant = options.variant ?? "screen";
  const sheet = document.createElement("div");
  sheet.className = [
    "erp-statement-sheet",
    variant === "capture" ? "is-pdf-capture" : "is-a4-page",
    options.showFullHeader ? "is-a4-first-page" : "is-a4-continuation-page",
  ]
    .filter(Boolean)
    .join(" ");
  sheet.style.width = `${A4_PORTRAIT_WIDTH_PX}px`;
  if (variant === "screen") {
    sheet.style.minHeight = `${A4_PORTRAIT_HEIGHT_PX}px`;
  } else {
    sheet.style.minHeight = "auto";
  }
  sheet.style.boxShadow = "none";
  sheet.style.margin = "0";

  const header = cloneNode(source.querySelector(".excel-sheet-header"));
  if (header) {
    sheet.appendChild(header);
  } else {
    const title = cloneNode(source.querySelector(".excel-sheet-title"));
    if (title) sheet.appendChild(title);
  }

  if (options.showFullHeader) {
    const recipient = cloneNode(source.querySelector(".excel-client-recipient"));
    const metaTable = cloneNode(source.querySelector(".excel-header-table"));
    if (recipient) sheet.appendChild(recipient);
    if (metaTable) sheet.appendChild(metaTable);
  } else {
    const recipient = cloneNode(source.querySelector(".excel-client-recipient"));
    if (recipient) sheet.appendChild(recipient);
    const continuation = document.createElement("div");
    continuation.className = "excel-pdf-continuation-note";
    continuation.textContent = "\uACC4\uC18D \uB0B4\uC5ED";
    sheet.appendChild(continuation);
  }

  const sourceTable = source.querySelector(".excel-data-table");
  const colgroup = cloneNode(sourceTable?.querySelector("colgroup"));
  const thead = cloneNode(sourceTable?.querySelector("thead"));
  const tfoot = cloneNode(sourceTable?.querySelector("tfoot"));
  const columnCount = getTableColumnCount(sourceTable);

  const tableShell = document.createElement("div");
  tableShell.className = "excel-data-table-shell";
  const table = document.createElement("table");
  table.className = "excel-data-table";
  if (colgroup) table.appendChild(colgroup);
  if (thead) table.appendChild(thead);
  const tbody = document.createElement("tbody");
  options.bodyRows.forEach((row) => tbody.appendChild(row.cloneNode(true)));

  if (variant === "screen" && options.showTableFooter) {
    appendFillerRows(tbody, columnCount, getStatementFillerRowCount(countVisibleBodyRows(options.bodyRows)));
  }

  table.appendChild(tbody);
  if (options.showTableFooter && tfoot) table.appendChild(tfoot);
  tableShell.appendChild(table);
  sheet.appendChild(tableShell);

  if (options.showTableFooter) {
    const brand = cloneNode(source.querySelector(".excel-footer-brand"));
    if (brand) sheet.appendChild(brand);
  }

  return sheet;
}

function measurePageHeight(host: HTMLElement, pageElement: HTMLElement) {
  if (pageElement.classList.contains("is-pdf-capture")) {
    pageElement.style.minHeight = "auto";
  } else {
    pageElement.style.minHeight = `${A4_PORTRAIT_HEIGHT_PX}px`;
  }
  host.replaceChildren(pageElement);
  return pageElement.getBoundingClientRect().height;
}

function splitBodyRowsIntoGroups(rows: HTMLTableRowElement[]): HTMLTableRowElement[][] {
  const groups: HTMLTableRowElement[][] = [];
  let current: HTMLTableRowElement[] = [];

  rows.forEach((row) => {
    if (!row.classList.contains("excel-worker-sub-row") && current.length > 0) {
      groups.push(current);
      current = [];
    }
    current.push(row);
  });

  if (current.length) groups.push(current);
  return groups;
}

export function fixRowspanForChunk(rows: HTMLTableRowElement[]) {
  const clones = rows.map((row) => row.cloneNode(true) as HTMLTableRowElement);
  const siteRowIndex = clones.findIndex((row) => !row.classList.contains("excel-worker-sub-row"));

  if (siteRowIndex >= 0) {
    const siteRow = clones[siteRowIndex];
    const dateCell = siteRow.querySelector("td[rowspan], .excel-date-cell-rowspan, .excel-date-cell");
    if (dateCell) {
      dateCell.setAttribute("rowspan", String(clones.length - siteRowIndex));
    }
  }

  return clones;
}

function canFitPage(
  host: HTMLElement,
  source: HTMLElement,
  bodyRows: HTMLTableRowElement[],
  showFullHeader: boolean,
  showTableFooter: boolean,
  variant: StatementPageVariant = "screen"
) {
  const page = buildStatementPageElement(source, {
    showFullHeader,
    bodyRows: fixRowspanForChunk(bodyRows),
    showTableFooter,
    variant,
  });
  return measurePageHeight(host, page) <= A4_PORTRAIT_HEIGHT_PX + 0.5;
}

export function paginateStatementRows(
  source: HTMLElement,
  host: HTMLElement,
  rows: HTMLTableRowElement[],
  variant: StatementPageVariant = "screen"
) {
  if (!rows.length) {
    return [[]];
  }

  const groups = splitBodyRowsIntoGroups(rows);
  const pages: HTMLTableRowElement[][] = [];
  let pending: HTMLTableRowElement[] = [];

  const flushPending = () => {
    if (!pending.length) return;
    pages.push(pending);
    pending = [];
  };

  groups.forEach((group, groupIndex) => {
    const isLastGroup = groupIndex === groups.length - 1;

    const tryMerge = (extra: HTMLTableRowElement[], showFooter: boolean) =>
      canFitPage(host, source, [...pending, ...extra], pages.length === 0 && pending.length === 0, showFooter, variant);

    if (tryMerge(group, isLastGroup && pending.length + group.length === rows.length)) {
      pending.push(...group);
      return;
    }

    flushPending();

    if (canFitPage(host, source, group, pages.length === 0, isLastGroup, variant)) {
      pending = [...group];
      return;
    }

    let offset = 0;
    while (offset < group.length) {
      let bestCount = 1;

      for (let tryCount = 1; tryCount <= group.length - offset; tryCount += 1) {
        const slice = group.slice(offset, offset + tryCount);
        const isLastSlice = offset + tryCount >= group.length;
        const isLastPage = isLastGroup && isLastSlice;
        const showFullHeader = pages.length === 0 && offset === 0;

        if (canFitPage(host, source, slice, showFullHeader, isLastPage, variant)) {
          bestCount = tryCount;
        } else {
          break;
        }
      }

      pages.push(group.slice(offset, offset + bestCount));
      offset += bestCount;
    }
  });

  flushPending();

  return pages.map((pageRows) => fixRowspanForChunk(pageRows));
}

export function buildPaginatedStatementPages(
  source: HTMLElement,
  options: { variant?: StatementPageVariant } = {}
): HTMLElement[] {
  const variant = options.variant ?? "screen";
  const dataTable = source.querySelector(".excel-data-table");
  const bodyRows = getStatementBodyRows(dataTable);
  const host = createMeasureHost();

  try {
    const pageChunks = paginateStatementRows(source, host, bodyRows, variant);
    return pageChunks.map((chunk, pageIndex) =>
      buildStatementPageElement(source, {
        showFullHeader: pageIndex === 0,
        bodyRows: chunk,
        showTableFooter: pageIndex === pageChunks.length - 1,
        variant,
      })
    );
  } finally {
    host.remove();
  }
}

/** Build paginated A4 pages for PDF/print export */
export function buildStatementExportPages(source: HTMLElement): HTMLElement[] {
  return buildPaginatedStatementPages(source, { variant: "screen" });
}
