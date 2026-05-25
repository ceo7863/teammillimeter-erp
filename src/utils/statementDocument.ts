import {
  A4_PORTRAIT_HEIGHT_PX,
  A4_PORTRAIT_WIDTH_PX,
} from "./statementSheetLayout";

export function flattenStatementFitCells(root: HTMLElement) {
  root.querySelectorAll("td, th").forEach((cell) => {
    const fitText = cell.querySelector(".excel-fit-cell-text") as HTMLElement | null;
    if (!fitText) return;

    const text = fitText.textContent?.trim() || "";
    const fontSize = fitText.style.fontSize;
    cell.textContent = text;
    if (fontSize) {
      cell.style.fontSize = fontSize;
    }
  });
}

export function fixStatementCloneImages(root: HTMLElement) {
  root.querySelectorAll("img").forEach((img) => {
    const src = img.getAttribute("src");
    if (src?.startsWith("/")) {
      img.src = `${window.location.origin}${src}`;
    }
  });
}

function cloneTableSectionRow(row: HTMLTableRowElement, rowClassName: string) {
  const nextRow = document.createElement("tr");
  nextRow.className = rowClassName;
  row.querySelectorAll("th, td").forEach((cell) => {
    const nextCell = document.createElement("td");
    nextCell.className = cell.className;
    if (cell.colSpan > 1) nextCell.colSpan = cell.colSpan;
    if (cell.rowSpan > 1) nextCell.rowSpan = cell.rowSpan;
    nextCell.textContent = cell.textContent?.trim() || "";
    nextRow.appendChild(nextCell);
  });
  return nextRow;
}

/** Move thead/tfoot rows into tbody for print so headers do not repeat per page. */
export function flattenStatementTableSectionsForPrint(root: HTMLElement) {
  root.querySelectorAll(".excel-data-table").forEach((table) => {
    const thead = table.querySelector("thead");
    const tfoot = table.querySelector("tfoot");
    const tbody = table.querySelector("tbody");
    if (!tbody) return;

    const headerRow = thead?.querySelector("tr");
    if (headerRow) {
      tbody.insertBefore(cloneTableSectionRow(headerRow, "excel-print-column-header-row"), tbody.firstChild);
      thead.remove();
    }

    const footerRow = tfoot?.querySelector("tr");
    if (footerRow) {
      tbody.appendChild(cloneTableSectionRow(footerRow, "excel-print-column-footer-row"));
      tfoot.remove();
    }
  });
}

type CloneStatementOptions = {
  /** PDF export uses fixed A4 width */
  forPdf?: boolean;
  /** Remove filler rows before export */
  stripFillerRows?: boolean;
  /** Keep fit-cell font sizes from the screen (print capture) */
  preserveFitCells?: boolean;
};

/** Clone statement DOM for print/PDF export */
export function cloneStatementDocument(root: HTMLElement, options: CloneStatementOptions = {}) {
  const clone = root.cloneNode(true) as HTMLElement;
  clone.classList.remove("is-pdf-source", "is-pdf-capture", "is-pdf-export", "is-a4-page");

  if (options.stripFillerRows) {
    clone.querySelectorAll(".excel-filler-row").forEach((row) => row.remove());
  }

  if (options.forPdf) {
    clone.classList.add("is-pdf-export");
    clone.style.boxShadow = "none";
    clone.style.margin = "0";
    clone.style.width = `${A4_PORTRAIT_WIDTH_PX}px`;
    clone.style.minWidth = `${A4_PORTRAIT_WIDTH_PX}px`;
  }

  if (!options.preserveFitCells) {
    flattenStatementFitCells(clone);
  }
  fixStatementCloneImages(clone);
  return clone;
}

/** Prepare on-screen statement sheet for print/excel export (WYSIWYG). */
export function prepareStatementSheetExportClone(root: HTMLElement, options: { stripFillerRows?: boolean } = {}) {
  const clone = cloneStatementDocument(root, { stripFillerRows: options.stripFillerRows ?? false });
  clone.style.boxShadow = "none";
  clone.style.margin = "0";
  return clone;
}

function createStatementMeasureHost() {
  const host = document.createElement("div");
  host.style.cssText = `position:fixed;left:-20000px;top:0;width:${A4_PORTRAIT_WIDTH_PX}px;overflow:visible;background:#fff;`;
  document.body.appendChild(host);
  return host;
}

export async function waitForStatementImages(root: HTMLElement) {
  const images = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    images.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) {
            resolve();
            return;
          }
          img.addEventListener("load", () => resolve(), { once: true });
          img.addEventListener("error", () => resolve(), { once: true });
        })
    )
  );
}

export function measureStatementElementHeight(element: HTMLElement) {
  const host = createStatementMeasureHost();
  host.appendChild(element);
  const height = Math.ceil(Math.max(element.offsetHeight, element.scrollHeight, element.getBoundingClientRect().height));
  host.remove();
  return height;
}

/** Lock statement clone to exactly one A4 page (footer stays at bottom, no 2nd-page spill). */
export function applyStatementSingleA4PageLayout(clone: HTMLElement) {
  clone.classList.add("is-pdf-export", "is-pdf-export-fixed");
  clone.style.width = `${A4_PORTRAIT_WIDTH_PX}px`;
  clone.style.minWidth = `${A4_PORTRAIT_WIDTH_PX}px`;
  clone.style.height = `${A4_PORTRAIT_HEIGHT_PX}px`;
  clone.style.minHeight = `${A4_PORTRAIT_HEIGHT_PX}px`;
  clone.style.maxHeight = `${A4_PORTRAIT_HEIGHT_PX}px`;
  clone.style.overflow = "hidden";
  clone.style.boxSizing = "border-box";
  clone.style.boxShadow = "none";
  clone.style.margin = "0";
}

/** Clone on-screen statement for print capture (keeps filler rows + fit-cell sizes). */
export function prepareStatementSheetPrintClone(root: HTMLElement) {
  const clone = cloneStatementDocument(root, { stripFillerRows: false, preserveFitCells: true });
  clone.classList.add("is-pdf-export");
  clone.style.boxShadow = "none";
  clone.style.margin = "0";
  return clone;
}
