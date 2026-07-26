/**
 * Regression: notification settings save consistency
 * (GET version, conflict retry, serial queue, domain-scoped save).
 *
 * Usage: npx tsx scripts/test-notification-settings-save-consistency.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createNotificationSettingsSaveQueue,
  mergeNotificationSettingsDraft,
  saveNotificationSettingsWithConflictRetry,
} from "../src/utils/notificationSettingsSave.ts";
import { normalizeNotificationSettings } from "../src/utils/notificationSettings.ts";

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

async function main() {
  await check("merge: full draft wins without keys", () => {
    const server = normalizeNotificationSettings({ enabled: false, dailyReportEnabled: true });
    const draft = normalizeNotificationSettings({
      enabled: true,
      dailyReportEnabled: false,
      commentNotifyEnabled: true,
    });
    const merged = mergeNotificationSettingsDraft(server, draft);
    assert.equal(merged.enabled, true);
    assert.equal(merged.dailyReportEnabled, false);
    assert.equal(merged.commentNotifyEnabled, true);
  });

  await check("merge: keyed overlay keeps unrelated server fields", () => {
    const server = normalizeNotificationSettings({
      enabled: false,
      dailyReportEnabled: true,
      probationEvalNotifyEnabled: false,
      probationEvalNotifyHour: 9,
    });
    const draft = normalizeNotificationSettings({
      enabled: true,
      dailyReportEnabled: false,
      probationEvalNotifyEnabled: true,
      probationEvalNotifyHour: 18,
    });
    const merged = mergeNotificationSettingsDraft(server, draft, [
      "enabled",
      "probationEvalNotifyEnabled",
      "probationEvalNotifyHour",
    ]);
    assert.equal(merged.enabled, true);
    assert.equal(merged.probationEvalNotifyEnabled, true);
    assert.equal(merged.probationEvalNotifyHour, 18);
    assert.equal(merged.dailyReportEnabled, true, "unrelated server field preserved");
  });

  await check("conflict retry: preserves draft and succeeds on second attempt", async () => {
    const draft = normalizeNotificationSettings({ enabled: true, probationEvalNotifyHour: 17 });
    let version = 1;
    let calls = 0;
    const result = await saveNotificationSettingsWithConflictRetry(draft, {
      getVersion: () => version,
      save: async (settings, expected) => {
        calls += 1;
        if (calls === 1) {
          const err = new Error("VERSION_CONFLICT") as Error & {
            status: number;
            currentVersion: number;
            settings: ReturnType<typeof normalizeNotificationSettings>;
          };
          err.status = 409;
          err.currentVersion = 2;
          err.settings = normalizeNotificationSettings({
            enabled: false,
            dailyReportEnabled: true,
            probationEvalNotifyHour: 9,
          });
          throw err;
        }
        assert.equal(expected, 2);
        assert.equal(settings.enabled, true, "user draft enabled preserved");
        assert.equal(settings.probationEvalNotifyHour, 17, "user draft hour preserved");
        assert.equal(settings.dailyReportEnabled, true, "server unrelated field kept via mergeKeys");
        return { ok: true, settings, version: 3 };
      },
      onVersion: (v) => {
        version = v;
      },
      mergeKeys: ["enabled", "probationEvalNotifyHour"],
    });
    assert.equal(calls, 2);
    assert.equal(result.version, 3);
    assert.equal(version, 3);
  });

  await check("conflict retry: second 409 keeps throwing (draft not wiped by helper)", async () => {
    const draft = normalizeNotificationSettings({ enabled: true });
    let threw = false;
    try {
      await saveNotificationSettingsWithConflictRetry(draft, {
        getVersion: () => 1,
        save: async () => {
          const err = new Error("VERSION_CONFLICT") as Error & { status: number; currentVersion: number };
          err.status = 409;
          err.currentVersion = 9;
          throw err;
        },
        fetchLatest: async () => ({
          settings: normalizeNotificationSettings({ enabled: false }),
          version: 9,
        }),
      });
    } catch (error) {
      threw = true;
      assert.equal((error as { status?: number }).status, 409);
    }
    assert.equal(threw, true);
    assert.equal(draft.enabled, true, "caller draft object untouched");
  });

  await check("serial queue: no concurrent runs; last write wins", async () => {
    const queue = createNotificationSettingsSaveQueue();
    let concurrent = 0;
    let maxConcurrent = 0;
    let draftValue = "a";
    const saved: string[] = [];
    let firstStarted!: () => void;
    const firstStartedPromise = new Promise<void>((resolve) => {
      firstStarted = resolve;
    });

    const run = async () => {
      const payload = draftValue;
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      if (saved.length === 0) firstStarted();
      await new Promise((r) => setTimeout(r, 30));
      concurrent -= 1;
      saved.push(payload);
      return true;
    };

    const p1 = queue.enqueue(run);
    await firstStartedPromise;
    draftValue = "b";
    const p2 = queue.enqueue(run);
    draftValue = "c";
    const p3 = queue.enqueue(run);
    await Promise.all([p1, p2, p3]);
    assert.equal(maxConcurrent, 1, "never two PATCH-equivalent runs at once");
    assert.equal(saved[0], "a", "in-flight save keeps the draft captured at start");
    assert.equal(saved[saved.length - 1], "c", "later jobs read latest draft (last write wins)");
    assert.ok(saved.every((value) => value === "a" || value === "b" || value === "c"));
  });

  await check("db domain save: notification patch preserves unrelated domain + returns version", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "erp-notify-settings-"));
    const dbFile = path.join(tmpDir, "erp.sqlite");
    process.env.DATABASE_PATH = dbFile;

    const { initDb, getErpState, saveErpState, saveErpDomain } = await import("../server/db.mjs");
    const { normalizeNotificationSettings: normalizeServer, notificationSettingsWithLegacy } = await import(
      "../server/notificationSettings.mjs"
    );

    initDb();
    const seed = getErpState();
    const seeded = saveErpState(
      {
        ...(seed.data || {}),
        workers: [{ id: "w-keep", name: "보존시공자" }],
        notificationSettings: normalizeServer({ enabled: false, probationEvalNotifyHour: 9 }),
        companyNotices: [{ id: "n1", title: "keep-me" }],
      },
      seed.version,
      "test-seed",
    );

    const before = getErpState();
    assert.equal(before.version, seeded.version);

    const getPayload = {
      settings: notificationSettingsWithLegacy(before.data || {}, (x: unknown) => x),
      version: before.version,
      updatedAt: before.updatedAt,
    };
    assert.equal(typeof getPayload.version, "number");
    assert.ok(getPayload.settings);

    const workersSaved = await saveErpDomain(
      "workers",
      { workers: [{ id: "w-keep", name: "보존시공자" }, { id: "w-new", name: "신규" }] },
      before.version,
      "other-domain",
    );

    let conflicted = false;
    try {
      await saveErpDomain(
        "settings",
        {
          notificationSettings: normalizeServer({
            enabled: true,
            probationEvalNotifyHour: 18,
          }),
        },
        before.version,
        "stale-client",
      );
    } catch (error) {
      conflicted = true;
      assert.equal((error as { status?: number }).status, 409);
      assert.equal((error as { currentVersion?: number }).currentVersion, workersSaved.version);
    }
    assert.equal(conflicted, true);

    const saved = await saveErpDomain(
      "settings",
      {
        notificationSettings: normalizeServer({
          enabled: true,
          probationEvalNotifyHour: 18,
        }),
      },
      workersSaved.version,
      "notify-client",
    );
    const after = getErpState();
    assert.equal(after.version, saved.version);
    assert.equal(after.data?.notificationSettings?.enabled, true);
    assert.equal(after.data?.notificationSettings?.probationEvalNotifyHour, 18);
    assert.equal(Array.isArray(after.data?.workers) && after.data.workers.length, 2);
    assert.equal(after.data?.companyNotices?.[0]?.title, "keep-me");

    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors on Windows file locks
    }
  });

  if (failed > 0) {
    console.error(`\n${failed} test(s) failed`);
    process.exit(1);
  }
  console.log("\nAll notification settings save consistency tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
