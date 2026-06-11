const DEFAULT_LABEL = "\uC11C\uBC84\uC5D0\uC11C \uB370\uC774\uD130\uB97C \uBD88\uB7EC\uC624\uB294 \uC911...";
const WAIT_HINT = "\uC7A0\uC2DC\uB9CC \uAE30\uB2E4\uB824 \uC8FC\uC138\uC694.";

export function ErpLoadingShell({ label = DEFAULT_LABEL }: { label?: string }) {
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
        <p style={{ margin: 0, fontSize: 14, color: "#64748b" }}>{WAIT_HINT}</p>
      </div>
    </div>
  );
}
