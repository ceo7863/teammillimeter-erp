const COALESCE_MS = 200;
const pendingByKey = new Map();

/**
 * Coalesce concurrent writes for the same key within a short window.
 * Latest payload wins; all callers receive the same save result.
 */
export function queueCoalescedWrite(key, payload, saveFn) {
  return new Promise((resolve, reject) => {
    const existing = pendingByKey.get(key);
    if (existing) {
      existing.payload = payload;
      existing.waiters.push({ resolve, reject });
      return;
    }

    const entry = {
      payload,
      waiters: [{ resolve, reject }],
      timer: null,
    };

    entry.timer = setTimeout(async () => {
      pendingByKey.delete(key);
      const finalPayload = entry.payload;
      try {
        const result = await saveFn(finalPayload);
        for (const waiter of entry.waiters) {
          waiter.resolve(result);
        }
      } catch (error) {
        for (const waiter of entry.waiters) {
          waiter.reject(error);
        }
      }
    }, COALESCE_MS);

    pendingByKey.set(key, entry);
  });
}
