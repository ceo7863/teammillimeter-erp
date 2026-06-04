import React, { useLayoutEffect, useRef, useState } from "react";

const SHEET_WIDTH_PX = 794;

type WorkerPortalStatementScalerProps = {
  children: React.ReactNode;
};

export function WorkerPortalStatementScaler({ children }: WorkerPortalStatementScalerProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState({ scale: 1, sheetHeight: 1123 });

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const sheet = sheetRef.current;
    if (!viewport || !sheet) return;

    const update = () => {
      const sheetHeight = Math.max(sheet.offsetHeight, 1);
      const availWidth = viewport.clientWidth;
      const availHeight = viewport.clientHeight;
      if (availWidth <= 0 || availHeight <= 0) return;

      if (window.matchMedia("(min-width: 768px)").matches) {
        setLayout({ scale: 1, sheetHeight });
        return;
      }

      const scaleX = availWidth / SHEET_WIDTH_PX;
      const scaleY = availHeight / sheetHeight;
      const scale = Math.min(1, scaleX, scaleY);
      setLayout({ scale, sheetHeight });
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    observer.observe(sheet);
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, [children]);

  const marginBottom = layout.scale < 1 ? layout.sheetHeight * (layout.scale - 1) : undefined;

  return (
    <div ref={viewportRef} className="erp-worker-portal-statement-viewport">
      <div
        className="erp-worker-portal-statement-scaler"
        style={{
          width: SHEET_WIDTH_PX,
          transform: layout.scale < 1 ? `scale(${layout.scale})` : undefined,
          transformOrigin: "top center",
          marginBottom,
        }}
      >
        <div ref={sheetRef}>{children}</div>
      </div>
    </div>
  );
}
