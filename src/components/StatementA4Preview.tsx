import React from "react";

type StatementA4PreviewProps = {
  children: React.ReactNode;
};

/** A4 ??(794px) ? ?? ?? ??? ?? ??? ?? */
export function StatementA4Preview({ children }: StatementA4PreviewProps) {
  return (
    <div className="erp-statement-a4-preview">
      <div className="erp-statement-a4-pages">
        <div className="erp-statement-a4-frame">
          <div className="erp-statement-a4-page">{children}</div>
        </div>
      </div>
    </div>
  );
}
