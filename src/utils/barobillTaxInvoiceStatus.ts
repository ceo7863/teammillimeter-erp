import { extractBarobillMgtKeyFromMemo } from "@/utils/barobillMgtKey";
import type { TaxInvoice } from "@/utils/taxInvoices";

export type BarobillNtsTransmissionTone = "pending" | "sending" | "sent" | "failed" | "unknown";

export type BarobillNtsTransmissionDisplay = {
  label: string;
  tone: BarobillNtsTransmissionTone;
  title?: string;
};

export function resolveBarobillMgtKey(row: Pick<TaxInvoice, "barobillMgtKey" | "memo">) {
  return String(row.barobillMgtKey || "").trim() || extractBarobillMgtKeyFromMemo(row.memo);
}

export function isBarobillIssuedTaxInvoice(row: Pick<TaxInvoice, "barobillMgtKey" | "memo" | "flowType">) {
  return row.flowType === "sales" && Boolean(resolveBarobillMgtKey(row));
}

export function getBarobillNtsTransmissionDisplay(row: TaxInvoice): BarobillNtsTransmissionDisplay | null {
  if (!isBarobillIssuedTaxInvoice(row)) return null;

  const state = Number(row.barobillNtsSendState) || 0;
  const option = Number(row.barobillNtsSendOption) || 0;

  if (state === 4) {
    return { label: "\uAD6D\uC138\uCCAD \uC804\uC1A1\uC644\uB8CC", tone: "sent" };
  }
  if (state === 2) {
    return { label: "\uAD6D\uC138\uCCAD \uC804\uC1A1\uC911", tone: "sending" };
  }
  if (state === 3 || state === 5) {
    return { label: "\uAD6D\uC138\uCCAD \uC804\uC1A1\uC2E4\uD328", tone: "failed" };
  }
  if (state === 1) {
    return {
      label: "\uBC1C\uAE09\uC644\uB8CC\u00B7\uBBF8\uC804\uC1A1",
      tone: "pending",
      title:
        option === 2
          ? "\uBC14\uB85C\uBE4C \uBC1C\uAE09 \uC644\uB8CC. \uC775\uC77C 14\uC2DC \uAD6D\uC138\uCCAD \uC790\uB3D9 \uC804\uC1A1 \uC608\uC815\uC785\uB2C8\uB2E4."
          : "\uBC14\uB85C\uBE4C \uBC1C\uAE09 \uC644\uB8CC. \uAD6D\uC138\uCCAD \uC804\uC1A1 \uC804\uC785\uB2C8\uB2E4.",
    };
  }

  return {
    label: "\uBC14\uB85C\uBE4C \uBC1C\uAE09",
    tone: "unknown",
    title: "\uAD6D\uC138\uCCAD \uC804\uC1A1 \uC0C1\uD0DC\uB97C \uC870\uD68C \uC911\uC785\uB2C8\uB2E4.",
  };
}

export function buildBarobillIssueResultMessage(input: {
  invoiceNo?: string;
  ntsSendState?: number;
}) {
  const base = "\uC804\uC790\uACC4\uC0B0\uC11C\uAC00 \uBC1C\uD589\uB418\uC5C8\uC2B5\uB2C8\uB2E4.";
  const state = Number(input.ntsSendState) || 0;
  const invoiceNo = String(input.invoiceNo || "").trim();

  if (state === 4) {
    return invoiceNo
      ? `${base} (\uAD6D\uC138\uCCAD \uC804\uC1A1\uC644\uB8CC \u00B7 \uC2B9\uC778\uBC88\uD638: ${invoiceNo})`
      : `${base} (\uAD6D\uC138\uCCAD \uC804\uC1A1\uC644\uB8CC)`;
  }
  if (state === 2) {
    return `${base} (\uAD6D\uC138\uCCAD \uC804\uC1A1 \uC911)`;
  }
  if (state === 3 || state === 5) {
    return `${base} (\uAD6D\uC138\uCCAD \uC804\uC1A1 \uC2E4\uD328)`;
  }
  if (state === 1) {
    return `${base} (\uBC1C\uAE09\uC644\uB8CC \u00B7 \uAD6D\uC138\uCCAD \uBBF8\uC804\uC1A1)`;
  }
  if (invoiceNo) {
    return `${base} (\uC2B9\uC778\uBC88\uD638: ${invoiceNo})`;
  }
  return base;
}
