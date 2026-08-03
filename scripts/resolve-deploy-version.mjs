import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

export function resolveDeployVersionFromRoot(rootDir, envValue) {
  const fromEnv = String(envValue || process.env.ERP_DEPLOY_VERSION || "").trim();
  if (fromEnv) return fromEnv;

  const versionFile = path.join(rootDir, "deploy-version.txt");
  try {
    if (fs.existsSync(versionFile)) {
      const fromFile = fs.readFileSync(versionFile, "utf8").trim();
      if (fromFile) return fromFile;
    }
  } catch {
    // ignore
  }

  try {
    const sha = execSync("git rev-parse HEAD", {
      cwd: rootDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (sha) return sha;
  } catch {
    // ignore
  }

  return "";
}
