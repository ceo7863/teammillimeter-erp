import React from "react";

const FILLER_ROW_HEIGHT_PX = 22;

export function StatementFillerRows({ columnCount, rowCount }: { columnCount: number; rowCount: number }) {
  if (rowCount <= 0) return null;

  return (
    <tr
      className="excel-filler-spacer excel-filler-row"
      aria-hidden
      style={{ ["--statement-filler-min-height" as string]: `${Math.max(rowCount * FILLER_ROW_HEIGHT_PX, 48)}px` }}
    >
      <td colSpan={columnCount} />
    </tr>
  );
}
