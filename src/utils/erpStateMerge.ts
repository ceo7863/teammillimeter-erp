type SaleMergeRow = {
  id?: string | number;
  updatedAt?: string;
};

export type MergeSalesOptions = {
  /** Locally deleted sale ids that must not be restored from server snapshots. */
  suppressedServerIds?: ReadonlySet<string>;
};

/** Keep the row with the latest updatedAt when server and local copies diverge. */
export function mergeSalesByUpdatedAt<T extends SaleMergeRow>(
  serverSales: T[] = [],
  localSales: T[] = [],
  options?: MergeSalesOptions,
): T[] {
  const serverById = new Map(serverSales.map((row) => [String(row.id), row]));
  const localById = new Map(localSales.map((row) => [String(row.id), row]));
  const suppressed = options?.suppressedServerIds;
  const ids = new Set([...serverById.keys(), ...localById.keys()]);

  const merged: T[] = [];
  for (const id of ids) {
    const server = serverById.get(id);
    const local = localById.get(id);
    if (!local) {
      if (suppressed?.has(id)) continue;
      if (server) merged.push(server);
      continue;
    }
    if (!server) {
      merged.push(local);
      continue;
    }
    const serverMs = Date.parse(String(server.updatedAt || "")) || 0;
    const localMs = Date.parse(String(local.updatedAt || "")) || 0;
    merged.push(localMs >= serverMs ? local : server);
  }
  return merged;
}
