import {
  detectScScheduleChargeHeadcountWarning,
} from "../src/utils/scScheduleSaleImport.ts";

const baseLines = [
  { worker: "\uAE40\uC2DC\uACF5", quantity: "1", chargeAmount: "330000" },
  { worker: "\uC774\uC2DC\uACF5", quantity: "1", chargeAmount: "330000" },
];

const mockClients = [{ name: "\uD14C\uC2A4\uD2B8\uAC70\uB798\uCC98", customChargeCost: 330000 }];

const warn = detectScScheduleChargeHeadcountWarning(
  {
    client: "\uD14C\uC2A4\uD2B8\uAC70\uB798\uCC98",
    workers: [...baseLines, { worker: "\uBC15\uC2DC\uACF5", quantity: "1", chargeAmount: "100000" }],
  },
  2,
  mockClients,
);
if (
  !warn ||
  warn.requestedChargeTotal !== 660000 ||
  warn.actualChargeTotal !== 760000 ||
  warn.overchargeAmount !== 100000
) {
  throw new Error(`unexpected warning: ${JSON.stringify(warn)}`);
}

const clientPriceWarn = detectScScheduleChargeHeadcountWarning(
  {
    client: "\uD14C\uC2A4\uD2B8\uAC70\uB798\uCC98",
    workers: [
      { worker: "\uAE40\uC2DC\uACF5", quantity: "1", chargeAmount: "265000" },
      { worker: "\uC774\uC2DC\uACF5", quantity: "1", chargeAmount: "265000" },
      { worker: "\uBC15\uC2DC\uACF5", quantity: "1", chargeAmount: "330000" },
    ],
  },
  2,
  mockClients,
);
if (
  !clientPriceWarn ||
  clientPriceWarn.requestedChargeTotal !== 660000 ||
  clientPriceWarn.actualChargeTotal !== 860000 ||
  clientPriceWarn.overchargeAmount !== 200000
) {
  throw new Error(`unexpected client-price warning: ${JSON.stringify(clientPriceWarn)}`);
}

const noWarn = detectScScheduleChargeHeadcountWarning({ workers: baseLines }, 2);
if (noWarn) {
  throw new Error(`expected no warning for 2 workers: ${JSON.stringify(noWarn)}`);
}

const noWarnSameCharge = detectScScheduleChargeHeadcountWarning(
  {
    workers: [...baseLines, { worker: "\uBC15\uC2DC\uACF5", quantity: "1", chargeAmount: "0" }],
  },
  2,
);
if (noWarnSameCharge) {
  throw new Error(`expected no warning when extra worker has zero charge: ${JSON.stringify(noWarnSameCharge)}`);
}

console.log("verify-sc-schedule-charge-warning: ok");
