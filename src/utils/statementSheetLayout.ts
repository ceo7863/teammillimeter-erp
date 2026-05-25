export const A4_PORTRAIT_WIDTH_PX = 794;
export const A4_PORTRAIT_HEIGHT_PX = 1123;
export const A4_STATEMENT_MIN_BODY_ROWS = 30;
/** Footer/logo subpixel overflow above A4 still counts as one page */
export const A4_STATEMENT_CAPTURE_SLACK_PX = 28;

export function getStatementFillerRowCount(visibleBodyRows: number) {
  return Math.max(0, A4_STATEMENT_MIN_BODY_ROWS - visibleBodyRows);
}

export function shouldCaptureStatementAsSingleA4Page(naturalHeightPx: number) {
  return naturalHeightPx <= A4_PORTRAIT_HEIGHT_PX + A4_STATEMENT_CAPTURE_SLACK_PX;
}
