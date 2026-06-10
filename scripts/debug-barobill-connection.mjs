import { testBarobillConnection } from "../server/barobill/client.mjs";
import { config } from "../server/config.mjs";

console.log("test mode", config.barobill.test);
console.log("hasCert", Boolean(config.barobill.certKey));
console.log("corpNum", config.barobill.corpNum ? config.barobill.corpNum.slice(0, 3) + "***" : "");
console.log("userId", config.barobill.userId || "");

const result = await testBarobillConnection();
console.log(JSON.stringify(result, null, 2));
