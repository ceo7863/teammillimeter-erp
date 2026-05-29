import { revokePdfBlobUrl, type StatementPdfOptions } from "./statementPdf";

export type StatementPdfBlobResult = {
  blobUrl: string;
  fileName: string;
  blob: Blob;
  pageCount: number;
  previewOpened?: boolean;
};

type CacheEntry = {
  key: string;
  result: StatementPdfBlobResult;
};

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<StatementPdfBlobResult>>();

export function buildStatementPdfCacheKey(segments: Array<string | number | undefined | null>) {
  return segments.map((part) => String(part ?? "")).join("|");
}

export function peekStatementPdfCache(key: string): StatementPdfBlobResult | null {
  return cache.get(key)?.result ?? null;
}

export function putStatementPdfCache(key: string, result: StatementPdfBlobResult) {
  const prev = cache.get(key);
  if (prev && prev.result.blobUrl !== result.blobUrl) {
    revokePdfBlobUrl(prev.result.blobUrl);
  }
  cache.set(key, { key, result });
}

export function clearStatementPdfCache(prefix?: string) {
  for (const [key, entry] of cache) {
    if (prefix && !key.startsWith(prefix)) continue;
    revokePdfBlobUrl(entry.result.blobUrl);
    cache.delete(key);
  }
}

export async function resolveStatementPdf(
  key: string,
  generate: () => Promise<StatementPdfBlobResult>
): Promise<{ result: StatementPdfBlobResult; fromCache: boolean }> {
  const cached = peekStatementPdfCache(key);
  if (cached) {
    return { result: cached, fromCache: true };
  }

  let pending = inflight.get(key);
  if (!pending) {
    pending = generate()
      .then((result) => {
        putStatementPdfCache(key, result);
        inflight.delete(key);
        return result;
      })
      .catch((error) => {
        inflight.delete(key);
        throw error;
      });
    inflight.set(key, pending);
    const result = await pending;
    return { result, fromCache: false };
  }

  const result = await pending;
  return { result, fromCache: true };
}

export function prefetchStatementPdf(key: string, generate: () => Promise<StatementPdfBlobResult>) {
  if (peekStatementPdfCache(key) || inflight.has(key)) return;
  void resolveStatementPdf(key, generate);
}

export type ResolveStatementPdfFromElementOptions = StatementPdfOptions & {
  cacheKey: string;
};

export async function resolveStatementPdfFromElement(
  element: HTMLElement,
  fileName: string,
  download: (element: HTMLElement, fileName: string, options: StatementPdfOptions) => Promise<StatementPdfBlobResult>,
  options: ResolveStatementPdfFromElementOptions
) {
  const { cacheKey, ...pdfOptions } = options;
  return resolveStatementPdf(cacheKey, () => download(element, fileName, pdfOptions));
}
