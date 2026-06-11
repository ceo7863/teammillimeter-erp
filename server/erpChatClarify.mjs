import { chatIncludesIntent } from "./erpChatFuzzy.mjs";
import { hasChatOpenVerb } from "./erpChatTools.mjs";

const ERP_TOPIC_PATTERN =
  /\uBBF8\uC218|\uC785\uAE08|\uCD9C\uAE08|\uD1B5\uC7A5|\uACC4\uC88C|\uC138\uAE08\uACC4\uC0B0\uC11C|\uC804\uD45C|\uC77C\uC815|\uC2A4\uCF00\uC904|\uCE98\uB9B0\uB354|\uB2EC\uB825|\uC5F4\uC5B4|\uC870\uD68C|\uAC70\uB798\uCC98|\uC2DC\uACF5|\uCC28\uB7C9|\uCC28\uBC88|\uC5F0\uB77D\uCC98|\uC804\uD654|\uB2F4\uB2F9|\uB0B4\uC5ED\uC11C|\uC2DC\uACF5\uBE44|\uB9E4\uCD9C|\uBD84\uC11D|\uADFC\uD0DC|\uB300\uC2DC\uBCF4\uB4DC|\uD604\uC7A5|\uD734\uAC00|\uC77C\uC77C\uBCF4\uACE0/i;

function stripNoise(text) {
  return String(text || "")
    .replace(/[!?.,~�]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function expandQuestionWithChatContext(question, messages = []) {
  const q = stripNoise(question);
  if (!q || q.length > 48) return String(question || "").trim();

  const rows = Array.isArray(messages) ? messages : [];
  const lastUserIndex = rows.map((row) => row.role).lastIndexOf("user");
  if (lastUserIndex < 0) return String(question || "").trim();

  const prevAssistant = rows
    .slice(0, lastUserIndex)
    .reverse()
    .find((row) => row.role === "assistant" && String(row.content || "").trim());
  if (!prevAssistant) return String(question || "").trim();

  const prev = String(prevAssistant.content || "");

  if (/\uAC70\uB798\uCC98.*\uD604\uC7A5|\uB0A0\uC9DC.*\uD604\uC7A5|\uD604\uC7A5\uC744 \uCC3E/.test(prev) && !/\uD604\uC7A5|\uC77C\uC815/.test(q)) {
    const dateHint = /\uB0B4\uC77C/.test(prev) ? "\uB0B4\uC77C" : /\uC624\uB298/.test(prev) ? "\uC624\uB298" : "\uC624\uB298";
    return `${dateHint} ${q} \uD604\uC7A5`;
  }

  if (/\uBBF8\uC218/.test(prev) && !/\uBBF8\uC218/.test(q) && q.length <= 24) {
    return `${q} \uBBF8\uC218`;
  }

  if (/\uC77C\uC815|\uC2A4\uCF00\uC904/.test(prev) && !/\uC77C\uC815|\uC2A4\uCF00\uC904|SC/i.test(q) && q.length <= 24) {
    const dateHint = /\uB0B4\uC77C/.test(prev) ? "\uB0B4\uC77C" : /\uC774\uBC88\uC8FC/.test(prev) ? "\uC774\uBC88\uC8FC" : "\uC624\uB298";
    return `${dateHint} ${q} \uC77C\uC815`;
  }

  if (/\uD654\uBA74|\uC5F4\uC5B4|\uC790\uB8CC/.test(prev) && !hasChatOpenVerb(q) && q.length <= 28) {
    return `${q} \uC5F4\uC5B4\uC918`;
  }

  if (/\uC5F0\uB77D\uCC98|\uC804\uD654|\uACC4\uC88C|\uCC28\uB7C9/.test(prev) && q.length <= 20) {
    if (/\uACC4\uC88C/.test(prev)) return `${q} \uACC4\uC88C\uBC88\uD638`;
    if (/\uCC28/.test(prev)) return `${q} \uCC28\uB7C9\uBC88\uD638`;
    return `${q} \uC804\uD654\uBC88\uD638`;
  }

  return String(question || "").trim();
}

export function tryBuildChatClarification(question, context = {}) {
  const text = stripNoise(question);
  const compact = text.replace(/\s+/g, "");
  if (!text) return null;

  if (/\uD604\uC7A5/.test(text) && !/\uC624\uB298|\uB0B4\uC77C|\uC5B4\uC81C|\d/.test(text) && text.length <= 24) {
    return [
      "\uC5B4\uB290 \uB0A0\uC9DC\u00B7\uAC70\uB798\uCC98 \uD604\uC7A5\uC744 \uCC3E\uC73C\uC2DC\uB098\uC694?",
      "\u203B \uC804\uCCB4: \"\uC624\uB298 \uD604\uC7A5\" / \uAC70\uB798\uCC98 \uC9C0\uC815: \"\uC624\uB298 \uC778\uB514\uD37C \uD604\uC7A5\"",
    ].join("\n");
  }

  if (
    (/^(\uC77C\uC815|\uC2A4\uCF00\uC904|sc\uC77C\uC815?)$/i.test(compact) ||
      /^(\uC624\uB298|\uB0B4\uC77C|\uC774\uBC88\uC8FC)$/.test(compact)) &&
    text.length <= 12
  ) {
    return [
      "\uC5B8\uC81C \uC77C\uC815\uC744 \uBCFC\uAE4C\uC694? \uAC70\uB798\uCC98\uB098 \uC2DC\uACF5\uC790\uB3C4 \uC54C\uB824\uC8FC\uC138\uC694.",
      "\u203B \"\uC624\uB298 \uD604\uC7A5\", \"\uB0B4\uC77C \uC77C\uC815\", \"\uC774\uBC88\uC8FC \uC778\uB514\uD37C \uC77C\uC815\"",
    ].join("\n");
  }

  if (chatIncludesIntent(text, "unpaid") && text.replace(/\uBBF8\uC218\uAE08?|\uD604\uC7AC|\uC54C\uB824|\uC870\uD68C|\uC918|\?/g, "").trim().length <= 2) {
    return [
      "\uC5B4\uB290 \uAC70\uB798\uCC98 \uBBF8\uC218\uB97C \uD655\uC778\uD560\uAE4C\uC694?",
      "\u203B \"\uC778\uB514\uD37C \uBBF8\uC218\", \"\uC774\uBC88\uB2EC \uBBF8\uC218 \uBAA9\uB85D\"",
    ].join("\n");
  }

  if (
    (/\uC804\uD654|\uC5F0\uB77D\uCC98|\uACC4\uC88C|\uCC28\uB7C9|\uCC28\uBC88/.test(text) || chatIncludesIntent(text, "vehicle")) &&
    text.length <= 14
  ) {
    return [
      "\uC5B4\uB290 \uBD84 \uC815\uBCF4\uB97C \uCC3E\uC744\uAE4C\uC694? \uC774\uB984\uC744 \uC54C\uB824\uC8FC\uC138\uC694.",
      "\u203B \"\uAC15\uD0DC\uC6D0 \uACC4\uC88C\uBC88\uD638\", \"\uBC15\uC900\uADDC \uCC28\uB7C9\uBC88\uD638\", \"\uC778\uB514\uD37C \uB2F4\uB2F9 \uC804\uD654\"",
    ].join("\n");
  }

  if (hasChatOpenVerb(text) && text.replace(/[\uC5F4\uBD10\uCC28\uC774\uB3D9\uD655\uC778\uC870\uD68C\uBCF4\uAE30\uBCF4\uC5EC\uC918\uC694\uC785\uB2C8\uCE74]/g, "").trim().length <= 2) {
    return [
      "\uC5B4\uB290 \uD654\uBA74\uC774\uB098 \uC790\uB8CC\uB97C \uC5F4\uC5B4 \uB4DC\uB9B4\uAE4C\uC694?",
      "\u203B \"\uC778\uB514\uD37C \uCE98\uB9B0\uB354\", \"SC \uC2A4\uCF00\uC904\", \"\uD1B5\uC7A5\", \"\uC778\uB514\uD37C \uC0AC\uC5C5\uC790\uB4F1\uB85D\uC99D\"",
    ].join("\n");
  }

  if (context.noAnswer && ERP_TOPIC_PATTERN.test(text) && text.length <= 36) {
    return [
      "\uC870\uAE08 \uC815\uD655\uD788 \uC774\uD574\uD558\uAE30 \uC5B4\uB824\uC6B4 \uC9C8\uBB38\uC774\uC5D0\uC694. \uC870\uAE08 \uB354 \uAD6C\uCCB4\uC801\uC73C\uB85C \uC54C\uB824\uC8FC\uC138\uC694.",
      "\u203B \uBBF8\uC218 / \uC624\uB298\u00B7\uB0B4\uC77C \uD604\uC7A5 / \uC77C\uC815 / \uC804\uD654\u00B7\uACC4\uC88C / \uD654\uBA74 \uC5F4\uAE30 \uB4F1",
      "\u203B \"\uC624\uB298 \uD604\uC7A5\", \"\uC778\uB514\uD37C \uBBF8\uC218\", \"\uAC15\uD0DC\uC6D0 \uACC4\uC88C\uBC88\uD638\"",
    ].join("\n");
  }

  return null;
}

export function toolErrorToClarification(error, toolName = "") {
  const message = String(error || "").trim();
  if (!message) return null;

  if (message.includes("\uAC70\uB798\uCC98 \uC774\uB984\uC774 \uD544\uC694")) {
    return [
      "\uC5B4\uB290 \uAC70\uB798\uCC98\uC778\uC9C0 \uC54C\uB824\uC8FC\uC138\uC694.",
      toolName === "get_client_site_on_date"
        ? "\u203B \"\uC624\uB298 \uC778\uB514\uD37C \uD604\uC7A5\", \"6\uC6D4 2\uC77C \uD0A4\uCE9C\uC81C\uB2C8\uC2A4 \uD604\uC7A5\""
        : "\u203B \"\uC778\uB514\uD37C \uBBF8\uC218\", \"\uC778\uB514\uD37C \uB2F4\uB2F9 \uC804\uD654\"",
    ].join("\n");
  }

  if (message.includes("\uCC3E\uC744 \uC218 \uC5C6")) {
    return [
      message,
      "\uAC70\uB798\uCC98\uB098 \uC774\uB984 \uCCA0\uC790\uB97C \uB2E4\uC2DC \uD655\uC778\uD574 \uC8FC\uC2DC\uAC70\uB098, \uBE44\uC2B7\uD55C \uD45C\uAE30\uB85C \uC54C\uB824\uC8FC\uC138\uC694.",
    ].join("\n");
  }

  if (message.includes("\uB0A0\uC9DC") && message.includes("\uD544\uC694")) {
    return [
      "\uC5B4\uB290 \uB0A0\uC9DC\uC778\uC9C0 \uC54C\uB824\uC8FC\uC138\uC694.",
      "\u203B \"\uC624\uB298\", \"\uB0B4\uC77C\", \"6\uC6D4 2\uC77C\", \"\uC774\uBC88\uC8FC\"",
    ].join("\n");
  }

  return null;
}

export function resolveFailedToolClarification(toolsUsed = []) {
  for (const row of toolsUsed) {
    if (row?.result?.ok !== false) continue;
    const clarification = toolErrorToClarification(row.result?.error, row.name);
    if (clarification) return clarification;
  }
  return null;
}
