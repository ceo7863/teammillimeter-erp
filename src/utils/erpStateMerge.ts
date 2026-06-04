type SaleMergeRow = {
  id?: string | number;
  updatedAt?: string;
};

/** Keep the row with the latest updatedAt when server and local copies diverge. */
export function mergeSalesByUpdatedAt<T extends SaleMergeRow>(serverSales: T[] = [], localSales: T[] = []): T[] {
  const serverById = new Map(serverSales.map((row) => [String(row.id), row]));
  const localById = new Map(localSales.map((row) => [String(row.id), row]));
  const ids = new Set([...serverById.keys(), ...localById.keys()]);

  return [...ids].map((id) => {
    const server = serverById.get(id);
    const local = localById.get(id);
    if (!local) return server as T;
    if (!server) return local;
    const serverMs = Date.parse(String(server.updatedAt || "")) || 0;
    const localMs = Date.parse(String(local.updatedAt || "")) || 0;
    return localMs >= serverMs ? local : server;
  });
}
