export type PaymentDepositChannel = "cash" | "personal";

export const PAYMENT_DEPOSIT_CHANNEL_OPTIONS: Array<{ value: PaymentDepositChannel; label: string }> = [
  { value: "cash", label: "\uD604\uAE08" },
  { value: "personal", label: "\uAC1C\uC778\uD1B5\uC7A5" },
];

export function normalizePaymentDepositChannel(value: unknown): PaymentDepositChannel {
  return value === "cash" ? "cash" : "personal";
}

export function formatPaymentDepositChannel(value: unknown) {
  return normalizePaymentDepositChannel(value) === "cash" ? "\uD604\uAE08" : "\uAC1C\uC778\uD1B5\uC7A5";
}
