import React, { useLayoutEffect, useRef, useState } from "react";

type StatementFitCellProps = {
  children: React.ReactNode;
  className?: string;
  align?: "left" | "right" | "center";
  minFontSize?: number;
  baseFontSize?: number;
};

export function StatementFitCell({
  children,
  className = "",
  align = "left",
  minFontSize = 7,
  baseFontSize = 10.5,
}: StatementFitCellProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [fontSize, setFontSize] = useState(baseFontSize);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const text = textRef.current;
    if (!container || !text) return;

    const fit = () => {
      const content = String(children ?? "").trim();
      if (!content) {
        setFontSize(baseFontSize);
        text.style.fontSize = `${baseFontSize}px`;
        return;
      }

      let nextSize = baseFontSize;
      text.style.fontSize = `${nextSize}px`;

      const maxWidth = container.clientWidth;
      if (maxWidth <= 0) {
        setFontSize(nextSize);
        return;
      }

      while (nextSize > minFontSize && text.scrollWidth > maxWidth) {
        nextSize -= 0.5;
        text.style.fontSize = `${nextSize}px`;
      }

      setFontSize(nextSize);
    };

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(container);
    return () => observer.disconnect();
  }, [children, baseFontSize, minFontSize]);

  return (
    <div ref={containerRef} className={`excel-fit-cell excel-fit-cell--${align} ${className}`.trim()}>
      <span ref={textRef} className="excel-fit-cell-text" style={{ fontSize: `${fontSize}px` }}>
        {children}
      </span>
    </div>
  );
}

type StatementFitTdProps = StatementFitCellProps & {
  tdClassName?: string;
  colSpan?: number;
};

export function StatementFitTd({
  children,
  tdClassName = "",
  colSpan,
  className = "",
  align = "left",
  minFontSize = 7,
  baseFontSize = 10.5,
}: StatementFitTdProps) {
  return (
    <td className={tdClassName} colSpan={colSpan}>
      <StatementFitCell className={className} align={align} minFontSize={minFontSize} baseFontSize={baseFontSize}>
        {children}
      </StatementFitCell>
    </td>
  );
}
