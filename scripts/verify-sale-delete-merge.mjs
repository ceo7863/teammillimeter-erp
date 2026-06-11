import assert from "node:assert/strict";
import { mergeSalesByUpdatedAt } from "../src/utils/erpStateMerge.ts";

const server = [
  { id: "1", updatedAt: "2026-01-01T00:00:00.000Z" },
  { id: "2", updatedAt: "2026-01-01T00:00:00.000Z" },
];
const local = [{ id: "1", updatedAt: "2026-01-02T00:00:00.000Z" }];

assert.deepEqual(
  mergeSalesByUpdatedAt(server, local, { suppressedServerIds: new Set(["2"]) }).map((row) => row.id),
  ["1"],
);

assert.deepEqual(
  mergeSalesByUpdatedAt(server, local).map((row) => row.id).sort(),
  ["1", "2"],
);

console.log("verify-sale-delete-merge: ok");
