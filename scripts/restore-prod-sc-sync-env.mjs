#!/usr/bin/env node
/** Merge .sc-sync-recovery.env keys into prod .env via SSH. */
import fs from "fs";
import { execSync } from "child_process";

const host = process.env.DEPLOY_SSH_HOST || "teammillimeter-erp";
const remoteRoot = process.env.DEPLOY_REMOTE_ROOT || "/home/ubuntu/teammillimeter-erp";
const recoveryPath = new URL("../.sc-sync-recovery.env", import.meta.url);

if (!fs.existsSync(recoveryPath)) {
  console.error("Missing .sc-sync-recovery.env � run: node scripts/_build-sc-sync-recovery.mjs");
  process.exit(1);
}

const recovery = fs.readFileSync(recoveryPath, "utf8");
const keys = [...recovery.matchAll(/^([A-Z0-9_]+)=/gm)].map((m) => m[1]);
if (!keys.length) {
  console.error("No keys in recovery file");
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
execSync(`ssh ${host} "cp ${remoteRoot}/.env ${remoteRoot}/.env.bak.${stamp}"`, { stdio: "inherit" });

for (const key of keys) {
  execSync(`ssh ${host} "sed -i '/^${key}=/d' ${remoteRoot}/.env"`, { stdio: "inherit" });
}

const tmp = "/tmp/sc-sync-recovery.env";
fs.writeFileSync(".sc-sync-recovery.env", recovery, "utf8");
execSync(`scp .sc-sync-recovery.env ${host}:${tmp}`, { stdio: "inherit" });
execSync(`ssh ${host} "cat ${tmp} >> ${remoteRoot}/.env && rm -f ${tmp}"`, { stdio: "inherit" });

execSync(`ssh ${host} "cd ${remoteRoot} && pm2 restart erp --update-env && node scripts/sc-sync-schedules.mjs"`, {
  stdio: "inherit",
});

execSync(`ssh ${host} "cd ${remoteRoot} && node scripts/debug-alimtalk-recipients.mjs"`, { stdio: "inherit" });

console.log("SC sync env restored and sync triggered.");
