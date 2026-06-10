import { fetchDailyTaxInvoices } from "../server/barobill/taxInvoiceSync.mjs";
import { callBarobillSoapRequest, assertBarobillCredentials, getBarobillConfigStatus } from "../server/barobill/client.mjs";

const DATE_TYPES = [
  { id: 1, label: "????" },
  { id: 2, label: "????" },
  { id: 3, label: "????" },
];

async function fetchPeriodPage({ flowType, startDate, endDate, taxType, dateType, currentPage }) {
  const { certKey, corpNum, userId } = assertBarobillCredentials({ requireUserId: true });
  const operation =
    flowType === "purchase" ? "GetPeriodTaxInvoicePurchaseList" : "GetPeriodTaxInvoiceSalesList";
  const resultTag = `${operation}Result`;

  const xml = await callBarobillSoapRequest(operation, {
    CERTKEY: certKey,
    CorpNum: corpNum,
    UserID: userId,
    TaxType: String(taxType),
    DateType: String(dateType),
    StartDate: startDate.replace(/-/g, ""),
    EndDate: endDate.replace(/-/g, ""),
    CountPerPage: "100",
    CurrentPage: String(currentPage),
  });

  const maxIndexMatch = xml.match(/<MaxIndex>([^<]*)<\/MaxIndex>/i);
  const maxIndex = Number(maxIndexMatch?.[1] || 0);
  const blockCount = (xml.match(/<SimpleTaxInvoiceEx/gi) || []).length;
  return { maxIndex, blockCount, snippet: xml.slice(0, 500) };
}

async function main() {
  const startDate = process.argv[2] || "2025-01-01";
  const endDate = process.argv[3] || "2026-05-31";
  const status = getBarobillConfigStatus();

  console.log(JSON.stringify({ env: status.test ? "test" : "prod", startDate, endDate }, null, 2));

  for (const flowType of ["sales", "purchase"]) {
    for (const taxType of [1, 2, 3, 4]) {
      for (const dateType of DATE_TYPES) {
        try {
          const page = await fetchPeriodPage({
            flowType,
            startDate,
            endDate,
            taxType,
            dateType: dateType.id,
            currentPage: 1,
          });
          if (page.blockCount > 0 || page.maxIndex > 0) {
            console.log(`${flowType} TaxType${taxType} DateType${dateType.id}(${dateType.label}): maxIndex=${page.maxIndex} blocks=${page.blockCount}`);
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          if (!msg.includes("TaxType")) {
            console.log(`${flowType} TaxType${taxType} DateType${dateType.id}: ERR ${msg.slice(0, 80)}`);
          }
        }
      }
    }
  }

  const sampleDay = endDate;
  const baseDate = sampleDay.replace(/-/g, "");
  for (const flowType of ["sales", "purchase"]) {
    for (const taxType of [1, 3]) {
      try {
        const blocks = await fetchDailyTaxInvoices({ flowType, baseDate, taxType });
        console.log(`daily ${sampleDay} ${flowType} tax${taxType}: ${blocks.length} blocks`);
      } catch (error) {
        console.log(`daily ${sampleDay} ${flowType} tax${taxType}: ERR ${(error instanceof Error ? error.message : error).slice(0, 80)}`);
      }
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
