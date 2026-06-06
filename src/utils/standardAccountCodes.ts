type AccountCodeFlow = "income" | "expense" | "both";
type AccountCodeType = "asset" | "liability" | "equity" | "income" | "expense";

export type StandardAccountCode = {
  code: string;
  name: string;
  type: AccountCodeType;
  isActive: boolean;
  parentGroup?: string;
  flow?: AccountCodeFlow;
};

export type StandardAccountSeed = {
  parentGroup: string;
  name: string;
  flow: AccountCodeFlow;
  type: AccountCodeType;
};

/** Barobill-style 1\uCC28/2\uCC28 \uACC4\uC815 \uBAA9\uB85D */
export const STANDARD_ACCOUNT_CATALOG: StandardAccountSeed[] = [
  { parentGroup: "\uB9E4\uCD9C", name: "\uB9E4\uCD9C", flow: "income", type: "income" },

  { parentGroup: "\uC601\uC5C5\uC678\uC218\uC775", name: "\uC774\uC790\uC218\uC775", flow: "income", type: "income" },
  { parentGroup: "\uC601\uC5C5\uC678\uC218\uC775", name: "\uC815\uBD80\uC9C0\uC6D0\uAE08", flow: "income", type: "income" },
  { parentGroup: "\uC601\uC5C5\uC678\uC218\uC775", name: "\uC138\uAE08 \uD658\uAE09", flow: "income", type: "income" },
  { parentGroup: "\uC601\uC5C5\uC678\uC218\uC775", name: "\uC7A1\uC774\uC775", flow: "income", type: "income" },
  { parentGroup: "\uC601\uC5C5\uC678\uC218\uC775", name: "\uC678\uD658\uCC28\uC775", flow: "income", type: "income" },
  { parentGroup: "\uC601\uC5C5\uC678\uC218\uC775", name: "\uC720\uD615\uC790\uC0B0\uCC98\uBD84\uC774\uC775", flow: "income", type: "income" },
  { parentGroup: "\uC601\uC5C5\uC678\uC218\uC775", name: "\uBB34\uD615\uC790\uC0B0\uCC98\uBD84\uC774\uC775", flow: "income", type: "income" },
  { parentGroup: "\uC601\uC5C5\uC678\uC218\uC775", name: "\uAE08\uC735\uC790\uC0B0\uCC98\uBD84\uC774\uC775", flow: "income", type: "income" },

  { parentGroup: "\uB9E4\uCD9C\uC6D0\uAC00", name: "\uB9E4\uCD9C\uC6D0\uAC00", flow: "expense", type: "expense" },

  { parentGroup: "\uD310\uB9E4\uBE44\uC640\uAD00\uB9AC\uBE44", name: "\uAE09\uC5EC", flow: "expense", type: "expense" },
  { parentGroup: "\uD310\uB9E4\uBE44\uC640\uAD00\uB9AC\uBE44", name: "\uC0C1\uC5EC", flow: "expense", type: "expense" },
  { parentGroup: "\uD310\uB9E4\uBE44\uC640\uAD00\uB9AC\uBE44", name: "\uD87C\uC9C1\uAE09\uC5EC", flow: "expense", type: "expense" },
  { parentGroup: "\uD310\uB9E4\uBE44\uC640\uAD00\uB9AC\uBE44", name: "\uC7A1\uAE09", flow: "expense", type: "expense" },
  { parentGroup: "\uD310\uB9E4\uBE44\uC640\uAD00\uB9AC\uBE44", name: "\uBCF5\uB9AC\uD6C4\uC0DD\uBE44", flow: "expense", type: "expense" },
  { parentGroup: "\uD310\uB9E4\uBE44\uC640\uAD00\uB9AC\uBE44", name: "\uBCF4\uD5D8\uB8CC", flow: "expense", type: "expense" },
  { parentGroup: "\uD310\uB9E4\uBE44\uC640\uAD00\uB9AC\uBE44", name: "\uC9C0\uAE09\uC218\uC218\uB8CC", flow: "expense", type: "expense" },
  { parentGroup: "\uD310\uB9E4\uBE44\uC640\uAD00\uB9AC\uBE44", name: "\uAD11\uACE0\uC120\uC804\uBE44", flow: "expense", type: "expense" },
  { parentGroup: "\uD310\uB9E4\uBE44\uC640\uAD00\uB9AC\uBE44", name: "\uAD50\uC721\uD6C8\uB828\uBE44", flow: "expense", type: "expense" },
  { parentGroup: "\uD310\uB9E4\uBE44\uC640\uAD00\uB9AC\uBE44", name: "\uCC28\uB7C9\uC720\uC9C0\uBE44", flow: "expense", type: "expense" },
  { parentGroup: "\uD310\uB9E4\uBE44\uC640\uAD00\uB9AC\uBE44", name: "\uB3C4\uC11C\uC778\uC1C4\uBE44", flow: "expense", type: "expense" },
  { parentGroup: "\uD310\uB9E4\uBE44\uC640\uAD00\uB9AC\uBE44", name: "\uC5C5\uBB34\uCD94\uC9C4\uBE44", flow: "expense", type: "expense" },
  { parentGroup: "\uD310\uB9E4\uBE44\uC640\uAD00\uB9AC\uBE44", name: "\uC784\uCC28\uB8CC", flow: "expense", type: "expense" },
  { parentGroup: "\uD310\uB9E4\uBE44\uC640\uAD00\uB9AC\uBE44", name: "\uD1B5\uC2E0\uBE44", flow: "expense", type: "expense" },
  { parentGroup: "\uD310\uB9E4\uBE44\uC640\uAD00\uB9AC\uBE44", name: "\uC6B4\uBC14\uBE44", flow: "expense", type: "expense" },
  { parentGroup: "\uD310\uB9E4\uBE44\uC640\uAD00\uB9AC\uBE44", name: "\uC138\uAE08\uACFC\uACF5\uACFC", flow: "expense", type: "expense" },
  { parentGroup: "\uD310\uB9E4\uBE44\uC640\uAD00\uB9AC\uBE44", name: "\uC18C\uBAA8\uD488\uBE44", flow: "expense", type: "expense" },
  { parentGroup: "\uD310\uB9E4\uBE44\uC640\uAD00\uB9AC\uBE44", name: "\uC218\uB3C4\uAD11\uC5F4\uBE44", flow: "expense", type: "expense" },
  { parentGroup: "\uD310\uB9E4\uBE44\uC640\uAD00\uB9AC\uBE44", name: "\uC218\uC120\uBE44", flow: "expense", type: "expense" },
  { parentGroup: "\uD310\uB9E4\uBE44\uC640\uAD00\uB9AC\uBE44", name: "\uACBD\uC0C1\uAC1C\uBC1C\uBE44", flow: "expense", type: "expense" },
  { parentGroup: "\uD310\uB9E4\uBE44\uC640\uAD00\uB9AC\uBE44", name: "\uC5EC\uBE44\uAD50\uD86D\uBE44", flow: "expense", type: "expense" },
  { parentGroup: "\uD310\uB9E4\uBE44\uC640\uAD00\uB9AC\uBE44", name: "\uAC80\uBCF8\uD488\uBE44", flow: "expense", type: "expense" },
  { parentGroup: "\uD310\uB9E4\uBE44\uC640\uAD00\uB9AC\uBE44", name: "\uD310\uB9E4\uC218\uC218\uB8CC", flow: "expense", type: "expense" },
  { parentGroup: "\uD310\uB9E4\uBE44\uC640\uAD00\uB9AC\uBE44", name: "\uC678\uC8FC\uC6A9\uC5ED\uBE44", flow: "expense", type: "expense" },
  { parentGroup: "\uD310\uB9E4\uBE44\uC640\uAD00\uB9AC\uBE44", name: "\uC804\uB825\uBE44", flow: "expense", type: "expense" },
  { parentGroup: "\uD310\uB9E4\uBE44\uC640\uAD00\uB9AC\uBE44", name: "\uBCF4\uAD00\uB8CC", flow: "expense", type: "expense" },
  { parentGroup: "\uD310\uB9E4\uBE44\uC640\uAD00\uB9AC\uBE44", name: "\uC218\uCD9C\uC81C\uBE44\uC6A9", flow: "expense", type: "expense" },
  { parentGroup: "\uD310\uB9E4\uBE44\uC640\uAD00\uB9AC\uBE44", name: "\uAE30\uD0C0\uD310\uB9E4\uBE44\uC640\uAD00\uB9AC\uBE44", flow: "expense", type: "expense" },

  { parentGroup: "\uC601\uC5C5\uC678\uBE44\uC6A9", name: "\uAE30\uBD80\uAE08", flow: "expense", type: "expense" },
  { parentGroup: "\uC601\uC5C5\uC678\uBE44\uC6A9", name: "\uC815\uBD80\uC9C0\uC6D0\uAE08 \uC9C0\uCD9C", flow: "expense", type: "expense" },
  { parentGroup: "\uC601\uC5C5\uC678\uBE44\uC6A9", name: "\uC7A1\uC190\uC2E4", flow: "expense", type: "expense" },
  { parentGroup: "\uC601\uC5C5\uC678\uBE44\uC6A9", name: "\uC774\uC790\uBE44\uC6A9", flow: "expense", type: "expense" },
  { parentGroup: "\uC601\uC5C5\uC678\uBE44\uC6A9", name: "\uC678\uD658\uCC28\uC190", flow: "expense", type: "expense" },
  { parentGroup: "\uC601\uC5C5\uC678\uBE44\uC6A9", name: "\uC720\uD615\uC790\uC0B0\uCC98\uBD84\uC190\uC2E4", flow: "expense", type: "expense" },
  { parentGroup: "\uC601\uC5C5\uC678\uBE44\uC6A9", name: "\uBB34\uD615\uC790\uC0B0\uCC98\uBD84\uC190\uC2E4", flow: "expense", type: "expense" },
  { parentGroup: "\uC601\uC5C5\uC678\uBE44\uC6A9", name: "\uAE08\uC735\uC790\uC0B0\uCC98\uBD84\uC190\uC2E4", flow: "expense", type: "expense" },

  { parentGroup: "\uBC95\uC778\uCE74\uB4DC \uB300\uAE08", name: "\uC2E0\uC6A9\uCE74\uB4DC \uB300\uAE08", flow: "expense", type: "expense" },

  { parentGroup: "\uB300\uCD9C", name: "\uCC28\uC785\uAE08", flow: "both", type: "liability" },
  { parentGroup: "\uB300\uCD9C", name: "\uC0AC\uCC44", flow: "both", type: "liability" },
  { parentGroup: "\uB300\uCD9C", name: "\uC8FC\uC8FC/\uC784\uC6D0/\uC9C1\uC6D0 \uCC28\uC785\uAE08", flow: "both", type: "liability" },
  { parentGroup: "\uB300\uCD9C", name: "\uD68C\uC804\uB300\uCD9C/\uD329\uD130\uB9C1", flow: "both", type: "liability" },
  { parentGroup: "\uB300\uCD9C", name: "\uCC28\uC785\uAE08 \uC0C1\uD658", flow: "expense", type: "expense" },
  { parentGroup: "\uB300\uCD9C", name: "\uC0AC\uCC44 \uC0C1\uD658", flow: "expense", type: "expense" },
  { parentGroup: "\uB300\uCD9C", name: "\uC8FC\uC8FC/\uC784\uC6D0/\uC9C1\uC6D0 \uCC28\uC785\uAE08 \uC0C1\uD658", flow: "expense", type: "expense" },
  { parentGroup: "\uB300\uCD9C", name: "\uD68C\uC804\uB300\uCD9C/\uD329\uD130\uB9C1 \uC0C1\uD658", flow: "expense", type: "expense" },

  { parentGroup: "\uD22C\uC790", name: "\uD22C\uC790\uAE08", flow: "both", type: "asset" },
  { parentGroup: "\uD22C\uC790", name: "\uD22C\uC790\uAE08 \uBC18\uD658", flow: "both", type: "asset" },

  { parentGroup: "\uBC30\uB305\uAE08", name: "\uBC30\uB305\uAE08 \uC218\uCDE8", flow: "income", type: "income" },
  { parentGroup: "\uBC30\uB305\uAE08", name: "\uBC30\uB305\uAE08 \uC9C0\uAE09", flow: "expense", type: "expense" },

  { parentGroup: "\uC790\uC0B0 \uCC98\uBD84", name: "\uC720\uD615\uC790\uC0B0 \uCC98\uBD84", flow: "both", type: "asset" },
  { parentGroup: "\uC790\uC0B0 \uCC98\uBD84", name: "\uBB34\uD615\uC790\uC0B0 \uCC98\uBD84", flow: "both", type: "asset" },
  { parentGroup: "\uC790\uC0B0 \uCC98\uBD84", name: "\uAE08\uC735\uC790\uC0B0 \uCC98\uBD84", flow: "both", type: "asset" },

  { parentGroup: "\uB300\uC5EC\uAE08", name: "\uB300\uC5EC\uAE08 \uD68C\uC218", flow: "income", type: "asset" },
  { parentGroup: "\uB300\uC5EC\uAE08", name: "\uB300\uC5EC\uAE08 \uC9C0\uAE09", flow: "expense", type: "asset" },

  { parentGroup: "\uBCF4\uC99D\uAE08", name: "\uBCF4\uC99D\uAE08 \uC218\uCDE8", flow: "income", type: "asset" },
  { parentGroup: "\uBCF4\uC99D\uAE08", name: "\uBCF4\uC99D\uAE08 \uC9C0\uAE09", flow: "expense", type: "asset" },

  { parentGroup: "\uC790\uC0B0 \uCDE8\uB4DD", name: "\uC720\uD615\uC790\uC0B0 \uCDE8\uB4DD", flow: "expense", type: "asset" },
  { parentGroup: "\uC790\uC0B0 \uCDE8\uB4DD", name: "\uBB34\uD615\uC790\uC0B0 \uCDE8\uB4DD", flow: "expense", type: "asset" },
  { parentGroup: "\uC790\uC0B0 \uCDE8\uB4DD", name: "\uAE08\uC735\uC790\uC0B0 \uCDE8\uB4DD", flow: "expense", type: "asset" },

  { parentGroup: "\uB0B4\uBD80 \uC790\uAE08\uC774\uB3D9", name: "\uACC4\uC88C\uAC04 \uC785\uAE08", flow: "both", type: "asset" },
  { parentGroup: "\uB0B4\uBD80 \uC790\uAE08\uC774\uB3D9", name: "\uACC4\uC88C\uAC04 \uCD9C\uAE08", flow: "both", type: "asset" },
];

export const STANDARD_ACCOUNT_PARENT_GROUPS = [
  ...new Set(STANDARD_ACCOUNT_CATALOG.map((row) => row.parentGroup)),
];

const LEGACY_CODE_BY_KEY: Record<string, string> = {
  "\uB9E4\uCD9C|\uB9E4\uCD9C": "401",
  "\uD310\uB9E4\uBE44\uC640\uAD00\uB9AC\uBE44|\uAE09\uC5EC": "501",
  "\uD310\uB9E4\uBE44\uC640\uAD00\uB9AC\uBE44|\uC5EC\uBE44\uAD50\uD86D\uBE44": "504",
  "\uD310\uB9E4\uBE44\uC640\uAD00\uB9AC\uBE44|\uC811\uB300\uBE44": "505",
  "\uD310\uB9E4\uBE44\uC640\uAD00\uB9AC\uBE44|\uD1B5\uC2E0\uBE44": "506",
  "\uD310\uB9E4\uBE44\uC640\uAD00\uB9AC\uBE44|\uC784\uCC28\uB8CC": "510",
  "\uD310\uB9E4\uBE44\uC640\uAD00\uB9AC\uBE44|\uBCF4\uD5D8\uB8CC": "512",
  "\uD310\uB9E4\uBE44\uC640\uAD00\uB9AC\uBE44|\uC18C\uBAA8\uD488\uBE44": "517",
  "\uD310\uB9E4\uBE44\uC640\uAD00\uB9AC\uBE44|\uC9C0\uAE09\uC218\uC218\uB8CC": "518",
  "\uD310\uB9E4\uBE44\uC640\uAD00\uB9AC\uBE44|\uAD11\uACE0\uC120\uC804\uBE44": "519",
  "\uD310\uB9E4\uBE44\uC640\uAD00\uB9AC\uBE44|\uC678\uC8FC\uC6A9\uC5ED\uBE44": "520",
};

function catalogKey(parentGroup: string, name: string) {
  return `${parentGroup}|${name}`;
}

function nextNumericCode(used: Set<string>, start = 1000) {
  let n = start;
  while (used.has(String(n))) n += 1;
  return String(n);
}

/** \uAE30\uC874 \uACC4\uC815\uC744 \uC720\uC9C0\uD558\uACE0 \uD45C\uC900 \uBAA9\uB85D \uC911 \uC5C6\uB294 \uD56D\uBAA9\uB9CC \uCD94\uAC00 */
export function mergeStandardAccountCodes(existing: StandardAccountCode[]): StandardAccountCode[] {
  const usedCodes = new Set(existing.map((row) => row.code));
  const byKey = new Map<string, StandardAccountCode>();
  for (const row of existing) {
    if (row.parentGroup && row.name) {
      byKey.set(catalogKey(row.parentGroup, row.name), row);
    }
    byKey.set(catalogKey("", row.name), row);
  }

  const result = [...existing];

  for (const seed of STANDARD_ACCOUNT_CATALOG) {
    const key = catalogKey(seed.parentGroup, seed.name);
    if (byKey.has(key)) continue;

    const legacyCode = LEGACY_CODE_BY_KEY[key];
    if (legacyCode && !usedCodes.has(legacyCode)) {
      const row: StandardAccountCode = {
        code: legacyCode,
        name: seed.name,
        type: seed.type,
        isActive: true,
        parentGroup: seed.parentGroup,
        flow: seed.flow,
      };
      result.push(row);
      byKey.set(key, row);
      usedCodes.add(legacyCode);
      continue;
    }

    const code = nextNumericCode(usedCodes);
    const row: StandardAccountCode = {
      code,
      name: seed.name,
      type: seed.type,
      isActive: true,
      parentGroup: seed.parentGroup,
      flow: seed.flow,
    };
    result.push(row);
    byKey.set(key, row);
    usedCodes.add(code);
  }

  return result.sort(
    (a, b) =>
      String(a.parentGroup || "").localeCompare(String(b.parentGroup || ""), "ko") ||
      a.name.localeCompare(b.name, "ko"),
  );
}

export function buildStandardAccountCodes(): StandardAccountCode[] {
  return mergeStandardAccountCodes([
    { code: "101", name: "\uBCF4\uD1B5\uC608\uAE08", type: "asset", isActive: true, parentGroup: "\uC790\uC0B0", flow: "both" },
    { code: "108", name: "\uBBF8\uC218\uAE08", type: "asset", isActive: true, parentGroup: "\uC790\uC0B0", flow: "both" },
    { code: "201", name: "\uC678\uC0C1\uB9E4\uC785\uAE08", type: "liability", isActive: true, parentGroup: "\uBD80\uCC44", flow: "both" },
  ]);
}
