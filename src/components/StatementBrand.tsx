const LOGO_SRC = "/team-mm-logo.png";

export function StatementSheetHeader({ title }: { title: string }) {
  return (
    <header className="excel-sheet-header">
      <img src={LOGO_SRC} alt="TEAM mm" className="excel-sheet-logo" />
      <h1 className="excel-sheet-title">{title}</h1>
    </header>
  );
}

export function StatementSheetFooter() {
  return (
    <div className="excel-footer-brand">
      <img src={LOGO_SRC} alt="TEAM mm" className="excel-footer-logo" />
    </div>
  );
}
