import { getErrString } from "../server/barobill/client.mjs";

const code = Number(process.argv[2] || -10002);
console.log(code, await getErrString(code));
