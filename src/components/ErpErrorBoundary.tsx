import React from "react";

type ErpErrorBoundaryProps = {
  children: React.ReactNode;
};

type ErpErrorBoundaryState = {
  error: Error | null;
};

const TITLE = "\uD654\uBA74\uC744 \uD45C\uC2DC\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4";
const UNKNOWN_ERROR = "\uC54C \uC218 \uC5C6\uB294 \uC624\uB958";
const RELOAD_LABEL = "\uC0C8\uB85C\uACE0\uCE68";

export class ErpErrorBoundary extends React.Component<ErpErrorBoundaryProps, ErpErrorBoundaryState> {
  state: ErpErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("ERP render error:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: "100dvh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            background: "#f8fafc",
            color: "#334155",
            fontFamily: "system-ui, sans-serif",
            textAlign: "center",
          }}
          lang="ko"
        >
          <div>
            <p style={{ fontWeight: 700, margin: "0 0 8px" }}>{TITLE}</p>
            <p style={{ margin: "0 0 16px", fontSize: 14, color: "#64748b" }}>
              {this.state.error.message || UNKNOWN_ERROR}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                padding: "10px 16px",
                border: 0,
                borderRadius: 10,
                background: "#0f172a",
                color: "#fff",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {RELOAD_LABEL}
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
