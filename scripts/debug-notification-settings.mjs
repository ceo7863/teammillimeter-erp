import { getErpState } from "../server/db.mjs";

const data = getErpState().data || {};
const settings = data.notificationSettings || {};
console.log("scScheduleNotifyMode", settings.scScheduleNotifyMode || "(default both)");
console.log("notificationSettings keys", Object.keys(settings));
