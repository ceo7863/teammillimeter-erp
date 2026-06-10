import { syncBarobillTaxInvoices } from "../server/barobill/taxInvoiceSync.mjs";
import { getDb, getErpState, saveErpState } from "../server/db.mjs";

getDb();

const startDate = process.argv[2] || "2026-06-01";
const endDate = process.argv[3] || "2026-06-09";
const state = getErpState();
const before = (state.data.taxInvoices || []).length;

const result = await syncBarobillTaxInvoices({
  startDate,
  endDate,
  flowTypes: ["purchase", "sales"],
  existing: state.data.taxInvoices || [],
  author: { name: "repair", loginId: "repair" },
  apply: true,
  requestRefresh: true,
});

const next = result.taxInvoices || state.data.taxInvoices || [];
const saved = saveErpState(
  { ...state.data, taxInvoices: next },
  state.version,
  "repair-barobill-tax-sync",
);

const june = next.filter((row) =>
  String(row.issueDate || row.writtenDate || "").startsWith("2026-06"),
);

console.log(
  JSON.stringify(
    {
      startDate,
      endDate,
      before,
      after: next.length,
      added: next.length - before,
      juneCount: june.length,
      savedVersion: saved.version,
      notices: result.notices || [],
      scrapStatus: result.scrapStatus || null,
      errors: result.errors?.slice?.(0, 5) || [],
    },
    null,
    2,
  ),
);
