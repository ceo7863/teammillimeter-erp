const STALE_CHUNK_RELOAD_KEY = "erp-stale-chunk-reload";

export function isStaleDynamicImportError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(
    message,
  );
}

/** ?? ?? ?? ?? URL? ??? ? ? ? ?? ???????. */
export function reloadOnceForStaleChunks() {
  if (typeof window === "undefined") return false;
  if (sessionStorage.getItem(STALE_CHUNK_RELOAD_KEY)) return false;
  sessionStorage.setItem(STALE_CHUNK_RELOAD_KEY, "1");
  window.location.reload();
  return true;
}

export function clearStaleChunkReloadFlag() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(STALE_CHUNK_RELOAD_KEY);
}

export async function importWithStaleChunkReload<T>(loader: () => Promise<T>): Promise<T> {
  try {
    return await loader();
  } catch (error) {
    if (isStaleDynamicImportError(error) && reloadOnceForStaleChunks()) {
      return new Promise(() => {});
    }
    throw error;
  }
}
