import crypto from "crypto";
import { loadEnv } from "../server/loadEnv.mjs";
import { config } from "../server/config.mjs";
import { getContractById, issueSignToken } from "../server/clientContracts.mjs";
import { sendContractAlimtalk } from "../server/alimtalkNotify.mjs";

loadEnv();

function authHeader() {
  const date = new Date()
    .toLocaleString("sv-SE", { timeZone: "Asia/Seoul", hour12: false })
    .replace("T", " ");
  const salt = crypto.randomBytes(8).toString("hex");
  const signature = crypto
    .createHmac("sha256", config.alimtalk.apiSecret)
    .update(date + salt)
    .digest("hex");
  return `HMAC-SHA256 apiKey=${config.alimtalk.apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
}

const contractId = process.argv[2] || "cc-1780898606693-d1a9e64b";
const contract = getContractById(contractId);
if (!contract) throw new Error("contract not found");

console.log("contract:", JSON.stringify({ clientName: contract.clientName, title: contract.title }));
console.log("client hex:", Buffer.from(contract.clientName || "", "utf8").toString("hex"));

const tokenResult = issueSignToken(contractId, 24);
const signUrl = `${config.alimtalk.erpBaseUrl.replace(/\/$/, "")}/sign/${tokenResult.token}`;

const payload = {
  phones: [contract.contactPhone],
  variables: {
    client: contract.clientName,
    title: contract.title,
    token: tokenResult.token,
    url: signUrl,
  },
};

console.log("payload vars:", JSON.stringify(payload.variables));

const result = await sendContractAlimtalk(payload);
console.log("send ok:", result.ok, result.body?.groupInfo?.groupId);

await new Promise((r) => setTimeout(r, 3000));

const groupId = result.body?.groupInfo?.groupId;
const listRes = await fetch(`https://api.solapi.com/messages/v4/list?groupId=${encodeURIComponent(groupId)}`, {
  headers: { Authorization: authHeader() },
});
const list = await listRes.json();
console.log("list keys:", Object.keys(list));
console.log("first msg:", JSON.stringify(list.messageList?.[0] || list.messages?.[0] || list, null, 2).slice(0, 2500));
