export type ClientTaxFields = {
  name?: string;
  taxInvoiceCorpName?: string;
  businessNo?: string;
  ceoName?: string;
  email?: string;
  address?: string;
  phone?: string;
  bizType?: string;
  bizClass?: string;
  manager?: string;
};

export type ClientMasterLike = {
  id?: number | string;
  name?: string;
  taxInvoiceCorpName?: string;
  businessNo?: string;
  ceoName?: string;
  email?: string;
  address?: string;
  bizType?: string;
  bizClass?: string;
  manager?: string;
  phone?: string;
  constructionCost?: number;
  customChargeCost?: number;
  chargeCost?: number;
  overtimeCost?: number;
  vat?: string;
  mealIncluded?: string;
  depositNameAliases?: string;
  taxInvoiceSplitPayments?: boolean;
  businessRegFileId?: string;
  businessRegFileName?: string;
  businessRegUploadedAt?: string;
  memo?: string;
};

export function resolveClientTaxInvoiceCorpName(client: Record<string, unknown> | null | undefined) {
  const source = client && typeof client === "object" ? client : {};
  const taxName = String(source.taxInvoiceCorpName || "").trim();
  const name = String(source.name || "").trim();
  return taxName || name;
}

export function extractClientTaxFields(client: Record<string, unknown> | null | undefined): ClientTaxFields {
  const source = client && typeof client === "object" ? client : {};
  return {
    name: String(source.name || "").trim(),
    taxInvoiceCorpName: String(source.taxInvoiceCorpName || "").trim(),
    businessNo: String(source.businessNo || "").trim(),
    ceoName: String(source.ceoName || "").trim(),
    email: String(source.email || "").trim(),
    address: String(source.address || "").trim(),
    phone: String(source.phone || "").trim(),
    bizType: String(source.bizType || "").trim(),
    bizClass: String(source.bizClass || "").trim(),
    manager: String(source.manager || "").trim(),
  };
}

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

export function validateInvoiceePartyForIssue(party: ClientTaxFields) {
  if (!String(party.ceoName || "").trim()) {
    return "\uAC70\uB798\uCC98 \uB300\uD45C\uC790\uBA85\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694.";
  }
  if (!String(party.address || "").trim()) {
    return "\uAC70\uB798\uCC98 \uC8FC\uC18C\uB97C \uC785\uB825\uD574 \uC8FC\uC138\uC694.";
  }
  if (!isValidEmail(String(party.email || ""))) {
    return "\uAC70\uB798\uCC98 \uC774\uBA54\uC77C\uC744 \uC62C\uBC14\uB974\uAC8C \uC785\uB825\uD574 \uC8FC\uC138\uC694.";
  }
  if (!String(party.bizType || "").trim()) {
    return "\uAC70\uB798\uCC98 \uC5C5\uD0DC\uB97C \uC785\uB825\uD574 \uC8FC\uC138\uC694.";
  }
  if (!String(party.bizClass || "").trim()) {
    return "\uAC70\uB798\uCC98 \uC5C5\uC885\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694.";
  }
  return null;
}

export function normalizeClientRecordId(id?: number | string | null) {
  if (id == null || id === "") return "";
  return String(id);
}

export function clientIdsEqual(
  left?: number | string | null,
  right?: number | string | null,
) {
  const leftKey = normalizeClientRecordId(left);
  const rightKey = normalizeClientRecordId(right);
  return Boolean(leftKey) && leftKey === rightKey;
}

function normalizeClientName(name?: string) {
  return String(name || "").trim();
}

/** 서버 새로고침 시 방금 저장한 거래처 필드가 지워지지 않도록 병합 */
export function mergeClientFieldsFromLocal(
  incoming: ClientMasterLike[] = [],
  local: ClientMasterLike[] = [],
) {
  const localById = new Map(
    local
      .filter((client) => normalizeClientRecordId(client.id))
      .map((client) => [normalizeClientRecordId(client.id), client]),
  );
  const localByName = new Map(local.map((client) => [normalizeClientName(client.name), client]));
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();

  const merged = incoming.map((client) => {
    const idKey = normalizeClientRecordId(client.id);
    if (idKey) seenIds.add(idKey);
    const nameKey = normalizeClientName(client.name);
    if (nameKey) seenNames.add(nameKey);
    const prev = (idKey && localById.get(idKey)) || (nameKey && localByName.get(nameKey));
    if (!prev) return client;
    return { ...prev, ...client };
  });

  for (const client of local) {
    const idKey = normalizeClientRecordId(client.id);
    const nameKey = normalizeClientName(client.name);
    const idSeen = Boolean(idKey && seenIds.has(idKey));
    const nameSeen = Boolean(nameKey && seenNames.has(nameKey));
    if (!idSeen && !nameSeen) {
      merged.push(client);
      if (idKey) seenIds.add(idKey);
      if (nameKey) seenNames.add(nameKey);
    }
  }

  return merged;
}
