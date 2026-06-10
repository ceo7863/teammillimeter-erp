import { getTaxInvoiceScrapRequestUrl } from "../server/barobill/taxInvoiceScrap.mjs";
import {
  getBankAccountScrapRequestUrl,
  getBankAccountManagementUrl,
} from "../server/barobill/bankAccountScrap.mjs";
import { config } from "../server/config.mjs";
import { getErrString } from "../server/barobill/client.mjs";

console.log("BAROBILL_TEST", config.barobill.test);
console.log("getErrString(-10002)", await getErrString(-10002));

for (const [label, fn] of [
  ["taxScrapRequestUrl", getTaxInvoiceScrapRequestUrl],
  ["bankScrapRequestUrl", getBankAccountScrapRequestUrl],
  ["bankManagementUrl", getBankAccountManagementUrl],
]) {
  try {
    const url = await fn();
    console.log(label, "OK", url.slice(0, 80) + "...");
  } catch (error) {
    console.log(label, "ERR", error.message, error.errCode ?? "");
  }
}
