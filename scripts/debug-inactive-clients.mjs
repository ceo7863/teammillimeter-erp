import { loadEnv } from "../server/loadEnv.mjs";
import { getErpState } from "../server/db.mjs";

loadEnv();
const clients = (getErpState().data || {}).clients || [];
const inactive = clients.filter((c) => c.isActive === false);
console.log("total", clients.length, "inactive", inactive.length);
inactive.forEach((c) => console.log("-", c.name));
