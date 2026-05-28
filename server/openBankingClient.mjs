import { config } from "./config.mjs";
import { getOpenBankingSecrets, loadOpenBankingStore, saveOpenBankingStore } from "./openBankingStore.mjs";

function pad2(value) {
  return String(value).padStart(2, "0");
}

export function formatTranDtime(date = new Date()) {
  return [
    date.getFullYear(),
    pad2(date.getMonth() + 1),
    pad2(date.getDate()),
    pad2(date.getHours()),
    pad2(date.getMinutes()),
    pad2(date.getSeconds()),
  ].join("");
}

export function formatYmd(date = new Date()) {
  return [date.getFullYear(), pad2(date.getMonth() + 1), pad2(date.getDate())].join("");
}

export function makeBankTranId() {
  const org = String(config.openBanking.orgCode || "000000000")
    .replace(/\D/g, "")
    .padStart(9, "0")
    .slice(0, 9);
  const unique = `${Date.now()}${Math.random().toString(36).slice(2, 8)}`
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .padStart(9, "0")
    .slice(0, 9);
  return `F${org}U${unique}`.slice(0, 20);
}

function openBankingBase() {
  return String(config.openBanking.baseUrl || "https://testapi.openbanking.or.kr").replace(/\/$/, "");
}

async function parseJsonResponse(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(text || `\uC624\uD508\uB1F9\uD0B9 API \uC751\uB2F5 \uC624\uB958 (${response.status})`);
  }
}

function assertOpenBankingOk(body, context) {
  if (body.rsp_code && body.rsp_code !== "A0000") {
    throw new Error(body.rsp_message || `${context} ?? (${body.rsp_code})`);
  }
  if (body.error) {
    throw new Error(String(body.error_description || body.error));
  }
}

export function buildAuthorizeUrl(state = "") {
  const { clientId, redirectUri, scope } = config.openBanking;
  if (!clientId || !redirectUri) {
    throw new Error("OPEN_BANKING_CLIENT_ID / OPEN_BANKING_REDIRECT_URI \uAC00 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.");
  }
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scope || "login inquiry",
    auth_type: "0",
    state: state || `erp-${Date.now()}`,
  });
  return `${openBankingBase()}/oauth/2.0/authorize?${params.toString()}`;
}

export async function exchangeAuthorizationCode(code) {
  const { clientId, clientSecret, redirectUri } = config.openBanking;
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    code: String(code || ""),
    redirect_uri: redirectUri,
  });
  const response = await fetch(`${openBankingBase()}/oauth/2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await parseJsonResponse(response);
  assertOpenBankingOk(json, "\uD1A0\uD070 \uBC1C\uAE09");
  return persistTokenResponse(json);
}

export async function refreshAccessToken() {
  const secrets = getOpenBankingSecrets();
  if (!secrets.refreshToken) {
    throw new Error("refresh_token \uC774 \uC5C6\uC2B5\uB2C8\uB2E4. \uC624\uD508\uB1F9\uD0B9 \uC778\uC99D \uD6C4 \uB2E4\uC2DC \uC800\uC7A5\uD574 \uC8FC\uC138\uC694.");
  }
  const { clientId, clientSecret } = config.openBanking;
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: secrets.refreshToken,
  });
  const response = await fetch(`${openBankingBase()}/oauth/2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await parseJsonResponse(response);
  assertOpenBankingOk(json, "\uD1A0\uD070 \uBC1C\uAE09");
  return persistTokenResponse(json);
}

function persistTokenResponse(json) {
  const expiresIn = Number(json.expires_in || 0);
  const accessTokenExpiresAt =
    expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;
  const previous = loadOpenBankingStore();
  return saveOpenBankingStore({
    accessToken: json.access_token || "",
    refreshToken: json.refresh_token || previous.refreshToken,
    accessTokenExpiresAt,
    lastError: null,
    connectedAt: previous.connectedAt || new Date().toISOString(),
  });
}

async function resolveAccessToken() {
  const secrets = getOpenBankingSecrets();
  if (!secrets.accessToken) {
    throw new Error("access_token \uC774 \uC5C6\uC2B5\uB2C8\uB2E4.");
  }
  const expiresAt = secrets.accessTokenExpiresAt ? Date.parse(secrets.accessTokenExpiresAt) : 0;
  if (expiresAt && expiresAt - Date.now() < 60_000) {
    const refreshed = await refreshAccessToken();
    return refreshed.accessToken;
  }
  return secrets.accessToken;
}

export async function fetchTransactionPage(options) {
  const accessToken = await resolveAccessToken();
  const secrets = getOpenBankingSecrets();
  const fintechUseNum = options.fintechUseNum || secrets.fintechUseNum;
  if (!fintechUseNum) {
    throw new Error("\uD540\uD14C\uD06C\uC774\uC6A9\uBC88\uD638(fintech_use_num)\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.");
  }

  const params = new URLSearchParams({
    bank_tran_id: options.bankTranId || makeBankTranId(),
    fintech_use_num: fintechUseNum,
    inquiry_type: options.inquiryType || "A",
    inquiry_base: "D",
    from_date: options.fromDate,
    to_date: options.toDate,
    sort_order: "D",
    tran_dtime: options.tranDtime || formatTranDtime(),
  });
  if (options.beforeInquiryTraceInfo) {
    params.set("befor_inquiry_trace_info", options.beforeInquiryTraceInfo);
  }

  const response = await fetch(
    `${openBankingBase()}/v2.0/account/transaction_list/fin_num?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  const json = await parseJsonResponse(response);
  if (response.status === 401 || json.rsp_code === "O0001") {
    await refreshAccessToken();
    return fetchTransactionPage(options);
  }
  assertOpenBankingOk(json, "\uAC70\uB798\uB0B4\uC5ED \uC870\uD68C");
  return json;
}

export async function fetchAllTransactions({ fromDate, toDate, fintechUseNum }) {
  let beforeInquiryTraceInfo = "";
  let hasNext = true;
  const rows = [];
  let lastMeta = null;

  while (hasNext) {
    const page = await fetchTransactionPage({
      fromDate,
      toDate,
      fintechUseNum,
      beforeInquiryTraceInfo,
    });
    lastMeta = page;
    const list = Array.isArray(page.res_list) ? page.res_list : [];
    rows.push(...list);
    hasNext = page.next_page_yn === "Y";
    beforeInquiryTraceInfo = page.befor_inquiry_trace_info || "";
    if (hasNext && !beforeInquiryTraceInfo) break;
  }

  return { rows, meta: lastMeta };
}

export function mapOpenBankingRowsToImportPreview(rows, meta = {}) {
  const accountNumber = meta.accountMask || config.openBanking.accountMask || "open-banking";
  const parsedRows = rows
    .map((row) => {
      const tranDate = String(row.tran_date || "");
      const tranTime = String(row.tran_time || "000000").padStart(6, "0");
      const transactionAt = tranDate
        ? `${tranDate.slice(0, 4)}-${tranDate.slice(4, 6)}-${tranDate.slice(6, 8)}T${tranTime.slice(0, 2)}:${tranTime.slice(2, 4)}:${tranTime.slice(4, 6)}`
        : "";
      const amount = Number(String(row.tran_amt || "0").replace(/[^\d.-]/g, "")) || 0;
      const isDeposit = String(row.inout_type || "").includes("\uC785");
      const description =
        String(row.print_content || row.printed_content || row.branch_name || "").trim() ||
        String(row.tran_type || "").trim();
      return {
        transactionAt,
        withdrawal: isDeposit ? 0 : amount,
        deposit: isDeposit ? amount : 0,
        balanceAfter: Number(String(row.after_balance_amt || "0").replace(/[^\d.-]/g, "")) || 0,
        description,
        counterpartyName: description,
        transactionType: String(row.tran_type || "").trim() || undefined,
        memo: String(row.branch_name || "").trim() || undefined,
      };
    })
    .filter((row) => row.transactionAt && (row.deposit > 0 || row.withdrawal > 0 || row.description));

  const latestTransactionAt = parsedRows[0]?.transactionAt;
  const earliestTransactionAt = parsedRows[parsedRows.length - 1]?.transactionAt;

  return {
    accountNumber,
    accountHolder: meta.bankName || "IBK",
    sourceFile: "open-banking-api",
    rows: parsedRows,
    parsedTotals: parsedRows.reduce(
      (acc, row) => {
        acc.count += 1;
        acc.deposits += row.deposit;
        acc.withdrawals += row.withdrawal;
        return acc;
      },
      { count: 0, deposits: 0, withdrawals: 0 },
    ),
    errors: [],
    earliestTransactionAt,
    latestTransactionAt,
  };
}
