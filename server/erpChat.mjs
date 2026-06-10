import { config } from "./config.mjs";
import { findUserById } from "./db.mjs";
import {
  ERP_CHAT_TOOL_DEFINITIONS,
  executeErpChatTool,
  todayISO,
  tryRuleBasedChat,
  formatUnpaidAnswer,
  formatScheduleAnswer,
  formatContactAnswer,
  formatWorkerAnswer,
  formatClientContactsAnswer,
} from "./erpChatTools.mjs";
import { appendErpChatLog, listErpChatLogs, listErpChatLogsAdmin, clearErpChatLogsForUser } from "./erpChatStore.mjs";
import { appendErpChatAuditLog } from "./erpChatAudit.mjs";

const SYSTEM_PROMPT = [
  "\uB2F9\uC2E0\uC740 TeamMillimeter ERP \uC5B4\uC2DC\uC2A4\uD134\uD2B8\uC785\uB2C8\uB2E4.",
  "\uC9C8\uBB38\uC5D0 \uB2F5\uD558\uAE30 \uC804\uC5D0 \uBC18\uB4DC\uC2DC \uC81C\uACF5\uB41C \uB3C4\uAD6C\uB97C \uC0AC\uC6A9\uD558\uC138\uC694.",
  "\uAE08\uC561, \uAC74\uC218, \uC804\uD654\uBC88\uD638, \uCC28\uB7C9\uBC88\uD638\uB294 \uB3C4\uAD6C \uACB0\uACFC\uB97C \uAE30\uC900\uC73C\uB85C\uB9CC \uB2F5\uD558\uACE0 \uCD94\uCE21\uD558\uC9C0 \uB9C8\uC138\uC694.",
  "\uAC70\uB798\uCC98 \uB2F4\uB2F9\uC790 \uC870\uD68C\uB294 get_client_contacts, \uB2F4\uB2F9\uC790 \uC778\uC0C1 \uC870\uD68C\uB294 lookup_contact \uB3C4\uAD6C\uB97C \uC0AC\uC6A9\uD558\uC138\uC694.",
  "\uC2DC\uACF5\uC790 \uCC28\uB7C9\uBC88\uD638\uB294 get_worker_info \uB3C4\uAD6C\uB97C \uC0AC\uC6A9\uD558\uC138\uC694.",
  "\uAC70\uB798\uCC98 \uC774\uB984\uC774 \uBAA8\uD638\uD558\uBA74 search_client \uD6C4 \uD655\uC778\uD558\uC138\uC694.",
  `\uC624\uB298 \uB0A0\uC9DC(\uD55C\uAD6D): ${todayISO()}`,
  "\uB2F5\uBCC0\uC740 \uC9C1\uC811\uC801\uC774\uACE0 \uAC04\uACB0\uD558\uAC8C \uD55C\uAD6D\uC5B4\uB85C \uC791\uC131\uD558\uC138\uC694.",
  "\uC77C\uC815 \uC870\uD68C \uC2DC \uAC74\uC218\uC640 \uD568\uAED8 \uBAA9\uB85D\uC744 \uBE84\uB81B \uD615\uD0DC\uB85C \uC791\uC131\uD558\uC138\uC694.",
].join("\n");

function enrichChatUser(tokenUser) {
  const row = findUserById(tokenUser?.sub);
  if (!row) return tokenUser;
  let allowedPages = null;
  if (row.allowed_pages) {
    try {
      const parsed = JSON.parse(String(row.allowed_pages));
      allowedPages = Array.isArray(parsed) ? parsed : null;
    } catch {
      allowedPages = null;
    }
  }
  return { ...tokenUser, allowedPages };
}

async function callOpenAiChat(messages, tools) {
  const apiKey = process.env.OPENAI_API_KEY || "";
  if (!apiKey) return null;

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages,
      tools,
      tool_choice: "auto",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI ${res.status}: ${text.slice(0, 200)}`);
  }

  return res.json();
}

function buildUserContext(user) {
  return {
    id: user?.sub,
    loginId: user?.loginId,
    name: user?.name,
    role: user?.role,
  };
}

function formatToolResultsAsAnswer(toolsUsed) {
  const lines = [];
  for (const row of toolsUsed) {
    const result = row.result;
    if (!result || result.ok === false) {
      if (result?.error) lines.push(String(result.error));
      continue;
    }
    switch (row.name) {
      case "get_client_unpaid":
        lines.push(formatUnpaidAnswer(result));
        break;
      case "get_schedule_count":
        lines.push(formatScheduleAnswer(result));
        break;
      case "lookup_contact":
        lines.push(formatContactAnswer(result));
        break;
      case "get_client_contacts":
        lines.push(formatClientContactsAnswer(result));
        break;
      case "search_client":
        if (result.clients?.length) {
          lines.push(
            result.clients
              .map((client) => `- ${client.name}${client.manager ? ` (${client.manager})` : ""}`)
              .join("\n"),
          );
        } else {
          lines.push(`"${result.query}"\uC640(\uACFC) \uC77C\uCE58\uD558\uB294 \uAC70\uB798\uCC98\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.`);
        }
        break;
      case "get_worker_info":
        lines.push(formatWorkerAnswer(result));
        break;
      default:
        break;
    }
  }
  return lines.filter(Boolean).join("\n\n").trim();
}

export async function handleErpChat({ messages, user: tokenUser }) {
  const user = enrichChatUser(tokenUser);
  const safeMessages = Array.isArray(messages)
    ? messages
      .filter((row) => row && (row.role === "user" || row.role === "assistant"))
      .slice(-20)
      .map((row) => ({
        role: row.role,
        content: String(row.content || "").slice(0, 4000),
      }))
    : [];

  const lastUser = [...safeMessages].reverse().find((row) => row.role === "user");
  const question = lastUser?.content || "";
  if (!question.trim()) {
    return { ok: false, error: "\uC9C8\uBB38\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694." };
  }

  const toolsUsed = [];
  let answer = "";
  let engine = "rules";

  if (config.openAiConfigured) {
    engine = "openai";
    const chatMessages = [{ role: "system", content: SYSTEM_PROMPT }, ...safeMessages];
    let guard = 0;

    while (guard < 6) {
      guard += 1;
      const data = await callOpenAiChat(chatMessages, ERP_CHAT_TOOL_DEFINITIONS);
      const choice = data?.choices?.[0]?.message;
      if (!choice) break;

      const toolCalls = Array.isArray(choice.tool_calls) ? choice.tool_calls : [];
      if (!toolCalls.length) {
        answer = String(choice.content || "").trim();
        break;
      }

      chatMessages.push({
        role: "assistant",
        content: choice.content || "",
        tool_calls: toolCalls,
      });

      for (const call of toolCalls) {
        const fnName = call?.function?.name;
        let args = {};
        try {
          args = JSON.parse(call?.function?.arguments || "{}");
        } catch {
          args = {};
        }
        const result = executeErpChatTool(fnName, args, user);
        toolsUsed.push({ name: fnName, args, result });
        chatMessages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result),
        });
      }
    }
  }

  if (!answer) {
    answer = tryRuleBasedChat(question, user) || "";
  }

  if (!answer && toolsUsed.length) {
    answer = formatToolResultsAsAnswer(toolsUsed);
  }

  const scheduleUsed = toolsUsed.find((row) => row.name === "get_schedule_count" && row.result?.ok);
  if (scheduleUsed) {
    answer = formatScheduleAnswer(scheduleUsed.result);
  }

  if (!answer) {
    answer = config.openAiConfigured
      ? "\uC9C8\uBB38\uC744 \uC774\uD574\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. \uBBF8\uC218, \uC77C\uC815, \uC804\uD654\uBC88\uD638, \uCC28\uB7C9\uBC88\uD638 \uC911 \uD558\uB098\uB97C \uAD6C\uCCB4\uC801\uC73C\uB85C \uC801\uC5B4 \uC8FC\uC138\uC694."
      : "\uC624\uD508AI \uC124\uC815\uC774 \uC5C6\uC5B4 \uADDC\uCE59 \uAE30\uBC18 \uB2F5\uBCC0\uB9CC \uC0AC\uC6A9 \uC911\uC785\uB2C8\uB2E4. \uC608: \uC778\uB514\uD37C \uBBF8\uC218, \uB0B4\uC77C \uC77C\uC815 \uAC74\uC218, \uAE40\uBBFC\uC131 \uCC28\uB7C9\uBC88\uD638";
  }

  const logRow = appendErpChatLog({
    userId: user?.sub,
    userName: user?.name || user?.loginId || "",
    userRole: user?.role || "",
    question,
    answer,
    toolsJson: JSON.stringify(toolsUsed),
    engine,
  });

  appendErpChatAuditLog(user, question, toolsUsed.map((row) => row.name));

  return {
    ok: true,
    answer,
    engine,
    logId: logRow?.id,
    toolsUsed: toolsUsed.map((row) => row.name),
  };
}

export function getErpChatHistory(user, limit = 30) {
  return listErpChatLogs(user?.sub, limit);
}

export function getErpChatAudit(limit = 100) {
  return listErpChatLogsAdmin(limit);
}

export function clearErpChatHistory(user) {
  clearErpChatLogsForUser(user?.sub);
  return { ok: true };
}

export function buildUserContextForClient(user) {
  return buildUserContext(user);
}
