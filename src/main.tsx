import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ActionFeedbackProvider } from "@/context/ActionFeedbackContext";
import { clearStaleChunkReloadFlag, reloadOnceForStaleChunks } from "@/utils/dynamicImport";
import "./index.css";

clearStaleChunkReloadFlag();

window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  reloadOnceForStaleChunks();
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ActionFeedbackProvider>
      <App />
    </ActionFeedbackProvider>
  </React.StrictMode>,
);

if ("serviceWorker" in navigator && !/^\/chat\/?$/i.test(window.location.pathname)) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // PWA optional — ignore registration failures in dev.
    });
  });
}
