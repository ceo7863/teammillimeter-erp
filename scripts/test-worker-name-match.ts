import {
  bankTextMatchesWorker,
  findWorkerForBankTransaction,
} from "../src/utils/clientDepositAliases.ts";

const worker = { name: "???(???)", depositNameAliases: "" };

console.assert(bankTextMatchesWorker("???", worker), "bank text ??? should match worker");
console.assert(
  findWorkerForBankTransaction(
    {
      counterpartyName: "???",
      description: "???",
      memo: "",
    },
    [worker],
  )?.name === "???(???)",
  "duplicate counterparty+description should still match",
);
console.assert(
  findWorkerForBankTransaction(
    {
      counterpartyName: "",
      description: "???",
      memo: "",
    },
    [worker],
  )?.name === "???(???)",
  "description-only should match",
);

console.log("worker name match tests passed");
