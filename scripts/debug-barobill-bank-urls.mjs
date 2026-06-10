import { getBankAccountManagementUrl, getBankAccountScrapRequestUrl } from "../server/barobill/bankAccountScrap.mjs";
import { getBankAccountScrapRegistrationStatus } from "../server/barobill/bankAccountScrap.mjs";

try {
  console.log("registration", await getBankAccountScrapRegistrationStatus());
} catch (error) {
  console.log("registration error", error.message);
}

try {
  console.log("managementUrl", await getBankAccountManagementUrl());
} catch (error) {
  console.log("managementUrl error", error.message);
}

try {
  console.log("scrapRequestUrl", await getBankAccountScrapRequestUrl());
} catch (error) {
  console.log("scrapRequestUrl error", error.message);
}
