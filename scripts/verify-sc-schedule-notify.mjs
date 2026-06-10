import { loadEnv } from "../server/loadEnv.mjs";
import { getErpState } from "../server/db.mjs";
import {
  buildScScheduleNotifyPreview,
  ensureScScheduleShareLink,
} from "../server/scScheduleNotify.mjs";

loadEnv();

const data = getErpState().data || {};
const preview = buildScScheduleNotifyPreview(data);
console.log(
  JSON.stringify(
    {
      targetDate: preview.targetDate,
      scheduleCount: preview.scheduleCount,
      notifyCount: preview.notifyCount,
      first: preview.rows[0] || null,
    },
    null,
    2,
  ),
);

const scheduleId = preview.rows[0]?.scheduleId;
if (scheduleId) {
  const link = await ensureScScheduleShareLink(scheduleId);
  console.log(
    "share-link",
    JSON.stringify({
      ok: link.ok,
      error: link.error || null,
      url: link.url ? `${link.url.slice(0, 60)}...` : null,
    }),
  );
}
