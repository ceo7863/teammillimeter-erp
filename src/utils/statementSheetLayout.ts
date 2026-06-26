import type { CompanyProfile } from "./companyProfile";
import { companyProfileContactLines } from "./companyProfile";

export const A4_PORTRAIT_WIDTH_PX = 794;
export const A4_PORTRAIT_HEIGHT_PX = 1123;
export const A4_STATEMENT_MIN_BODY_ROWS = 30;
/** Table body row cap so header + meta + footer still fit on one A4 page */
export const A4_STATEMENT_TABLE_BODY_MAX_ROWS = 24;
/** Footer/logo subpixel overflow above A4 still counts as one page */
export const A4_STATEMENT_CAPTURE_SLACK_PX = 28;
/** @page margin + bottom breathing room — pagination stays within printable area */
export const A4_STATEMENT_PRINT_HEIGHT_RESERVE_PX = 96;
export const A4_STATEMENT_PRINT_PAGE_MARGIN_MM = 12;
export const A4_STATEMENT_PRINT_SCALE = 0.98;

export function getStatementPaginationMaxHeightPx() {
  return A4_PORTRAIT_HEIGHT_PX - A4_STATEMENT_PRINT_HEIGHT_RESERVE_PX;
}

/** Extra table-body rows to subtract when company header/footer grows */
export function countCompanyProfileLayoutRows(profile?: CompanyProfile | null): number {
  if (!profile) return 0;

  const headerLines = [profile.businessNo, profile.phone, profile.fax, profile.address].filter(Boolean).length;
  const headerExtra = headerLines;
  const footerExtra = Math.max(0, companyProfileContactLines(profile).length - 1);

  return headerExtra + footerExtra;
}

export function getStatementMinBodyRows(companyProfile?: CompanyProfile | null) {
  const overhead = countCompanyProfileLayoutRows(companyProfile);
  return Math.max(6, A4_STATEMENT_MIN_BODY_ROWS - Math.ceil(overhead * 0.9));
}

export function getStatementFillerRowCount(visibleBodyRows: number, companyProfile?: CompanyProfile | null) {
  const desired = Math.max(0, getStatementMinBodyRows(companyProfile) - visibleBodyRows);
  const room = Math.max(0, A4_STATEMENT_TABLE_BODY_MAX_ROWS - visibleBodyRows);
  return Math.min(desired, room);
}

/** Derive layout overhead from a rendered statement sheet DOM (for pagination clones). */
export function countCompanyProfileLayoutRowsFromElement(source: HTMLElement): number {
  const headerLines = source.querySelectorAll(".excel-sheet-company-line").length;
  const headerLinks = source.querySelectorAll(".excel-sheet-company-link").length;
  const footerLines = source.querySelectorAll(".excel-footer-company-line").length;
  const footerLinks = source.querySelectorAll(".excel-footer-company-link").length;
  const headerExtra = headerLines + headerLinks;
  const footerExtra = Math.max(0, footerLines + footerLinks - 1);
  return headerExtra + footerExtra;
}

export function getStatementFillerRowCountFromElement(source: HTMLElement, visibleBodyRows: number) {
  const overhead = countCompanyProfileLayoutRowsFromElement(source);
  const minRows = Math.max(6, A4_STATEMENT_MIN_BODY_ROWS - Math.ceil(overhead * 0.9));
  const desired = Math.max(0, minRows - visibleBodyRows);
  const room = Math.max(0, A4_STATEMENT_TABLE_BODY_MAX_ROWS - visibleBodyRows);
  return Math.min(desired, room);
}

export function shouldCaptureStatementAsSingleA4Page(naturalHeightPx: number) {
  return naturalHeightPx <= A4_PORTRAIT_HEIGHT_PX + A4_STATEMENT_CAPTURE_SLACK_PX;
}
