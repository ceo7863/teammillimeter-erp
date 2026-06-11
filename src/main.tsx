import React, { startTransition } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErpErrorBoundary } from "@/components/ErpErrorBoundary";
import { ActionFeedbackProvider } from "@/context/ActionFeedbackContext";
import { clearStaleChunkReloadFlag, reloadOnceForStaleChunks } from "@/utils/dynamicImport";
import { installErpBootRecovery, resetDocumentScrollLock } from "@/utils/erpBootRecovery";
import "./index.css";

clearStaleChunkReloadFlag();
installErpBootRecovery();

window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  reloadOnceForStaleChunks();
});

declare global {
  interface Window {
    __erpBootTimer?: number;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <ActionFeedbackProvider>
    <ErpErrorBoundary>
      <App />
    </ErpErrorBoundary>
  </ActionFeedbackProvider>,
);

if (typeof window !== "undefined") {
  window.clearTimeout(window.__erpBootTimer);
  resetDocumentScrollLock();
}

if ("serviceWorker" in navigator && !/^\/chat\/?$/i.test(window.location.pathname)) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // PWA optional — ignore registration failures in dev.
    });
  });
}
