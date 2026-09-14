/**
 * Allocation target planner for registerCanonicalReceipt.
 * Spill protection: never allocate beyond the mode allowlist even if money remains.
 */

function money(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function saleIdKey(id) {
  return String(id ?? "").trim();
}

function ymd(value) {
  return String(value || "").trim().slice(0, 10);
}

function makeError(code, message, status = 400, extra = {}) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  Object.assign(err, extra);
  return err;
}

function dedupeSaleIds(ids = []) {
  const out = [];
  const seen = new Set();
  for (const raw of ids || []) {
    const id = saleIdKey(raw);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function filterSalesByPeriod(sales, client, clients, periodStart, periodEnd) {
  const start = ymd(periodStart);
  const end = ymd(periodEnd);
  return (sales || []).filter((sale) => {
    const date = ymd(sale?.date);
    if (start && date && date < start) return false;
    if (end && date && date > end) return false;
    if (!client) return true;
    const clientId = String(client.id ?? client);
    if (sale?.clientId != null && String(sale.clientId).trim() !== "") {
      return String(sale.clientId) === clientId;
    }
    const name = String(sale?.client || "").trim();
    if (!name) return false;
    const matches = (clients || []).filter((row) => String(row.name || "").trim() === name);
    if (matches.length !== 1) return false;
    return String(matches[0].id) === clientId;
  });
}

function normalizeExplicitAllocations(allocations, allowlist = null) {
  const allow = allowlist instanceof Set ? allowlist : allowlist ? new Set([...allowlist].map(saleIdKey)) : null;
  const rows = [];
  for (const row of allocations || []) {
    const saleId = saleIdKey(row?.saleId ?? row?.salesId);
    const amount = money(row?.amount);
    if (!saleId || amount <= 0) continue;
    if (allow && allow.size > 0 && !allow.has(saleId)) continue;
    rows.push({ saleId, amount });
  }
  return rows;
}

function emptyResult(grossAmount, scopeMeta = {}, warnings = []) {
  return {
    allocations: [],
    unallocatedAmount: money(grossAmount),
    scopeMeta,
    warnings,
  };
}

/**
 * Plan allocations for a receipt target mode.
 * Returns { allocations, unallocatedAmount, scopeMeta, warnings[] }.
 */
export function planAllocationsForTarget({
  mode,
  sales = [],
  client = null,
  clients = [],
  grossAmount,
  existingAllocations = [],
  receipts = [],
  asOfDate = null,
  statementSaleIds = [],
  periodStart = null,
  periodEnd = null,
  saleIds = [],
  allocations = null,
  autoAllocate = true,
  companyOnly = false,
  proposeFifoAllocations,
  proposeFifoAllocationsScoped,
} = {}) {
  const warnings = [];
  const amount = money(grossAmount);
  const resolvedMode = String(mode || "").trim().toUpperCase();

  if (resolvedMode === "OPENING_ADJUSTMENT") {
    throw makeError(
      "OPENING_ADJUSTMENT_FORBIDDEN",
      "OPENING_ADJUSTMENT는 입금전표 배정 모드로 사용할 수 없습니다.",
    );
  }

  // company-only deposits never auto-allocate to customer sales
  if (companyOnly === true) {
    return emptyResult(amount, { mode: "UNAPPLIED", companyOnly: true }, warnings);
  }

  // Default/missing mode, explicit UNAPPLIED, or autoAllocate=false without a mode → no allocations
  if (!resolvedMode || resolvedMode === "UNAPPLIED" || (autoAllocate === false && !String(mode || "").trim())) {
    return emptyResult(amount, { mode: "UNAPPLIED" }, warnings);
  }

  if (typeof proposeFifoAllocations !== "function") {
    throw makeError("FIFO_FN_REQUIRED", "proposeFifoAllocations가 필요합니다.", 500);
  }

  if (resolvedMode === "GLOBAL_FIFO") {
    warnings.push("과거 입금이 누락된 경우 오래된 매출에 잘못 충당될 수 있습니다.");
    const fifo = proposeFifoAllocations(
      sales,
      client,
      amount,
      existingAllocations,
      receipts,
      clients,
      asOfDate,
    );
    return {
      allocations: fifo.allocations || [],
      unallocatedAmount: money(fifo.unallocatedAmount ?? 0),
      scopeMeta: { mode: "GLOBAL_FIFO" },
      warnings,
    };
  }

  if (resolvedMode === "SELECTED_SALES") {
    const allowlist = dedupeSaleIds(saleIds);
    const allowSet = new Set(allowlist);
    const explicit = Array.isArray(allocations) ? normalizeExplicitAllocations(allocations, allowSet) : [];
    if (explicit.length) {
      const allocatedSum = explicit.reduce((sum, row) => sum + row.amount, 0);
      // Spill protection: clamp sum to gross; never add sales outside allowlist.
      let remaining = amount;
      const capped = [];
      for (const row of explicit) {
        if (remaining <= 0) break;
        const apply = Math.min(row.amount, remaining);
        if (apply > 0) {
          capped.push({ saleId: row.saleId, amount: apply });
          remaining -= apply;
        }
      }
      return {
        allocations: capped,
        unallocatedAmount: Math.max(remaining, 0),
        scopeMeta: {
          mode: "SELECTED_SALES",
          saleIds: allowlist,
          source: "explicit",
          requestedAllocated: allocatedSum,
        },
        warnings,
      };
    }

    // FIFO within saleIds allowlist only — no spill outside.
    const scoped =
      typeof proposeFifoAllocationsScoped === "function"
        ? proposeFifoAllocationsScoped(proposeFifoAllocations, {
            sales,
            client,
            grossAmount: amount,
            allocations: existingAllocations,
            receipts,
            clients,
            asOfDate,
            saleIdAllowlist: allowSet,
            requireAllowlist: true,
          })
        : proposeFifoAllocations(
            (sales || []).filter((sale) => allowSet.has(saleIdKey(sale?.id))),
            client,
            amount,
            existingAllocations,
            receipts,
            clients,
            asOfDate,
          );
    return {
      allocations: scoped.allocations || [],
      unallocatedAmount: money(scoped.unallocatedAmount ?? 0),
      scopeMeta: { mode: "SELECTED_SALES", saleIds: allowlist, source: "fifo" },
      warnings,
    };
  }

  if (resolvedMode === "PERIOD") {
    const start = ymd(periodStart);
    const end = ymd(periodEnd);
    if (!start || !end) {
      throw makeError("PERIOD_REQUIRED", "기간 배정에는 periodStart와 periodEnd가 필요합니다.");
    }
    const periodSales = filterSalesByPeriod(sales, client, clients, start, end);
    const allowSet = new Set(periodSales.map((sale) => saleIdKey(sale.id)).filter(Boolean));
    const scoped =
      typeof proposeFifoAllocationsScoped === "function"
        ? proposeFifoAllocationsScoped(proposeFifoAllocations, {
            sales: periodSales,
            client,
            grossAmount: amount,
            allocations: existingAllocations,
            receipts,
            clients,
            asOfDate,
            saleIdAllowlist: allowSet,
            requireAllowlist: true,
          })
        : proposeFifoAllocations(
            periodSales,
            client,
            amount,
            existingAllocations,
            receipts,
            clients,
            asOfDate,
          );
    return {
      allocations: scoped.allocations || [],
      unallocatedAmount: money(scoped.unallocatedAmount ?? 0),
      scopeMeta: {
        mode: "PERIOD",
        periodStart: start,
        periodEnd: end,
        saleIds: [...allowSet],
        saleCount: periodSales.length,
      },
      warnings,
    };
  }

  if (resolvedMode === "STATEMENT") {
    const allowlist = dedupeSaleIds(statementSaleIds);
    const allowSet = new Set(allowlist);
    const scoped =
      typeof proposeFifoAllocationsScoped === "function"
        ? proposeFifoAllocationsScoped(proposeFifoAllocations, {
            sales,
            client,
            grossAmount: amount,
            allocations: existingAllocations,
            receipts,
            clients,
            asOfDate,
            saleIdAllowlist: allowSet,
            requireAllowlist: true,
          })
        : proposeFifoAllocations(
            allowSet.size
              ? (sales || []).filter((sale) => allowSet.has(saleIdKey(sale?.id)))
              : [],
            client,
            amount,
            existingAllocations,
            receipts,
            clients,
            asOfDate,
          );
    return {
      allocations: scoped.allocations || [],
      unallocatedAmount: money(scoped.unallocatedAmount ?? 0),
      scopeMeta: {
        mode: "STATEMENT",
        saleIds: allowlist,
        requireAllowlist: true,
      },
      warnings,
    };
  }

  // Unknown mode → treat as UNAPPLIED (safe default)
  warnings.push(`알 수 없는 배정 모드(${resolvedMode}) — 미충당으로 처리합니다.`);
  return emptyResult(amount, { mode: resolvedMode || "UNAPPLIED" }, warnings);
}

export { money as allocationTargetMoney };
