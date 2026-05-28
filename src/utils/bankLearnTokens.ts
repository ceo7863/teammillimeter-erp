function normalizeLearnToken(text: string) {
  return String(text || "").toLowerCase().replace(/\s+/g, "");
}

/** Generic IBK / transfer tokens that must not drive folder or ledger learn rules. */
export const BANK_LEARN_STOP_TOKENS = new Set(
  [
    "\uC778\uD130\uB137",
    "\uCCB4\uD06C",
    "\uD8FC\uC774\uCCB4",
    "\uD8FC\uB1A1\uD0B9",
    "\uC774\uCCB4",
    "\uC785\uAE08",
    "\uCD9C\uAE08",
    "\uC804\uC790\uAE08\uC735",
    "\uD398\uC774",
    "\uC2B9\uC778",
    "\uD658\uBD88",
    "\uAE30\uC5C5",
    "\uAE30\uC5C5\uC740\uD589",
    "\uAD6D\uBBFC",
    "\uAD6D\uBBFC\uC740\uD589",
    "\uC2E0\uD55C",
    "\uC6B0\uB9AC",
    "\uD558\uB098",
    "\uB18D\uD611",
    "\uCE74\uCE74\uC624",
    "\uD1A0\uC2A4",
    "\uC528\uD2F0",
    "\uC0C8\uB9C8\uC744",
    "\uC2E0\uD611",
    "\uC218\uD611",
    "\uC6B0\uCCB4\uAD6D",
    "\uC740\uD589",
    "ibk",
    "kb",
    "nh",
    "internet",
    "check",
    "transfer",
  ].map((token) => normalizeLearnToken(token)),
);

export function isBankLearnStopToken(token: string) {
  const normalized = normalizeLearnToken(token);
  if (!normalized || normalized.length < 2) return true;
  return BANK_LEARN_STOP_TOKENS.has(normalized);
}

export function filterBankLearnDescriptionTokens(tokens: string[]) {
  return [...new Set(tokens.map((token) => String(token || "").trim()).filter(Boolean))].filter(
    (token) => !isBankLearnStopToken(token),
  );
}
