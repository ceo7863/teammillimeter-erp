import { callBarobillSoap, getErrString, assertBarobillCredentials, getBarobillConfigStatus } from "../server/barobill/client.mjs";

async function describe(code) {
  if (code >= 0) return "success";
  return getErrString(code);
}

async function main() {
  const status = getBarobillConfigStatus();
  console.log("env:", status.test ? "test" : "prod");

  const { certKey, corpNum } = assertBarobillCredentials();
  const refresh = await callBarobillSoap(
    "RefreshTaxInvoiceScrap",
    { CERTKEY: certKey, CorpNum: corpNum },
    "RefreshTaxInvoiceScrapResult",
  );
  const refreshCode = Number(refresh.rawResult);
  console.log("RefreshTaxInvoiceScrap:", refreshCode, await describe(refreshCode));

  const scrapUrl = await callBarobillSoap(
    "GetTaxInvoiceScrapRequestURL",
    { CERTKEY: certKey, CorpNum: corpNum, UserID: status.hasUserId ? process.env.BAROBILL_USER_ID : "", PWD: process.env.BAROBILL_USER_PWD || "" },
    "GetTaxInvoiceScrapRequestURLResult",
  );
  const urlResult = String(scrapUrl.rawResult || "").trim();
  const urlCode = Number(urlResult);
  if (urlCode < 0) {
    console.log("GetTaxInvoiceScrapRequestURL error:", urlCode, await describe(urlCode));
  } else {
    console.log("GetTaxInvoiceScrapRequestURL:", urlResult.slice(0, 80));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
