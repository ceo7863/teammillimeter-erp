import {
  A4_PORTRAIT_HEIGHT_PX,
  A4_PORTRAIT_WIDTH_PX,
  A4_STATEMENT_CAPTURE_SLACK_PX,
  A4_STATEMENT_FORCE_SINGLE_PAGE_MAX_SITES,
  getStatementFillerRowCountFromElement,
} from "./statementSheetLayout";
import {
  cloneStatementTableRow,
  findStatementSheetRoot,
  fixStatementCloneImages,
  flattenStatementFitCells,
} from "./statementDocument";

export type StatementPageVariant = "screen" | "capture";

function cloneNode<T extends Node>(node: T | null | undefined): T | null {
  return node ? (node.cloneNode(true) as T) : null;
}

export function getStatementBodyRows(dataTable: Element | null): HTMLTableRowElement[] {
  if (!dataTable) return [];

  const rows = Array.from(dataTable.querySelectorAll("tbody tr")).filter((row) => !row.classList.contains("excel-filler-row")) as HTMLTableRowElement[];
  const dataRows = rows.filter((row) => !row.querySelector(".excel-empty-cell"));
  if (dataRows.length) {
    return dataRows.map((row) => cloneStatementTableRow(row));
  }

  const emptyRow = rows.find((row) => row.querySelector(".excel-empty-cell"));
  return emptyRow ? [cloneStatementTableRow(emptyRow)] : [];
}

function countVisibleBodyRows(rows: HTMLTableRowElement[]) {
  const dataRows = rows.filter((row) => !row.querySelector(".excel-empty-cell"));
  return dataRows.length || 1;
}

function countSiteBodyRows(rows: HTMLTableRowElement[]) {
  const siteRows = rows.filter((row) => !row.querySelector(".excel-empty-cell") && !row.classList.contains("excel-worker-sub-row"));
  return siteRows.length || 1;
}

function shouldForceSingleStatementPage(bodyRows: HTMLTableRowElement[]) {
  const siteGroups = splitBodyRowsIntoGroups(bodyRows);
  return siteGroups.length <= A4_STATEMENT_FORCE_SINGLE_PAGE_MAX_SITES;
}

function buildSingleStatementPage(
  source: HTMLElement,
  bodyRows: HTMLTableRowElement[],
  variant: StatementPageVariant = "screen"
) {
  return buildStatementPageElement(source, {
    showFullHeader: true,
    bodyRows: fixRowspanForChunk(bodyRows, ""),
    showTableFooter: true,
    variant,
  });
}

function getTableColumnCount(sourceTable: Element | null) {
  const colCount = sourceTable?.querySelectorAll("colgroup col").length;
  if (colCount) return colCount;
  return sourceTable?.querySelectorAll("thead th").length || 10;
}

function appendFillerRows(tbody: HTMLElement, columnCount: number, rowCount: number) {
  if (rowCount <= 0) return;

  const row = document.createElement("tr");
  row.className = "excel-filler-spacer excel-filler-row";
  row.setAttribute("aria-hidden", "true");
  row.style.setProperty("--statement-filler-min-height", `${Math.max(rowCount * 22, 48)}px`);
  const cell = document.createElement("td");
  cell.colSpan = columnCount;
  row.appendChild(cell);
  tbody.appendChild(row);
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
  options.bodyRows.forEach((row) => tbody.appendChild(row));

  if (variant === "screen" && options.showTableFooter) {
    appendFillerRows(tbody, columnCount, getStatementFillerRowCountFromElement(source, countSiteBodyRows(options.bodyRows)));
  }

  table.appendChild(tbody);
  if (options.showTableFooter && tfoot) table.appendChild(tfoot);
  tableShell.appendChild(table);
  sheet.appendChild(tableShell);

  if (options.showTableFooter) {
    const brand = cloneNode(source.querySelector(".excel-footer-brand"));
    if (brand) sheet.appendChild(brand);
  }

  flattenStatementFitCells(sheet);
  fixStatementCloneImages(sheet);

  return sheet;
}

export function removeStatementPageNumbers(sheet: HTMLElement) {
  sheet.querySelectorAll(".excel-sheet-page-number").forEach((node) => node.remove());
}

export function appendStatementPageNumber(sheet: HTMLElement, page: number, total: number) {
  removeStatementPageNumbers(sheet);
  if (total <= 1) return;

  const label = document.createElement("div");
  label.className = "excel-sheet-page-number";
  label.setAttribute("aria-hidden", "true");
  label.textContent = `${page} / ${total}`;
  sheet.appendChild(label);
}

function measurePageHeight(host: HTMLElement, pageElement: HTMLElement) {
  if (pageElement.classList.contains("is-pdf-capture")) {
    pageElement.style.minHeight = "auto";
  } else {
    pageElement.style.minHeight = `${A4_PORTRAIT_HEIGHT_PX}px`;
  }
  pageElement.style.height = "auto";
  pageElement.style.maxHeight = "none";
  pageElement.style.overflow = "visible";
  host.replaceChildren(pageElement);
  return Math.ceil(
    Math.max(pageElement.getBoundingClientRect().height, pageElement.scrollHeight, pageElement.offsetHeight)
  );
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

function extractSiteDateFromGroup(group: HTMLTableRowElement[]): string {
  const siteRow = group.find((row) => !row.classList.contains("excel-worker-sub-row"));
  if (!siteRow) return "";
  const dateCell = siteRow.querySelector(".excel-date-cell-rowspan, .excel-date-cell, td[rowspan]");
  if (!dateCell) return "";
  const fitText = dateCell.querySelector(".excel-fit-cell-text");
  return (fitText?.textContent || dateCell.textContent)?.trim() || "";
}

export function fixRowspanForChunk(rows: HTMLTableRowElement[], siteDate = "") {
  const clones = rows.map((row) => cloneStatementTableRow(row));
  const groups = splitBodyRowsIntoGroups(clones);
  const result: HTMLTableRowElement[] = [];

  groups.forEach((group) => {
    const siteRowIndex = group.findIndex((row) => !row.classList.contains("excel-worker-sub-row"));

    if (siteRowIndex >= 0) {
      const siteRow = group[siteRowIndex];
      const dateCell = siteRow.querySelector("td[rowspan], .excel-date-cell-rowspan, .excel-date-cell");
      if (dateCell) {
        dateCell.setAttribute("rowspan", String(group.length - siteRowIndex));
      }
      result.push(...group);
      return;
    }

    if (group.length > 0 && group.every((row) => row.classList.contains("excel-worker-sub-row"))) {
      const dateCell = document.createElement("td");
      dateCell.className = "excel-date-cell excel-date-cell-rowspan";
      dateCell.textContent = siteDate;
      dateCell.rowSpan = group.length;
      group[0].insertBefore(dateCell, group[0].firstChild);
    }

    result.push(...group);
  });

  return result;
}

type StatementPageChunk = {
  rows: HTMLTableRowElement[];
  siteDate: string;
};

function canFitPage(
  host: HTMLElement,
  source: HTMLElement,
  bodyRows: HTMLTableRowElement[],
  showFullHeader: boolean,
  showTableFooter: boolean,
  siteDate: string,
  variant: StatementPageVariant = "screen"
) {
  const page = buildStatementPageElement(source, {
    showFullHeader,
    bodyRows: fixRowspanForChunk(bodyRows, siteDate),
    showTableFooter,
    variant,
  });
  const height = measurePageHeight(host, page);
  return height <= A4_PORTRAIT_HEIGHT_PX + A4_STATEMENT_CAPTURE_SLACK_PX + 0.5;
}

export function paginateStatementRows(
  source: HTMLElement,
  host: HTMLElement,
  rows: HTMLTableRowElement[],
  variant: StatementPageVariant = "screen"
) {
  if (!rows.length) {
    return [{ rows: [], siteDate: "" }];
  }

  const groups = splitBodyRowsIntoGroups(rows);
  const pages: StatementPageChunk[] = [];
  let pending: HTMLTableRowElement[] = [];
  let pendingSiteDate = "";

  const flushPending = () => {
    if (!pending.length) return;
    pages.push({ rows: pending, siteDate: pendingSiteDate });
    pending = [];
    pendingSiteDate = "";
  };

  groups.forEach((group, groupIndex) => {
    const groupSiteDate = extractSiteDateFromGroup(group);
    const isLastGroup = groupIndex === groups.length - 1;

    const tryMerge = (extra: HTMLTableRowElement[], showFooter: boolean) =>
      canFitPage(
        host,
        source,
        [...pending, ...extra],
        pages.length === 0,
        showFooter,
        pendingSiteDate || groupSiteDate,
        variant
      );

    if (tryMerge(group, isLastGroup && pending.length + group.length === rows.length)) {
      if (!pending.length) pendingSiteDate = groupSiteDate;
      pending.push(...group);
      return;
    }

    flushPending();

    if (canFitPage(host, source, group, pages.length === 0, isLastGroup, groupSiteDate, variant)) {
      pending = [...group];
      pendingSiteDate = groupSiteDate;
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
        const sliceSiteDate = offset === 0 ? groupSiteDate : groupSiteDate;

        if (canFitPage(host, source, slice, showFullHeader, isLastPage, sliceSiteDate, variant)) {
          bestCount = tryCount;
        } else {
          break;
        }
      }

      pages.push({ rows: group.slice(offset, offset + bestCount), siteDate: groupSiteDate });
      offset += bestCount;
    }
  });

  flushPending();

  return pages.map((chunk) => ({
    rows: fixRowspanForChunk(chunk.rows, chunk.siteDate),
    siteDate: chunk.siteDate,
  }));
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
    if (bodyRows.length > 0 && shouldForceSingleStatementPage(bodyRows)) {
      const page = buildSingleStatementPage(source, bodyRows, variant);
      return [page];
    }

    let pageChunks = paginateStatementRows(source, host, bodyRows, variant);

    if (pageChunks.length > 1 && bodyRows.length > 0) {
      const singlePage = buildSingleStatementPage(source, bodyRows, variant);
      if (measurePageHeight(host, singlePage) <= A4_PORTRAIT_HEIGHT_PX + A4_STATEMENT_CAPTURE_SLACK_PX + 0.5) {
        pageChunks = [{ rows: fixRowspanForChunk(bodyRows, ""), siteDate: "" }];
      }
    }

    const totalPages = pageChunks.length;
    return pageChunks.map((chunk, pageIndex) => {
      const page = buildStatementPageElement(source, {
        showFullHeader: pageIndex === 0,
        bodyRows: chunk.rows,
        showTableFooter: pageIndex === pageChunks.length - 1,
        variant,
      });
      appendStatementPageNumber(page, pageIndex + 1, totalPages);
      return page;
    });
  } finally {
    host.remove();
  }
}

/** Build paginated A4 pages for PDF/print export */
export function buildStatementExportPages(source: HTMLElement): HTMLElement[] {
  return buildPaginatedStatementPages(source, { variant: "screen" });
}

export function countStatementExportPages(source: HTMLElement): number {
  const preview = source.closest(".erp-statement-a4-preview") as HTMLElement | null;
  if (preview?.dataset.statementPageCount) {
    return Math.max(1, Number(preview.dataset.statementPageCount));
  }
  if (preview) {
    const displayHost = preview.querySelector("[data-statement-display-host]") as HTMLElement | null;
    if (displayHost?.dataset.statementPageCount) {
      return Math.max(1, Number(displayHost.dataset.statementPageCount));
    }
  }
  return buildStatementExportPages(source).length;
}

function cloneStatementPrintSheet(sheet: HTMLElement) {
  const clone = sheet.cloneNode(true) as HTMLElement;
  flattenStatementFitCells(clone);
  fixStatementCloneImages(clone);
  clone.classList.remove("is-pdf-export", "is-pdf-export-fixed");
  clone.style.boxShadow = "none";
  clone.style.margin = "0";
  clone.style.width = `${A4_PORTRAIT_WIDTH_PX}px`;
  clone.style.minWidth = `${A4_PORTRAIT_WIDTH_PX}px`;
  return clone;
}

export async function waitForStatementPreviewReady(preview: HTMLElement, timeoutMs = 4000) {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    if (preview.dataset.statementPagesReady === "true") {
      const pageCount = Math.max(1, Number(preview.dataset.statementPageCount || "1"));
      if (pageCount <= 1) return pageCount;

      const displayHost = preview.querySelector("[data-statement-display-host]") as HTMLElement | null;
      const frameCount = displayHost?.querySelectorAll(":scope > .erp-statement-a4-page").length || 0;
      if (frameCount >= pageCount) return pageCount;
    }

    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await new Promise<void>((resolve) => window.setTimeout(resolve, 40));
  }

  return Math.max(1, Number(preview.dataset.statementPageCount || "1"));
}

function readVisiblePreviewSheets(preview: HTMLElement, pageCount: number) {
  if (pageCount <= 1) {
    const measureHost = preview.querySelector("[data-statement-measure-host]") as HTMLElement | null;
    const liveSheet = findStatementSheetRoot(measureHost);
    return liveSheet ? [liveSheet] : [];
  }

  const displayHost = preview.querySelector("[data-statement-display-host]") as HTMLElement | null;
  if (!displayHost) return [];

  return Array.from(displayHost.querySelectorAll(":scope > .erp-statement-a4-page > .erp-statement-sheet")) as HTMLElement[];
}

/** Collect pages shown on screen for WYSIWYG print/PDF. */
export async function collectStatementPrintPages(exportRoot: HTMLElement): Promise<HTMLElement[]> {
  const preview = exportRoot.closest(".erp-statement-a4-preview") as HTMLElement | null;

  if (preview) {
    const pageCount = await waitForStatementPreviewReady(preview);
    const visibleSheets = readVisiblePreviewSheets(preview, pageCount);

    if (visibleSheets.length > 0) {
      return visibleSheets.map((sheet) => cloneStatementPrintSheet(sheet));
    }
  }

  return buildStatementExportPages(exportRoot).map((sheet) => cloneStatementPrintSheet(sheet));
}
