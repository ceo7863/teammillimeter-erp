export function ErpLoadingShell({ label = "???? ???? ???? ?..." }: { label?: string }) {
  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "#f1f5f9",
        color: "#334155",
        fontFamily: "system-ui, sans-serif",
        textAlign: "center",
      }}
      lang="ko"
    >
      <div>
        <p style={{ fontWeight: 700, margin: "0 0 8px", fontSize: 16 }}>{label}</p>
        <p style={{ margin: 0, fontSize: 14, color: "#64748b" }}>??? ??? ???.</p>
      </div>
    </div>
  );
}
