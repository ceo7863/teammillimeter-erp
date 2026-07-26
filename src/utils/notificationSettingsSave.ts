import {
  normalizeNotificationSettings,
  type NotificationSettings,
} from "@/utils/notificationSettings";

export type NotificationSettingsConflictError = Error & {
  status?: number;
  currentVersion?: number;
  settings?: NotificationSettings;
  updatedAt?: string;
};

export type NotificationSettingsSaveResult = {
  ok: boolean;
  settings: NotificationSettings;
  version: number;
  updatedAt?: string;
};

/** Probation rule sheet only edits these notification fields. */
export const PROBATION_NOTIFY_MERGE_KEYS = [
  "enabled",
  "probationEvalNotifyEnabled",
  "probationEvalReminderEnabled",
  "probationEvalNotifyHour",
  "probationEvalNotifyMinute",
] as const satisfies ReadonlyArray<keyof NotificationSettings>;

export type NotificationSettingsFieldKey = keyof NotificationSettings;

/**
 * Pick only the provided keys from a normalized draft.
 * Used so PATCH bodies do not overwrite unrelated server fields.
 */
export function pickNotificationSettingsFields(
  draft: NotificationSettings,
  keys: ReadonlyArray<NotificationSettingsFieldKey>,
): Partial<NotificationSettings> {
  const normalized = normalizeNotificationSettings(draft);
  const out: Partial<NotificationSettings> = {};
  for (const key of keys) {
    (out as Record<string, unknown>)[key] = normalized[key];
  }
  return out;
}

/**
 * Merge a user draft onto the latest server settings.
 * - Without keys: full draft wins.
 * - With keys: only those fields from the draft overlay the server baseline.
 */
export function mergeNotificationSettingsDraft(
  serverSettings: NotificationSettings | null | undefined,
  userDraft: NotificationSettings,
  keys?: ReadonlyArray<NotificationSettingsFieldKey>,
): NotificationSettings {
  const baseline = normalizeNotificationSettings(serverSettings);
  const draft = normalizeNotificationSettings(userDraft);
  if (!keys || keys.length === 0) {
    return draft;
  }
  return normalizeNotificationSettings({
    ...baseline,
    ...pickNotificationSettingsFields(draft, keys),
  });
}

/** Clear dirty keys that were not re-edited after the snapshot generation. */
export function clearUnchangedDirtyKeys(
  dirtyMeta: Map<NotificationSettingsFieldKey, number>,
  savedSnapshot: ReadonlyMap<NotificationSettingsFieldKey, number>,
): NotificationSettingsFieldKey[] {
  const cleared: NotificationSettingsFieldKey[] = [];
  for (const [key, gen] of savedSnapshot) {
    if (dirtyMeta.get(key) === gen) {
      dirtyMeta.delete(key);
      cleared.push(key);
    }
  }
  return cleared;
}

export function isNotificationSettingsConflictError(
  error: unknown,
): error is NotificationSettingsConflictError {
  return Boolean(error && typeof error === "object" && (error as { status?: number }).status === 409);
}

/**
 * Save with at most one conflict retry.
 * When mergeKeys are provided, only those fields are sent (server merges onto current).
 * On 409: refresh version (+ optional settings), resend dirty fields once.
 */
export async function saveNotificationSettingsWithConflictRetry(
  draft: NotificationSettings,
  options: {
    getVersion: () => number | undefined;
    save: (
      settings: Partial<NotificationSettings> | NotificationSettings,
      version?: number,
    ) => Promise<NotificationSettingsSaveResult>;
    fetchLatest?: () => Promise<{ settings: NotificationSettings; version: number; updatedAt?: string }>;
    onVersion?: (version: number) => void;
    mergeKeys?: ReadonlyArray<NotificationSettingsFieldKey>;
  },
): Promise<NotificationSettingsSaveResult> {
  let version = options.getVersion();
  const buildPayload = (): Partial<NotificationSettings> | NotificationSettings => {
    if (options.mergeKeys && options.mergeKeys.length > 0) {
      return pickNotificationSettingsFields(draft, options.mergeKeys);
    }
    return normalizeNotificationSettings(draft);
  };
  let payload = buildPayload();
  let retried = false;
  let patchCount = 0;

  while (true) {
    try {
      patchCount += 1;
      const result = await options.save(payload, version);
      options.onVersion?.(result.version);
      return { ...result, settings: normalizeNotificationSettings(result.settings) };
    } catch (error) {
      if (!isNotificationSettingsConflictError(error) || retried) {
        throw error;
      }
      retried = true;

      let serverSettings = error.settings;
      let nextVersion = error.currentVersion;

      if ((serverSettings == null || nextVersion == null) && options.fetchLatest) {
        const fresh = await options.fetchLatest();
        serverSettings = fresh.settings;
        nextVersion = fresh.version;
      }

      if (nextVersion == null) {
        throw error;
      }

      version = nextVersion;
      options.onVersion?.(version);

      if (options.mergeKeys && options.mergeKeys.length > 0) {
        // Dirty-only partial; server merges onto the latest row at retry time.
        payload = pickNotificationSettingsFields(draft, options.mergeKeys);
      } else if (serverSettings) {
        payload = mergeNotificationSettingsDraft(serverSettings, draft);
      } else {
        payload = normalizeNotificationSettings(draft);
      }
    }
  }
}

export type NotificationSettingsPersistOptions = {
  showSuccessMessage?: boolean;
};

/**
 * Coalescing save queue: at most one in-flight run and one pending latest draft.
 * Additional enqueue calls while busy replace the pending options (last write wins).
 */
export function createNotificationSettingsSaveQueue() {
  let running = false;
  let pending: NotificationSettingsPersistOptions | null = null;
  let pendingResolvers: Array<{
    resolve: (value: boolean) => void;
    reject: (reason?: unknown) => void;
  }> = [];

  const enqueue = (
    run: (options?: NotificationSettingsPersistOptions) => Promise<boolean>,
    options?: NotificationSettingsPersistOptions,
  ): Promise<boolean> => {
    if (running) {
      pending = {
        showSuccessMessage: Boolean(pending?.showSuccessMessage || options?.showSuccessMessage),
      };
      return new Promise<boolean>((resolve, reject) => {
        pendingResolvers.push({ resolve, reject });
      });
    }

    running = true;

    const execute = async (): Promise<boolean> => {
      let opts = options;
      let ok = false;
      try {
        for (;;) {
          ok = await run(opts);
          if (!pending) {
            const waiters = pendingResolvers;
            pendingResolvers = [];
            for (const waiter of waiters) waiter.resolve(ok);
            return ok;
          }
          opts = pending;
          pending = null;
        }
      } catch (error) {
        const waiters = pendingResolvers;
        pendingResolvers = [];
        pending = null;
        for (const waiter of waiters) waiter.reject(error);
        throw error;
      } finally {
        running = false;
        if (pending) {
          const trailing = pending;
          const waiters = pendingResolvers;
          pending = null;
          pendingResolvers = [];
          const followUp = enqueue(run, trailing);
          for (const waiter of waiters) {
            followUp.then(waiter.resolve, waiter.reject);
          }
        }
      }
    };

    return execute();
  };

  return {
    enqueue,
    get inFlight() {
      return running;
    },
    get hasQueued() {
      return pending != null;
    },
  };
}

/** Monotonic version publish helper (global ERP version must never go backwards). */
export function nextMonotonicVersion(current: number, incoming: number): number {
  if (!Number.isFinite(incoming)) return current;
  return incoming > current ? incoming : current;
}
