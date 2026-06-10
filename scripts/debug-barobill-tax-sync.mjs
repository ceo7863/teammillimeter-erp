import { checkTaxInvoiceScrapService, getTaxInvoiceScrapRequestUrl } from "../server/barobill/taxInvoiceScrap.mjs";
import { syncBarobillTaxInvoices } from "../server/barobill/taxInvoiceSync.mjs";
import { getDb, getErpState } from "../server/db.mjs";
import { config } from "../server/config.mjs";

getDb();

console.log("barobill.test", config.barobill.test);

const scrap = await checkTaxInvoiceScrapService();
console.log("scrap", JSON.stringify(scrap, null, 2));

try {
  console.log("scrapRequestUrl", await getTaxInvoiceScrapRequestUrl());
} catch (error) {
  console.log("scrapRequestUrl error", error.message);
}

const startDate = process.argv[2] || "2026-06-01";
const endDate = process.argv[3] || "2026-06-09";
const state = getErpState();
const before = (state.data.taxInvoices || []).length;

const result = await syncBarobillTaxInvoices({
  existing: state.data.taxInvoices || [],
  startDate,
  endDate,
  requestRefresh: true,
});

const june = (result.taxInvoices || []).filter((row) =>
  String(row.issueDate || row.writtenDate || "").startsWith("2026-06"),
);

console.log(
  JSON.stringify(
    {
      startDate,
      endDate,
      before,
      after: result.taxInvoices?.length || 0,
      added: (result.taxInvoices?.length || 0) - before,
      juneCount: june.length,
      errors: result.errors || [],
      notices: result.notices || [],
      scrapStatus: result.scrapStatus || null,
      fetched: result.fetched ?? null,
    },
    null,
    2,
  ),
);
