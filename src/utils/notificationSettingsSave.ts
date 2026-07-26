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

/**
 * Merge a user draft onto the latest server settings.
 * - Without keys: full draft wins (settings page owns the whole form).
 * - With keys: only those fields from the draft overlay the server baseline.
 */
export function mergeNotificationSettingsDraft(
  serverSettings: NotificationSettings | null | undefined,
  userDraft: NotificationSettings,
  keys?: ReadonlyArray<keyof NotificationSettings>,
): NotificationSettings {
  const baseline = normalizeNotificationSettings(serverSettings);
  const draft = normalizeNotificationSettings(userDraft);
  if (!keys || keys.length === 0) {
    return draft;
  }
  const overlay: Partial<NotificationSettings> = {};
  for (const key of keys) {
    (overlay as Record<string, unknown>)[key as string] = draft[key];
  }
  return normalizeNotificationSettings({ ...baseline, ...overlay });
}

export function isNotificationSettingsConflictError(
  error: unknown,
): error is NotificationSettingsConflictError {
  return Boolean(error && typeof error === "object" && (error as { status?: number }).status === 409);
}

/**
 * Save with at most one conflict retry.
 * On 409: refresh version (+ optional settings), merge user draft, retry once.
 * Never replaces the caller's draft in memory — caller keeps UI state.
 */
export async function saveNotificationSettingsWithConflictRetry(
  draft: NotificationSettings,
  options: {
    getVersion: () => number | undefined;
    save: (settings: NotificationSettings, version?: number) => Promise<NotificationSettingsSaveResult>;
    fetchLatest?: () => Promise<{ settings: NotificationSettings; version: number; updatedAt?: string }>;
    onVersion?: (version: number) => void;
    mergeKeys?: ReadonlyArray<keyof NotificationSettings>;
  },
): Promise<NotificationSettingsSaveResult> {
  let version = options.getVersion();
  let payload = normalizeNotificationSettings(draft);
  let retried = false;

  while (true) {
    try {
      const result = await options.save(payload, version);
      options.onVersion?.(result.version);
      return result;
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
      payload = mergeNotificationSettingsDraft(serverSettings, draft, options.mergeKeys);
    }
  }
}

export type NotificationSettingsPersistOptions = {
  showSuccessMessage?: boolean;
};

/**
 * Serializes save work so only one runner executes at a time.
 * Each job should read the latest draft from refs at start so later edits win.
 */
export function createNotificationSettingsSaveQueue() {
  let chain: Promise<unknown> = Promise.resolve();
  let inFlightCount = 0;

  const enqueue = (
    run: (options?: NotificationSettingsPersistOptions) => Promise<boolean>,
    options?: NotificationSettingsPersistOptions,
  ): Promise<boolean> => {
    inFlightCount += 1;
    const job = async () => {
      try {
        return await run(options);
      } finally {
        inFlightCount -= 1;
      }
    };
    const result = chain.then(job, job) as Promise<boolean>;
    chain = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };

  return {
    enqueue,
    get inFlight() {
      return inFlightCount > 0;
    },
  };
}
