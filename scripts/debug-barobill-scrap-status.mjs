import { checkTaxInvoiceScrapService } from "../server/barobill/taxInvoiceScrap.mjs";
import { callBarobillSoap, assertBarobillCredentials, getErrString } from "../server/barobill/client.mjs";

async function main() {
  const status = await checkTaxInvoiceScrapService();
  console.log("scrap check:", JSON.stringify(status, null, 2));

  const { certKey, corpNum } = assertBarobillCredentials();
  const { rawResult } = await callBarobillSoap(
    "RefreshTaxInvoiceScrap",
    { CERTKEY: certKey, CorpNum: corpNum },
    "RefreshTaxInvoiceScrapResult",
  );
  const code = Number(String(rawResult || "").trim());
  console.log("raw refresh code:", code);
  if (code < 0) {
    console.log("err string:", await getErrString(code));
  }
}

main().catch(console.error);
