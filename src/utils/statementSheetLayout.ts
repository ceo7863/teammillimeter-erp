export const A4_PORTRAIT_WIDTH_PX = 794;
export const A4_PORTRAIT_HEIGHT_PX = 1123;
export const A4_STATEMENT_MIN_BODY_ROWS = 30;

export function getStatementFillerRowCount(visibleBodyRows: number) {
  return Math.max(0, A4_STATEMENT_MIN_BODY_ROWS - visibleBodyRows);
}
