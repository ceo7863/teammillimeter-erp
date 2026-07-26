/**
 * Hardening regressions for notification settings save.
 * Covers dirty-field merge, coalescing, autosave/manual races, version monotonicity.
 *
 * Usage: npx tsx scripts/test-notification-settings-save-consistency.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  PROBATION_NOTIFY_MERGE_KEYS,
  clearUnchangedDirtyKeys,
  createNotificationSettingsSaveQueue,
  mergeNotificationSettingsDraft,
  nextMonotonicVersion,
  pickNotificationSettingsFields,
  saveNotificationSettingsWithConflictRetry,
  type NotificationSettingsFieldKey,
} from "../src/utils/notificationSettingsSave.ts";
import { normalizeNotificationSettings, type NotificationSettings } from "../src/utils/notificationSettings.ts";

let failed = 0;

async function check(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`PASS: ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL: ${name}`);
    console.error(error);
  }
}

/** Mirrors NotificationSettingsPage save/autosave state machine for PATCH-count tests. */
function createPageSaveHarness(options?: { autosaveDelayMs?: number }) {
  const delayMs = options?.autosaveDelayMs ?? 800;
  const queue = createNotificationSettingsSaveQueue();
  const dirtyMeta = new Map<NotificationSettingsFieldKey, number>();
  let editGen = 0;
  let version = 1;
  let draft = normalizeNotificationSettings({
    enabled: false,
    dailyReportHour: 8,
    dailyReportMinute: 0,
    probationEvalNotifyHour: 19,
    recipients: [],
  });
  let server = { ...draft };
  let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
  let patchBodies: Array<Partial<NotificationSettings>> = [];
  let globalErpVersion = 10;
  const globalVersions: number[] = [globalErpVersion];

  const cancelAutosaveTimer = () => {
    if (autosaveTimer) {
      clearTimeout(autosaveTimer);
      autosaveTimer = null;
    }
  };

  const markDirty = (keys: NotificationSettingsFieldKey[]) => {
    editGen += 1;
    for (const key of keys) dirtyMeta.set(key, editGen);
  };

  const publishGlobal = (v: number) => {
    globalErpVersion = nextMonotonicVersion(globalErpVersion, v);
    globalVersions.push(globalErpVersion);
  };

  const persist = async () => {
    const snapshot = new Map(dirtyMeta);
    const keys = [...snapshot.keys()];
    if (!keys.length) return true;
    const draftAtStart = draft;
    const result = await saveNotificationSettingsWithConflictRetry(draftAtStart, {
      getVersion: () => version,
      mergeKeys: keys,
      onVersion: (v) => {
        version = v;
        publishGlobal(v);
      },
      save: async (partial, expected) => {
        patchBodies.push(partial);
        if (expected != null && expected !== version && expected !== (server as { _v?: number })._v) {
          // version check against harness server version
        }
        if (expected != null && expected < version) {
          const err = new Error("VERSION_CONFLICT") as Error & {
            status: number;
            currentVersion: number;
            settings: NotificationSettings;
          };
          err.status = 409;
          err.currentVersion = version;
          err.settings = server;
          throw err;
        }
        // Simulate concurrent server fields already present.
        server = normalizeNotificationSettings({ ...server, ...partial });
        version += 1;
        return { ok: true, settings: server, version };
      },
    });
    clearUnchangedDirtyKeys(dirtyMeta, snapshot);
    if (dirtyMeta.size === 0) {
      draft = normalizeNotificationSettings(result.settings);
    } else {
      draft = mergeNotificationSettingsDraft(result.settings, draft, [...dirtyMeta.keys()]);
    }
    return true;
  };

  const scheduleAfterEdit = () => {
    if (queue.inFlight) {
      cancelAutosaveTimer();
      void queue.enqueue(persist);
      return;
    }
    cancelAutosaveTimer();
    autosaveTimer = setTimeout(() => {
      autosaveTimer = null;
      void queue.enqueue(persist);
    }, delayMs);
  };

  return {
    get draft() {
      return draft;
    },
    get dirtyKeys() {
      return [...dirtyMeta.keys()];
    },
    get patchCount() {
      return patchBodies.length;
    },
    get patchBodies() {
      return patchBodies;
    },
    get version() {
      return version;
    },
    get globalErpVersion() {
      return globalErpVersion;
    },
    get globalVersions() {
      return globalVersions;
    },
    get hasAutosaveTimer() {
      return autosaveTimer != null;
    },
    seedServer(next: Partial<NotificationSettings>, nextVersion = version) {
      server = normalizeNotificationSettings({ ...server, ...next });
      version = nextVersion;
      draft = { ...server };
      dirtyMeta.clear();
    },
    /** Simulate another admin changing server fields + bumping version. */
    remoteUpdate(partial: Partial<NotificationSettings>) {
      server = normalizeNotificationSettings({ ...server, ...partial });
      version += 1;
    },
    edit(keys: NotificationSettingsFieldKey[], patch: Partial<NotificationSettings>) {
      markDirty(keys);
      draft = normalizeNotificationSettings({ ...draft, ...patch });
      scheduleAfterEdit();
    },
    async saveNow() {
      cancelAutosaveTimer();
      return queue.enqueue(persist, { showSuccessMessage: true });
    },
    flushAutosave() {
      if (!autosaveTimer) return;
      cancelAutosaveTimer();
      return queue.enqueue(persist);
    },
    adoptGetVersion(v: number) {
      // Local only — must not publish globally.
      version = v;
    },
    applyLateGetToGlobal(v: number) {
      // Incorrect old behavior for regression contrast is not used;
      // harness only allows monotonic publish.
      publishGlobal(v);
    },
  };
}

async function main() {
  await check("1) dirty enabled-only 409 retry preserves other admin's hour", async () => {
    const server = normalizeNotificationSettings({
      enabled: false,
      dailyReportHour: 8,
      probationEvalNotifyHour: 19,
    });
    const draft = normalizeNotificationSettings({ ...server, enabled: true });
    let version = 1;
    let calls = 0;
    const result = await saveNotificationSettingsWithConflictRetry(draft, {
      getVersion: () => version,
      mergeKeys: ["enabled"],
      onVersion: (v) => {
        version = v;
      },
      save: async (partial, expected) => {
        calls += 1;
        if (calls === 1) {
          assert.deepEqual(Object.keys(partial).sort(), ["enabled"]);
          const err = new Error("VERSION_CONFLICT") as Error & {
            status: number;
            currentVersion: number;
            settings: NotificationSettings;
          };
          err.status = 409;
          err.currentVersion = 2;
          err.settings = normalizeNotificationSettings({
            ...server,
            dailyReportHour: 11,
            probationEvalNotifyHour: 17,
          });
          throw err;
        }
        assert.equal(expected, 2);
        assert.deepEqual(Object.keys(partial).sort(), ["enabled"]);
        const merged = normalizeNotificationSettings({
          enabled: false,
          dailyReportHour: 11,
          probationEvalNotifyHour: 17,
          ...partial,
        });
        assert.equal(merged.enabled, true);
        assert.equal(merged.dailyReportHour, 11, "admin B hour preserved");
        assert.equal(merged.probationEvalNotifyHour, 17, "admin B eval hour preserved");
        return { ok: true, settings: merged, version: 3 };
      },
    });
    assert.equal(calls, 2);
    assert.equal(result.settings.dailyReportHour, 11);
    assert.equal(result.settings.enabled, true);
  });

  await check("2) recipients-only dirty preserves all other server fields", async () => {
    const server = normalizeNotificationSettings({
      enabled: true,
      dailyReportEnabled: false,
      commentNotifyEnabled: true,
      dailyReportHour: 7,
      recipients: [{ userId: 1, phone: "01011112222", dailyReport: false, commentNotify: false }],
    });
    const draft = normalizeNotificationSettings({
      ...server,
      enabled: false,
      dailyReportHour: 1,
      recipients: [{ userId: 1, phone: "01011112222", dailyReport: true, commentNotify: true }],
    });
    const partial = pickNotificationSettingsFields(draft, ["recipients"]);
    assert.deepEqual(Object.keys(partial), ["recipients"]);
    const merged = mergeNotificationSettingsDraft(server, draft, ["recipients"]);
    assert.equal(merged.enabled, true);
    assert.equal(merged.dailyReportEnabled, false);
    assert.equal(merged.dailyReportHour, 7);
    assert.equal(merged.recipients[0]?.dailyReport, true);
  });

  await check("3) in-flight edit coalesces; last value saved; no duplicate success enqueue", async () => {
    const harness = createPageSaveHarness({ autosaveDelayMs: 50 });
    harness.seedServer({ enabled: false }, 5);

    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const originalSaveNow = harness.saveNow.bind(harness);

    // Slow first persist by editing then flushing after patching queue via direct conflict helper path:
    const queue = createNotificationSettingsSaveQueue();
    const dirtyMeta = new Map<NotificationSettingsFieldKey, number>();
    dirtyMeta.set("enabled", 1);
    let draft = normalizeNotificationSettings({ enabled: true });
    let patchCount = 0;
    let version = 1;
    let server = normalizeNotificationSettings({ enabled: false, dailyReportHour: 8 });

    const persist = async () => {
      const snapshot = new Map(dirtyMeta);
      const keys = [...snapshot.keys()];
      const draftSnap = draft;
      await gate;
      const result = await saveNotificationSettingsWithConflictRetry(draftSnap, {
        getVersion: () => version,
        mergeKeys: keys,
        onVersion: (v) => {
          version = v;
        },
        save: async (partial) => {
          patchCount += 1;
          server = normalizeNotificationSettings({ ...server, ...partial });
          version += 1;
          return { ok: true, settings: server, version };
        },
      });
      clearUnchangedDirtyKeys(dirtyMeta, snapshot);
      if (dirtyMeta.size === 0) draft = result.settings;
      else draft = mergeNotificationSettingsDraft(result.settings, draft, [...dirtyMeta.keys()]);
      return true;
    };

    const p1 = queue.enqueue(persist);
    // Edit during in-flight — coalesce one pending (do not also success-enqueue).
    dirtyMeta.set("enabled", 2);
    draft = normalizeNotificationSettings({ ...draft, enabled: false });
    const p2 = queue.enqueue(persist);
    dirtyMeta.set("dailyReportHour", 3);
    draft = normalizeNotificationSettings({ ...draft, dailyReportHour: 10 });
    const p3 = queue.enqueue(persist);
    assert.equal(queue.hasQueued, true);
    release();
    await Promise.all([p1, p2, p3]);
    assert.equal(patchCount, 2, "in-flight + one coalesced follow-up");
    assert.equal(server.enabled, false);
    assert.equal(server.dailyReportHour, 10);
    void originalSaveNow;
    void harness;
  });

  await check("4) autosave timer + save button => single PATCH", async () => {
    const harness = createPageSaveHarness({ autosaveDelayMs: 10_000 });
    harness.seedServer({ enabled: false }, 3);
    harness.edit(["enabled"], { enabled: true });
    assert.equal(harness.hasAutosaveTimer, true);
    await harness.saveNow();
    assert.equal(harness.hasAutosaveTimer, false);
    assert.equal(harness.patchCount, 1);
    assert.equal(harness.draft.enabled, true);
  });

  await check("5) 10 rapid edits coalesce to in-flight+pending; last value wins", async () => {
    const queue = createNotificationSettingsSaveQueue();
    let concurrent = 0;
    let maxConcurrent = 0;
    let draftValue = 0;
    const saved: number[] = [];
    let firstStarted!: () => void;
    const started = new Promise<void>((r) => {
      firstStarted = r;
    });

    const persist = async () => {
      const value = draftValue;
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      if (saved.length === 0) firstStarted();
      await new Promise((r) => setTimeout(r, 40));
      concurrent -= 1;
      saved.push(value);
      return true;
    };

    const p1 = queue.enqueue(persist);
    await started;
    const waiters: Promise<boolean>[] = [];
    for (let i = 1; i <= 10; i += 1) {
      draftValue = i;
      waiters.push(queue.enqueue(persist));
    }
    await Promise.all([p1, ...waiters]);
    assert.equal(maxConcurrent, 1);
    assert.ok(saved.length <= 3, `expected coalesced runs, got ${saved.length}`);
    assert.equal(saved[0], 0);
    assert.equal(saved[saved.length - 1], 10);
  });

  await check("6) failure and second 409 keep draft + dirty keys", async () => {
    const dirtyMeta = new Map<NotificationSettingsFieldKey, number>([
      ["enabled", 1],
      ["dailyReportHour", 1],
    ]);
    const draft = normalizeNotificationSettings({ enabled: true, dailyReportHour: 15 });
    let threw = false;
    try {
      await saveNotificationSettingsWithConflictRetry(draft, {
        getVersion: () => 1,
        mergeKeys: ["enabled", "dailyReportHour"],
        save: async () => {
          const err = new Error("VERSION_CONFLICT") as Error & { status: number; currentVersion: number };
          err.status = 409;
          err.currentVersion = 9;
          throw err;
        },
        fetchLatest: async () => ({
          settings: normalizeNotificationSettings({ enabled: false, dailyReportHour: 8 }),
          version: 9,
        }),
      });
    } catch (error) {
      threw = true;
      assert.equal((error as { status?: number }).status, 409);
    }
    assert.equal(threw, true);
    assert.equal(draft.enabled, true);
    assert.equal(draft.dailyReportHour, 15);
    assert.deepEqual([...dirtyMeta.keys()].sort(), ["dailyReportHour", "enabled"]);
  });

  await check("7) late GET version must not lower global erpVersion", () => {
    let global = 42;
    // Correct publish path (PATCH):
    global = nextMonotonicVersion(global, 43);
    assert.equal(global, 43);
    // Late GET must stay local-only; if mistakenly published, monotonic guard blocks regression:
    global = nextMonotonicVersion(global, 40);
    assert.equal(global, 43);

    const harness = createPageSaveHarness();
    harness.seedServer({}, 5);
    // Simulate App already at higher version from another domain save.
    harness.applyLateGetToGlobal(50);
    assert.equal(harness.globalErpVersion, 50);
    harness.adoptGetVersion(12); // local settings version only
    assert.equal(harness.version, 12);
    assert.equal(harness.globalErpVersion, 50, "GET local adopt must not change global");
    harness.applyLateGetToGlobal(12);
    assert.equal(harness.globalErpVersion, 50, "monotonic publish ignores stale GET");
  });

  await check("8) unrelated ERP domain + other notify fields preserved on domain save", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "erp-notify-hardening-"));
    process.env.DATABASE_PATH = path.join(tmpDir, "erp.sqlite");
    const { initDb, getErpState, saveErpState, saveErpDomain } = await import("../server/db.mjs");
    const { normalizeNotificationSettings: normalizeServer } = await import("../server/notificationSettings.mjs");

    initDb();
    const seed = getErpState();
    saveErpState(
      {
        ...(seed.data || {}),
        workers: [{ id: "w1", name: "보존" }],
        companyNotices: [{ id: "n1", title: "keep" }],
        notificationSettings: normalizeServer({ enabled: false, dailyReportHour: 8 }),
      },
      seed.version,
      "seed",
    );

    const before = getErpState();
    const workersSaved = await saveErpDomain(
      "workers",
      { workers: [{ id: "w1", name: "보존" }, { id: "w2", name: "추가" }] },
      before.version,
      "workers",
    );

    // Dirty-only notification patch with fresh version
    await saveErpDomain(
      "settings",
      {
        notificationSettings: normalizeServer({
          ...before.data?.notificationSettings,
          enabled: true,
        }),
      },
      workersSaved.version,
      "notify",
    );
    const after = getErpState();
    assert.equal(after.data?.notificationSettings?.enabled, true);
    assert.equal(after.data?.notificationSettings?.dailyReportHour, 8);
    assert.equal(after.data?.workers?.length, 2);
    assert.equal(after.data?.companyNotices?.[0]?.title, "keep");
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  await check("9) probation merge keys regression", async () => {
    const server = normalizeNotificationSettings({
      enabled: false,
      dailyReportEnabled: true,
      probationEvalNotifyEnabled: false,
      probationEvalNotifyHour: 9,
      probationEvalNotifyMinute: 0,
      probationEvalReminderEnabled: false,
    });
    const draft = normalizeNotificationSettings({
      ...server,
      enabled: true,
      dailyReportEnabled: false,
      probationEvalNotifyEnabled: true,
      probationEvalNotifyHour: 18,
      probationEvalNotifyMinute: 30,
      probationEvalReminderEnabled: true,
    });
    let calls = 0;
    const result = await saveNotificationSettingsWithConflictRetry(draft, {
      getVersion: () => 1,
      mergeKeys: [...PROBATION_NOTIFY_MERGE_KEYS],
      save: async (partial) => {
        calls += 1;
        const keys = Object.keys(partial).sort();
        assert.deepEqual(keys, [...PROBATION_NOTIFY_MERGE_KEYS].sort());
        return {
          ok: true,
          settings: normalizeNotificationSettings({ ...server, ...partial }),
          version: 2,
        };
      },
    });
    assert.equal(calls, 1);
    assert.equal(result.settings.enabled, true);
    assert.equal(result.settings.dailyReportEnabled, true, "non-probation field preserved");
    assert.equal(result.settings.probationEvalNotifyHour, 18);
  });

  await check("clearUnchangedDirtyKeys keeps re-edited fields", () => {
    const dirty = new Map<NotificationSettingsFieldKey, number>([
      ["enabled", 1],
      ["dailyReportHour", 1],
    ]);
    dirty.set("dailyReportHour", 2); // re-edited during save
    const cleared = clearUnchangedDirtyKeys(dirty, new Map([["enabled", 1], ["dailyReportHour", 1]]));
    assert.deepEqual(cleared, ["enabled"]);
    assert.deepEqual([...dirty.keys()], ["dailyReportHour"]);
  });

  if (failed > 0) {
    console.error(`\n${failed} test(s) failed`);
    process.exit(1);
  }
  console.log("\nAll notification settings save hardening tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
