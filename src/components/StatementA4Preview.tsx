import React, { useCallback, useLayoutEffect, useRef, useState } from "react";
import {
  findStatementSheetRoot,
  waitForStatementFitCellsStable,
  waitForStatementImages,
} from "@/utils/statementDocument";
import { buildPaginatedStatementPages, appendStatementPageNumber, removeStatementPageNumbers } from "@/utils/statementPagination";

type StatementA4PreviewProps = {
  children: React.ReactNode;
  /** Changes when statement rows/filters change — triggers a fresh paginate pass */
  layoutVersion?: string | number;
};

/** A4 preview — 1 page: live React sheet; 2+ pages: paginated clones (group-aware rowspans) */
export function StatementA4Preview({ children, layoutVersion }: StatementA4PreviewProps) {
  const previewRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const displayRef = useRef<HTMLDivElement>(null);
  const rebuildTokenRef = useRef(0);
  const [usePaginatedDisplay, setUsePaginatedDisplay] = useState(false);

  const markPreviewReady = useCallback((pageCount: number) => {
    const preview = previewRef.current;
    if (!preview) return;
    preview.dataset.statementPageCount = String(pageCount);
    preview.dataset.statementPagesReady = "true";
  }, []);

  const rebuildPages = useCallback(async () => {
    const preview = previewRef.current;
    const measureHost = measureRef.current;
    const displayHost = displayRef.current;
    const source = findStatementSheetRoot(measureHost);
    if (!preview || !measureHost || !displayHost || !source) return;

    delete preview.dataset.statementPagesReady;
    const token = ++rebuildTokenRef.current;
    await waitForStatementImages(source);
    await waitForStatementFitCellsStable(source);
    if (token !== rebuildTokenRef.current) return;

    const pages = buildPaginatedStatementPages(source);
    if (token !== rebuildTokenRef.current) return;

    if (pages.length <= 1) {
      setUsePaginatedDisplay(false);
      source.classList.add("is-a4-page");
      removeStatementPageNumbers(source);
      appendStatementPageNumber(source, 1, 1);
      displayHost.replaceChildren();
      displayHost.dataset.statementPageCount = "1";
      markPreviewReady(1);
      return;
    }

    setUsePaginatedDisplay(true);
    source.classList.remove("is-a4-page");
    removeStatementPageNumbers(source);
    displayHost.replaceChildren();
    displayHost.dataset.statementPageCount = String(pages.length);

    pages.forEach((page, index) => {
      const frame = document.createElement("div");
      frame.className = "erp-statement-a4-page";
      if (index > 0) {
        frame.classList.add("erp-statement-a4-page--continued");
      }
      frame.appendChild(page);
      displayHost.appendChild(frame);
    });

    markPreviewReady(pages.length);
  }, [markPreviewReady]);

  useLayoutEffect(() => {
    void rebuildPages();
  }, [children, layoutVersion, rebuildPages]);

  return (
    <div ref={previewRef} className="erp-statement-a4-preview">
      <div
        ref={measureRef}
        data-statement-measure-host
        className={usePaginatedDisplay ? "erp-statement-a4-source" : "erp-statement-a4-pages"}
        aria-hidden={usePaginatedDisplay ? true : undefined}
      >
        <div className="erp-statement-a4-page">{children}</div>
      </div>
      <div
        ref={displayRef}
        data-statement-display-host
        className="erp-statement-a4-pages"
        style={{ display: usePaginatedDisplay ? undefined : "none" }}
      />
    </div>
  );
}
