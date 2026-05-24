import React from "react";

export function StatementFillerRows({ columnCount, rowCount }: { columnCount: number; rowCount: number }) {
  if (rowCount <= 0) return null;

  return (
    <>
      {Array.from({ length: rowCount }, (_, rowIndex) => (
        <tr key={`statement-filler-${rowIndex}`} className="excel-filler-row" aria-hidden>
          {Array.from({ length: columnCount }, (_, cellIndex) => (
            <td key={cellIndex} />
          ))}
        </tr>
      ))}
    </>
  );
}
