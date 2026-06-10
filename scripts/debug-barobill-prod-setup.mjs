import { testBarobillConnection } from "../server/barobill/client.mjs";
import { getTaxInvoiceScrapRequestUrl } from "../server/barobill/taxInvoiceScrap.mjs";
import {
  getBankAccountScrapRequestUrl,
  checkBankAccountScrapService,
} from "../server/barobill/bankAccountScrap.mjs";
import { checkTaxInvoiceScrapService } from "../server/barobill/taxInvoiceScrap.mjs";
import { config } from "../server/config.mjs";

console.log("mode", config.barobill.test ? "test" : "prod");
console.log("cert", config.barobill.certKey ? config.barobill.certKey.slice(0, 8) + "..." : "missing");

const conn = await testBarobillConnection();
console.log("connection", JSON.stringify(conn, null, 2));

for (const [label, fn] of [
  ["taxScrapStatus", checkTaxInvoiceScrapService],
  ["bankScrapStatus", () => checkBankAccountScrapService()],
]) {
  try {
    console.log(label, await fn());
  } catch (e) {
    console.log(label, "ERR", e.message);
  }
}

for (const [label, fn] of [
  ["taxScrapUrl", getTaxInvoiceScrapRequestUrl],
  ["bankScrapUrl", getBankAccountScrapRequestUrl],
]) {
  try {
    const url = await fn();
    console.log(label, url.startsWith("https://www.barobill") || url.startsWith("https://barobill") ? "prod portal" : url.slice(0, 40));
  } catch (e) {
    console.log(label, "ERR", e.message, e.errCode ?? "");
  }
}
