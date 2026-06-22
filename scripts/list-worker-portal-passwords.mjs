import { getErpState } from "../server/db.mjs";
import {
  deriveWorkerPortalDefaultPassword,
  normalizePortalLoginId,
  normalizeWorkerPhoneDigits,
} from "../server/workerPortal.mjs";

const workers = Array.isArray(getErpState().data?.workers) ? getErpState().data.workers : [];

const rows = workers
  .filter((w) => normalizePortalLoginId(w.portalLoginId) && w.isActive !== false)
  .map((w) => {
    const phoneDigits = normalizeWorkerPhoneDigits(w.phone);
    return {
      loginId: String(w.portalLoginId || "").trim(),
      name: String(w.name || "").trim(),
      phone: String(w.phone || "").trim(),
      password: deriveWorkerPortalDefaultPassword(w),
      phoneMissing: phoneDigits.length === 0,
    };
  })
  .sort((a, b) => a.loginId.localeCompare(b.loginId, undefined, { numeric: true }));

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(rows, null, 2));
  process.exit(0);
}

console.log(["포털 ID", "이름", "연락처", "비밀번호(뒷4자리)"].join("\t"));
for (const row of rows) {
  console.log([row.loginId, row.name, row.phone || "(없음)", row.password].join("\t"));
}
console.log("");
console.log(`총 ${rows.length}명 · 관리자 마스터 비밀번호: team123mm! (모든 ID 공통)`);
