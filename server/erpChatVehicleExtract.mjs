import { chatIncludesIntent } from "./erpChatFuzzy.mjs";

const WORKER_VEHICLE_QUERY_PATTERN =
  /\uCC28\uB7C9(?:\s*\uBC88\uD638)?|\uCC28\s*\uBC88\uD638|\uCC28\uBC88\uD638|\uB108\uBBC0\uBC84|\uB118\uBC84|\uB2E4\uB2C8/;

const VEHICLE_KEYWORD_PATTERN_SOURCE =
  "(?:\\uCC28\\uB7C9(?:\\s*\\uBC88\\uD638)?|\\uCC28\\s*\\uBC88\\uD638|\\uCC28\\uBC88\\uD638|\\uB108\\uBBC0\\uBC84|\\uB118\\uBC84|\\uB2E4\\uB2C8)";

const VEHICLE_QUERY_FILLER_PATTERN =
  /(?:\uB294|\uC740|\uB97C|\uC758|\uC918|\uC54C\uB824|\uC870\uD68C|\uD655\uC778|\uC54C\uB824\uC918|\uBD10|\uC918\uC694|\?)/g;

function stripVehicleQueryFiller(name) {
  return String(name || "")
    .replace(VEHICLE_QUERY_FILLER_PATTERN, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function isWorkerVehicleQuery(text) {
  const raw = String(text || "");
  return chatIncludesIntent(raw, "vehicle") || WORKER_VEHICLE_QUERY_PATTERN.test(raw);
}

export function extractWorkerNameFromVehicleQuery(text) {
  const raw = String(text || "").trim();
  if (!raw) return "";

  const possessive = raw.match(
    new RegExp(`^(.+?)\\uC758\\s*(?:${VEHICLE_KEYWORD_PATTERN_SOURCE})`),
  );
  if (possessive) return stripVehicleQueryFiller(possessive[1]);

  const keywordFirst = raw.match(
    new RegExp(`^(?:${VEHICLE_KEYWORD_PATTERN_SOURCE})(?:\\s*|\\uC758)?(.+)$`),
  );
  if (keywordFirst) return stripVehicleQueryFiller(keywordFirst[1]);

  const keywordLast = raw.match(
    new RegExp(`^(.+?)(?:\\s*|\\uC758)(?:${VEHICLE_KEYWORD_PATTERN_SOURCE})`),
  );
  if (keywordLast) return stripVehicleQueryFiller(keywordLast[1]);

  return stripVehicleQueryFiller(
    raw
      .replace(WORKER_VEHICLE_QUERY_PATTERN, "")
      .replace(/\uBC88\uD638/g, "")
      .replace(/\uC758$/g, ""),
  );
}
