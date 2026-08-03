import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { fileURLToPath } from "node:url";
import { resolveDeployVersionFromRoot } from "./scripts/resolve-deploy-version.mjs";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

function resolveClientDeployVersion() {
  return resolveDeployVersionFromRoot(rootDir) || "dev";
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __ERP_CLIENT_VERSION__: JSON.stringify(resolveClientDeployVersion()),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      jszip: path.resolve(__dirname, "node_modules/jszip/dist/jszip.min.js"),
    },
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
    },
    watch: {
      ignored: ["**/tmp-*/**"],
    },
  },
});
