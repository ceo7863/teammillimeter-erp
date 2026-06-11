const BOOT_ERROR_ID = "erp-boot-error-fallback";

export function resetDocumentScrollLock() {
  if (typeof document === "undefined") return;
  document.body.style.removeProperty("overflow");
  document.body.style.removeProperty("position");
  document.documentElement.style.removeProperty("overflow");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isBenignBootError(message: string) {
  return /Notification.*Illegal constructor/i.test(message);
}

export function showBootFailure(message: string) {
  if (typeof document === "undefined") return;
  resetDocumentScrollLock();
  let node = document.getElementById(BOOT_ERROR_ID);
  if (!node) {
    node = document.createElement("div");
    node.id = BOOT_ERROR_ID;
    document.body.appendChild(node);
  }
  node.innerHTML = `<div style="min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:24px;background:#f8fafc;color:#334155;font-family:system-ui,sans-serif;text-align:center"><div><p style="font-weight:700;margin:0 0 8px">\uC571\uC744 \uC2E4\uD589\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4</p><p style="margin:0 0 16px;font-size:14px;color:#64748b">${escapeHtml(message)}</p><button type="button" onclick="location.reload()" style="padding:10px 16px;border:0;border-radius:10px;background:#0f172a;color:#fff;font-weight:700">\uC0C8\uB85C\uACE0\uCE68</button></div></div>`;
}

export function installErpBootRecovery() {
  if (typeof window === "undefined") return;

  resetDocumentScrollLock();

  window.addEventListener("error", (event) => {
    const message = event.error instanceof Error ? event.error.message : event.message;
    if (!message || isBenignBootError(message)) return;
    showBootFailure(message);
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message =
      reason instanceof Error ? reason.message : typeof reason === "string" ? reason : "\uC54C \uC218 \uC5C6\uB294 \uC624\uB958";
    if (isBenignBootError(message)) return;
    showBootFailure(message);
  });
}
