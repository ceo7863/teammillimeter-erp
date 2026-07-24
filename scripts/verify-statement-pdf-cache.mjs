/**
 * Regression: statement PDF share refresh must not reuse stale client cache
 * when bypassCache=true, even if row count / page count stay the same.
 *
 * Also asserts public pdf-share routes set no-store headers in server/index.mjs.
 *
 * Usage: node scripts/verify-statement-pdf-cache.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let failed = 0;

function assert(cond, message) {
  if (!cond) {
    failed += 1;
    console.error(`FAIL: ${message}`);
    return;
  }
  console.log(`PASS: ${message}`);
}

function revoke(_url) {}

function createCacheHarness() {
  const cache = new Map();
  const inflight = new Map();

  function peek(key) {
    return cache.get(key)?.result ?? null;
  }

  function put(key, result) {
    const prev = cache.get(key);
    if (prev && prev.result.blobUrl !== result.blobUrl) {
      revoke(prev.result.blobUrl);
    }
    cache.set(key, { key, result });
  }

  function clear(prefix) {
    for (const [key, entry] of cache) {
      if (prefix && !key.startsWith(prefix)) continue;
      revoke(entry.result.blobUrl);
      cache.delete(key);
    }
  }

  async function resolve(key, generate) {
    const cached = peek(key);
    if (cached) return { result: cached, fromCache: true };

    let pending = inflight.get(key);
    if (!pending) {
      pending = generate()
        .then((result) => {
          put(key, result);
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

  /** Mirrors the fixed resolveStatementPdfForElement bypassCache path. */
  async function resolveForElement(cacheKey, expectedPageCount, generate, options = {}) {
    if (options.bypassCache) {
      const pending = inflight.get(cacheKey);
      if (pending) {
        try {
          await pending;
        } catch {
          // forced generation below is authoritative
        }
      }
      clear(cacheKey);
      const fresh = await generate();
      put(cacheKey, fresh);
      if (fresh.pageCount === expectedPageCount) {
        return { result: fresh, fromCache: false };
      }
      clear(cacheKey);
      const retried = await generate();
      put(cacheKey, retried);
      return { result: retried, fromCache: false };
    }

    const cached = peek(cacheKey);
    if (cached && cached.pageCount === expectedPageCount) {
      return { result: cached, fromCache: true };
    }

    const { result } = await resolve(cacheKey, generate);
    if (result.pageCount === expectedPageCount) {
      return { result, fromCache: false };
    }
    clear(cacheKey);
    const retried = await resolve(cacheKey, generate);
    return { result: retried.result, fromCache: false };
  }

  /** Old buggy behavior: bypassCache still fell through to resolve() and reused cache. */
  async function resolveForElementBuggy(cacheKey, expectedPageCount, generate, options = {}) {
    if (!options.bypassCache) {
      const cached = peek(cacheKey);
      if (cached && cached.pageCount === expectedPageCount) {
        return { result: cached, fromCache: true };
      }
    }
    const { result, fromCache } = await resolve(cacheKey, generate);
    return { result, fromCache };
  }

  return { put, peek, resolveForElement, resolveForElementBuggy, inflight };
}

async function delay(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function runBehaviorChecks() {
  const cacheKey = "client|Acme|2026-07-01|2026-07-31|detail|3|1";
  const pageCount = 1;

  // --- Bug reproduction on old path ---
  {
    const h = createCacheHarness();
    h.put(cacheKey, { blobUrl: "blob:old", fileName: "a.pdf", blob: { id: "old" }, pageCount });
    const { result, fromCache } = await h.resolveForElementBuggy(
      cacheKey,
      pageCount,
      async () => ({ blobUrl: "blob:new", fileName: "a.pdf", blob: { id: "new-amount" }, pageCount }),
      { bypassCache: true },
    );
    assert(fromCache === true && result.blob.id === "old", "legacy path reused stale PDF when amount changed (bug baseline)");
  }

  // --- Fixed path: same rows/pages, amount/memo changed ---
  {
    const h = createCacheHarness();
    h.put(cacheKey, { blobUrl: "blob:old", fileName: "a.pdf", blob: { id: "old-amount" }, pageCount });
    const { result, fromCache } = await h.resolveForElement(
      cacheKey,
      pageCount,
      async () => ({ blobUrl: "blob:fresh", fileName: "a.pdf", blob: { id: "new-amount" }, pageCount }),
      { bypassCache: true },
    );
    assert(fromCache === false, "fixed path reports fromCache=false on forced regenerate");
    assert(result.blob.id === "new-amount", "fixed path returns freshly generated PDF content");
    assert(h.peek(cacheKey)?.blob.id === "new-amount", "fixed path stores fresh PDF in cache");
  }

  // --- Prefetch must not overwrite forced regenerate ---
  {
    const h = createCacheHarness();
    let generateCount = 0;
    const slowPrefetch = (async () => {
      await delay(40);
      generateCount += 1;
      return { blobUrl: "blob:prefetch", fileName: "a.pdf", blob: { id: "prefetch-stale" }, pageCount };
    })();
    h.inflight.set(cacheKey, slowPrefetch);

    const started = Date.now();
    const { result, fromCache } = await h.resolveForElement(
      cacheKey,
      pageCount,
      async () => {
        generateCount += 1;
        return { blobUrl: "blob:forced", fileName: "a.pdf", blob: { id: "forced-fresh" }, pageCount };
      },
      { bypassCache: true },
    );
    const elapsed = Date.now() - started;

    assert(elapsed >= 35, "forced regenerate waited for in-flight prefetch to finish");
    assert(fromCache === false && result.blob.id === "forced-fresh", "forced regenerate wins over prefetch");
    assert(h.peek(cacheKey)?.blob.id === "forced-fresh", "cache keeps forced PDF after prefetch completes");
    assert(generateCount >= 2, "both prefetch and forced generators ran");
  }

  // --- Without bypass, same key still hits cache ---
  {
    const h = createCacheHarness();
    h.put(cacheKey, { blobUrl: "blob:cached", fileName: "a.pdf", blob: { id: "cached" }, pageCount });
    const { result, fromCache } = await h.resolveForElement(
      cacheKey,
      pageCount,
      async () => ({ blobUrl: "blob:should-not", fileName: "a.pdf", blob: { id: "nope" }, pageCount }),
      { bypassCache: false },
    );
    assert(fromCache === true && result.blob.id === "cached", "non-bypass path still uses cache when page count matches");
  }
}

function runSourceGuards() {
  const cacheSrc = fs.readFileSync(path.join(root, "src/utils/statementPdfCache.ts"), "utf8");
  assert(cacheSrc.includes("if (options.bypassCache)"), "statementPdfCache has explicit bypassCache branch");
  assert(
    /if \(options\.bypassCache\)[\s\S]*clearStatementPdfCache\(cacheKey\)[\s\S]*const fresh = await generate\(\)/.test(cacheSrc),
    "bypassCache clears cache then generates fresh PDF",
  );
  assert(
    !/if \(!options\.bypassCache\)[\s\S]*peekStatementPdfCache[\s\S]*const \{ result \} = await resolveStatementPdf/.test(
      cacheSrc.replace(/\r\n/g, "\n"),
    ),
    "old fallthrough-to-resolve pattern is gone",
  );

  const serverSrc = fs.readFileSync(path.join(root, "server/index.mjs"), "utf8");
  assert(serverSrc.includes("function setMutablePdfNoCacheHeaders"), "server defines setMutablePdfNoCacheHeaders");
  assert(
    /app\.get\("\/api\/public\/pdf-share\/:token\/file"[\s\S]*?setMutablePdfNoCacheHeaders\(res\)/.test(serverSrc),
    "pdf-share file route uses no-cache headers",
  );
  assert(
    /if \(req\.query\.download === "1"\)[\s\S]*?setMutablePdfNoCacheHeaders\(res\)/.test(serverSrc),
    "pdf-share download route uses no-cache headers",
  );
  const fileRouteMatch = serverSrc.match(
    /app\.get\("\/api\/public\/pdf-share\/:token\/file",[\s\S]*?\n\}\);/,
  );
  assert(Boolean(fileRouteMatch), "pdf-share file route block found");
  assert(
    fileRouteMatch && !fileRouteMatch[0].includes('Cache-Control", "private, max-age=3600"'),
    "pdf-share file route no longer uses max-age=3600",
  );
}

await runBehaviorChecks();
runSourceGuards();

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll statement PDF cache regressions passed.");
