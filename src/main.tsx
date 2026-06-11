import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErpErrorBoundary } from "@/components/ErpErrorBoundary";
import { ActionFeedbackProvider } from "@/context/ActionFeedbackContext";
import { clearStaleChunkReloadFlag, reloadOnceForStaleChunks } from "@/utils/dynamicImport";
import "./index.css";

clearStaleChunkReloadFlag();

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
  <React.StrictMode>
    <ActionFeedbackProvider>
      <ErpErrorBoundary>
        <App />
      </ErpErrorBoundary>
    </ActionFeedbackProvider>
  </React.StrictMode>,
);

if (typeof window !== "undefined") {
  window.clearTimeout(window.__erpBootTimer);
}

if ("serviceWorker" in navigator && !/^\/chat\/?$/i.test(window.location.pathname)) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // PWA optional — ignore registration failures in dev.
    });
  });
}
