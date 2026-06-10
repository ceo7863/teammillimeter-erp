import { config } from "./config.mjs";
import { findUserById } from "./db.mjs";
import {
  ERP_CHAT_TOOL_DEFINITIONS,
  executeErpChatTool,
  toolGetWorkerInfo,
  todayISO,
  tryRuleBasedChat,
  formatUnpaidAnswer,
  formatScheduleAnswer,
  formatContactAnswer,
  formatWorkerAnswer,
  formatClientContactsAnswer,
  formatSaleVoucherAnswer,
  buildChatActionsFromSaleVoucher,
  tryRuleBasedVoucherOpen,
  formatCalendarOpenAnswer,
  buildChatActionsFromCalendarOpen,
  tryRuleBasedCalendarOpen,
  tryRuleBasedScScheduleOpen,
  formatScScheduleOpenAnswer,
  buildChatActionsFromScScheduleOpen,
  formatWorkerStatementOpenAnswer,
  buildChatActionsFromWorkerStatementOpen,
  tryRuleBasedWorkerStatementOpen,
  tryRuleBasedStatementOpen,
  tryRuleBasedDepositOpen,
  tryRuleBasedTaxInvoiceOpen,
  tryRuleBasedBankOpen,
  hasChatOpenVerb,
  formatBankOpenAnswer,
  buildChatActionsFromBankOpen,
  formatClientStatementOpenAnswer,
  buildChatActionsFromClientStatementOpen,
  formatDepositOpenAnswer,
  buildChatActionsFromDepositOpen,
  formatTaxInvoiceOpenAnswer,
  buildChatActionsFromTaxInvoiceOpen,
} from "./erpChatTools.mjs";
import {
  toolNavigateErp,
  toolListErpPages,
  tryRuleBasedNavigateOpen,
  tryRuleBasedListErpPages,
  formatListErpPagesAnswer,
  formatNavigateAnswer,
  buildChatActionsFromNavigateResult,
  NAVIGATE_ERP_TOOL_DEFINITION,
  LIST_ERP_PAGES_TOOL_DEFINITION,
} from "./erpChatNavigate.mjs";
import { appendErpChatLog, listErpChatLogs, listErpChatLogsAdmin, clearErpChatLogsForUser } from "./erpChatStore.mjs";
import { appendErpChatAuditLog } from "./erpChatAudit.mjs";

const SYSTEM_PROMPT = [
  "\uB2F9\uC2E0\uC740 TeamMillimeter ERP \uC5B4\uC2DC\uC2A4\uD134\uD2B8\uC785\uB2C8\uB2E4.",
  "\uC870\uD68C\uB098 \uD654\uBA74 \uC774\uB3D9 \uC694\uCCAD\uC5D0\uB294 \uBC18\uB4DC\uC2DC \uB3C4\uAD6C\uB97C \uD638\uCD9C\uD558\uC138\uC694. \uAE30\uC5B5\uC5D0 \uC758\uD574 \uB2F5\uD558\uC9C0 \uB9C8\uC138\uC694.",
  "\uAE08\uC561, \uAC74\uC218, \uC804\uD654\uBC88\uD638, \uCC28\uB7C9\uBC88\uD638\uB294 \uB3C4\uAD6C \uACB0\uACFC\uB97C \uAE30\uC900\uC73C\uB85C\uB9CC \uB2F5\uD558\uACE0 \uCD94\uCE21\uD558\uC9C0 \uB9C8\uC138\uC694.",
  "\uAC70\uB798\uCC98 \uB2F4\uB2F9\uC790 \uC870\uD68C\uB294 get_client_contacts, \uB2F4\uB2F9\uC790 \uC778\uC0C1 \uC870\uD68C\uB294 lookup_contact \uB3C4\uAD6C\uB97C \uC0AC\uC6A9\uD558\uC138\uC694.",
  "\uC2DC\uACF5\uC790 \uCC28\uB7C9\uBC88\uD638(\'\uCC28\uBC88\uD638\', \'\uCC28\uB7C9 \uBC88\uD638\' \uD3EC\uD568)\uB294 get_worker_info\uB97C \uC0AC\uC6A9\uD558\uC138\uC694. \uC774\uB984\uC740 \uCC28\uB7C9\uBC88\uD638 \uC55E\uB098 \uB4A4 \uC5B4\uB290 \uCABD\uC774\uB4E0 \uAD00\uACC4\uC5C6\uC2B5\uB2C8\uB2E4. name\uC5D0 \uCD94\uCD9C\uB41C \uC2DC\uACF5\uC790 \uC774\uB984\uB9CC \uC804\uB2EC\uD558\uC138\uC694.",
  "\uBE44\uC815\uD615 \uD55C\uAD6D\uC5B4, \uC624\uD0C0, \uB2E8\uC5B4 \uC21C\uC11C \uBCC0\uD658(\'\uBC15\uC900\uADDC \uCC28\uB7C9\uBC88\uD638\' / '\uCC28\uB7C9\uBC88\uD638 \uBC15\uC900\uADDC', '\uD1B5\uC7A5' / '\uACC4\uC88C')\uB97C \uC790\uC5F0\uC2A4\uB7FD\uAC8C \uC774\uD574\uD558\uC138\uC694.",
  "\uAC70\uB798\uCC98 \uC774\uB984\uC774 \uBAA8\uD638\uD558\uBA74 search_client \uD6C4 \uD655\uC778\uD558\uC138\uC694.",
  `\uC624\uB298 \uB0A0\uC9DC(\uD55C\uAD6D): ${todayISO()}`,
  "\uB2F5\uBCC0\uC740 \uC9C1\uC811\uC801\uC774\uACE0 \uAC04\uACB0\uD558\uAC8C \uD55C\uAD6D\uC5B4\uB85C \uC791\uC131\uD558\uC138\uC694.",
  "\uC804\uD45C \uC5F4\uAE30 \uC694\uCCAD\uC740 find_sale_voucher \uB3C4\uAD6C\uB97C \uC0AC\uC6A9\uD558\uC138\uC694.",
  "\uAC70\uB798\uCC98 \uCE98\uB9B0\uB354/\uB2EC\uB825 \uC5F4\uAE30(\uC608: \uC778\uB514\uD37C \uCE98\uB9B0\uB354 \uC5F4\uC5B4\uC918, \uB2EC\uB825 \uC5F4\uC5B4)\uC740 open_client_calendar \uB3C4\uAD6C\uB97C \uC0AC\uC6A9\uD558\uC138\uC694.",
  "SC \uC2A4\uCF00\uC904/\uC77C\uC815 \uC5F4\uAE30: \uAC70\uB798\uCC98 \uC774\uB984 \uC788\uC73C\uBA74 open_client_site_request_calendar(\uC608: \uC778\uB514\uD37C \uC2A4\uCF00\uC904 \uC5F4\uC5B4 \u2192 \uC5C5\uCCB4\uBCC4 \uCE98\uB9B0\uB354), \uAC70\uB798\uCC98 \uC5C6\uC774 \uC804\uCCB4 SC \uC774\uBA74 open_sc_schedule. '\uC77C\uC815' \uC870\uD68C \uC804\uC6A9 \uC694\uCCAD(\uC5F4\uAE30 \uC544\uB2D8)\uC740 get_schedule_count.",
  "\uC2DC\uACF5\uC790 \uC2DC\uACF5\uBE44\uB0B4\uC5ED\uC11C/\uC2DC\uACF5\uB0B4\uC5ED\uC11C \uC5F4\uAE30(\uC608: \uAE40\uBBFC\uC131 5\uC6D4 \uC2DC\uACF5\uB0B4\uC5ED\uC11C \uC5F4\uC5B4\uC918, \uAE40\uBBFC\uC131 \uC774\uBC88\uB2EC \uC2DC\uACF5\uBE44\uB0B4\uC5ED\uC11C)\uC740 open_worker_construction_cost_statement \uB3C4\uAD6C\uB97C \uC0AC\uC6A9\uD558\uC138\uC694. \uC6D4 \uC9C0\uC815 \uC5C6\uC73C\uBA74 \uC774\uBC88 \uB2EC, \uB144\uB3C4 \uC5C6\uC73C\uBA74 \uC62C\uD574\uB97C \uAE30\uBCF8\uC73C\uB85C \uC0AC\uC6A9\uD558\uC138\uC694.",
  "\uAC70\uB798\uCC98 \uC2DC\uACF5\uBE44\uB0B4\uC5ED\uC11C \uC0DD\uC131 \uBC0F \uC5F4\uAE30(\uC608: \uC778\uB514\uD37C \uC774\uBC88\uB2EC \uC2DC\uACF5\uBE44\uB0B4\uC5ED\uC11C)\uC740 open_client_construction_cost_statement \uB3C4\uAD6C\uB97C \uC0AC\uC6A9\uD558\uC138\uC694.",
  "\uAC70\uB798\uCC98 \uC785\uAE08\uB0B4\uC5ED \uC5F4\uAE30(\uC608: \uC778\uB514\uD37C \uC785\uAE08\uB0B4\uC5ED \uC5F4\uC5B4\uC918, \uC778\uB514\uD37C 5\uC6D4 \uC785\uAE08\uB0B4\uC5ED, \uC778\uB514\uD37C \uBAA8\uB4E0 \uC785\uAE08\uB0B4\uC5ED)\uC740 open_client_deposit_history \uB3C4\uAD6C\uB97C \uC0AC\uC6A9\uD558\uC138\uC694. '\uC5F4\uC5B4\uC918' \uC5C6\uC774 \uC785\uAE08\uB0B4\uC5ED\uB9CC \uC801\uC5B4\uB3C4 \uD655\uC778 \uC694\uCCAD\uC785\uB2C8\uB2E4. 5\uC6D4 \uB4F1 \uAE30\uAC04\uC740 period/startDate/endDate\uB85C \uC804\uB2EC\uD558\uC138\uC694. '\uBAA8\uB4E0', '\uC804\uCCB4'\uC740 allHistory=true.",
  "\uD1B5\uC7A5/\uACC4\uC88C \uC5F4\uAE30(\uC608: 5\uC6D4 \uD1B5\uC7A5 \uC5F4\uC5B4, 5\uC6D4\uB2EC \uD1B5\uC7A5 \uC5F4\uC5B4\uC918)\uC740 navigate_erp target=accounting_bank \uC640 \uAE30\uAC04\uC744 \uC801\uC6A9\uD558\uC138\uC694.",
  "\uAC70\uB798\uCC98 \uC138\uAE08\uACC4\uC0B0\uC11C \uB0B4\uC5ED \uC5F4\uAE30(\uC608: \uC778\uB514\uD37C \uC138\uAE08\uACC4\uC0B0\uC11C \uB0B4\uC5ED \uC5F4\uC5B4\uC918)\uC740 open_client_tax_invoice_history \uB3C4\uAD6C\uB97C \uC0AC\uC6A9\uD558\uC138\uC694.",
  "ERP \uBA54\uB274/\uD654\uBA74 \uC774\uB3D9(\uB300\uC2DC\uBCF4\uB4DC, \uD86D\uAE08, \uD1B5\uC7A5, \uBD84\uC11D, \uADFC\uD009 \uB4F1)\uC740 navigate_erp \uB3C4\uAD6C\uB97C \uC0AC\uC6A9\uD558\uC138\uC694. \uD654\uBA74 \uBAA9\uB85D\uC740 list_erp_pages.",
  "\uC77C\uC815 \uC870\uD68C \uC2DC \uAC70\uC218\uC640 \uD568\uAED8 \uBAA9\uB85D\uC744 \uBE84\uB81B \uD615\uD0DC\uB85C \uC791\uC131\uD558\uC138\uC694. \uAC70\uB798\uCC98+\uAE30\uAC04 \uC9C8\uBB38(\uC608: \uD0A4\uCE9C\uC81C\uB2C8\uC2A4 \uC774\uBC88\uC8FC \uC77C\uC815)\uC740 clientName\uACFC \uC774\uBC88\uC8FC\uB97C \uC9C0\uC815\uD558\uC138\uC694.",
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

function isOpenAiRecoverableError(error) {
  const msg = String(error?.message || error || "");
  return (
    /OpenAI (429|500|502|503|504|529)\b/.test(msg) ||
    /exceeded your current quota|insufficient_quota|billing details/i.test(msg) ||
    /server had an error processing your request|temporarily unavailable|overloaded|internal server error/i.test(
      msg,
    )
  );
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
      case "find_sale_voucher":
        lines.push(formatSaleVoucherAnswer(result));
        break;
      case "open_client_calendar":
        lines.push(formatCalendarOpenAnswer(result));
        break;
      case "open_sc_schedule":
        lines.push(formatScScheduleOpenAnswer(result));
        break;
      case "open_client_site_request_calendar":
        lines.push(formatScScheduleOpenAnswer(result));
        break;
      case "open_worker_construction_cost_statement":
        lines.push(formatWorkerStatementOpenAnswer(result));
        break;
      case "open_client_construction_cost_statement":
        lines.push(formatClientStatementOpenAnswer(result));
        break;
      case "open_client_deposit_history":
        lines.push(formatDepositOpenAnswer(result));
        break;
      case "open_client_tax_invoice_history":
        lines.push(formatTaxInvoiceOpenAnswer(result));
        break;
      case "navigate_erp":
        lines.push(formatNavigateAnswer(result));
        break;
      case "list_erp_pages":
        lines.push(formatListErpPagesAnswer(result));
        break;
      default:
        break;
    }
  }
  return lines.filter(Boolean).join("\n\n").trim();
}

const ERP_CHAT_ALL_TOOL_DEFINITIONS = [
  ...ERP_CHAT_TOOL_DEFINITIONS,
  NAVIGATE_ERP_TOOL_DEFINITION,
  LIST_ERP_PAGES_TOOL_DEFINITION,
];

function executeChatTool(fnName, args, user, question) {
  if (fnName === "navigate_erp") {
    return toolNavigateErp({ ...(args || {}), message: question });
  }
  if (fnName === "list_erp_pages") {
    return toolListErpPages();
  }
  if (fnName === "get_worker_info") {
    return toolGetWorkerInfo({ name: args?.name || question, rawQuery: question }, user);
  }
  return executeErpChatTool(fnName, args, user, question);
}

function tryRuleBasedOpenFromQuestion(question) {
  const voucherOpenResult = tryRuleBasedVoucherOpen(question);
  if (voucherOpenResult) {
    return {
      answer: formatSaleVoucherAnswer(voucherOpenResult),
      chatActions: buildChatActionsFromSaleVoucher(voucherOpenResult),
    };
  }

  const calendarOpenResult = tryRuleBasedCalendarOpen(question);
  if (calendarOpenResult) {
    return {
      answer: formatCalendarOpenAnswer(calendarOpenResult),
      chatActions: buildChatActionsFromCalendarOpen(calendarOpenResult),
    };
  }

  const scScheduleOpenResult = tryRuleBasedScScheduleOpen(question);
  if (scScheduleOpenResult) {
    return {
      answer: formatScScheduleOpenAnswer(scScheduleOpenResult),
      chatActions: buildChatActionsFromScScheduleOpen(scScheduleOpenResult),
    };
  }

  const depositOpenResult = tryRuleBasedDepositOpen(question);
  if (depositOpenResult) {
    return {
      answer: formatDepositOpenAnswer(depositOpenResult),
      chatActions: buildChatActionsFromDepositOpen(depositOpenResult),
    };
  }

  const taxOpenResult = tryRuleBasedTaxInvoiceOpen(question);
  if (taxOpenResult) {
    return {
      answer: formatTaxInvoiceOpenAnswer(taxOpenResult),
      chatActions: buildChatActionsFromTaxInvoiceOpen(taxOpenResult),
    };
  }

  const statementOpenResult = tryRuleBasedStatementOpen(question);
  if (statementOpenResult) {
    if (statementOpenResult.clientName) {
      return {
        answer: formatClientStatementOpenAnswer(statementOpenResult),
        chatActions: buildChatActionsFromClientStatementOpen(statementOpenResult),
      };
    }
    return {
      answer: formatWorkerStatementOpenAnswer(statementOpenResult),
      chatActions: buildChatActionsFromWorkerStatementOpen(statementOpenResult),
    };
  }

  const bankOpenResult = tryRuleBasedBankOpen(question);
  if (bankOpenResult) {
    return {
      answer: formatBankOpenAnswer(bankOpenResult),
      chatActions: buildChatActionsFromBankOpen(bankOpenResult),
    };
  }

  const navigateOpenResult = tryRuleBasedNavigateOpen(question);
  if (navigateOpenResult) {
    return {
      answer: formatNavigateAnswer(navigateOpenResult),
      chatActions: buildChatActionsFromNavigateResult(navigateOpenResult),
    };
  }

  return null;
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
  let chatActions = [];
  let engine = "rules";

  if (config.openAiConfigured) {
    engine = "openai";
    const chatMessages = [{ role: "system", content: SYSTEM_PROMPT }, ...safeMessages];
    let guard = 0;

    try {
      while (guard < 6) {
        guard += 1;
        const data = await callOpenAiChat(chatMessages, ERP_CHAT_ALL_TOOL_DEFINITIONS);
        const choice = data?.choices?.[0]?.message;
        if (!choice) break;

        const toolCalls = Array.isArray(choice.tool_calls) ? choice.tool_calls : [];
        if (!toolCalls.length) {
          const ruleOpen = tryRuleBasedOpenFromQuestion(question);
          if (ruleOpen) {
            answer = ruleOpen.answer;
            chatActions = ruleOpen.chatActions;
            break;
          }
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
          const result = executeChatTool(fnName, args, user, question);
          toolsUsed.push({ name: fnName, args, result });
          chatMessages.push({
            role: "tool",
            tool_call_id: call.id,
            content: JSON.stringify(result),
          });
        }
      }
    } catch (error) {
      if (!isOpenAiRecoverableError(error)) throw error;
      engine = "rules";
      answer = "";
    }
  }

  if (!answer) {
    const listPagesResult = tryRuleBasedListErpPages(question);
    if (listPagesResult) {
      answer = formatListErpPagesAnswer(listPagesResult);
    } else {
      const openResult = tryRuleBasedOpenFromQuestion(question);
      if (openResult) {
        answer = openResult.answer;
        chatActions = openResult.chatActions;
      } else {
        answer = tryRuleBasedChat(question, user) || "";
      }
    }
  }

  if (!answer && toolsUsed.length) {
    answer = formatToolResultsAsAnswer(toolsUsed);
  }

  const scheduleUsed = toolsUsed.find((row) => row.name === "get_schedule_count" && row.result?.ok);
  if (scheduleUsed) {
    answer = formatScheduleAnswer(scheduleUsed.result);
  }

  const saleVoucherUsed = toolsUsed.find((row) => row.name === "find_sale_voucher" && row.result?.ok);
  if (saleVoucherUsed) {
    answer = formatSaleVoucherAnswer(saleVoucherUsed.result);
    chatActions = buildChatActionsFromSaleVoucher(saleVoucherUsed.result);
  }

  const calendarUsed = toolsUsed.find((row) => row.name === "open_client_calendar" && row.result?.ok);
  if (calendarUsed) {
    answer = formatCalendarOpenAnswer(calendarUsed.result);
    chatActions = buildChatActionsFromCalendarOpen(calendarUsed.result);
  }

  const scScheduleUsed = toolsUsed.find((row) => row.name === "open_sc_schedule" && row.result?.ok);
  if (scScheduleUsed) {
    answer = formatScScheduleOpenAnswer(scScheduleUsed.result);
    chatActions = buildChatActionsFromScScheduleOpen(scScheduleUsed.result);
  }

  const clientSiteCalendarUsed = toolsUsed.find(
    (row) => row.name === "open_client_site_request_calendar" && row.result?.ok,
  );
  if (clientSiteCalendarUsed) {
    answer = formatScScheduleOpenAnswer(clientSiteCalendarUsed.result);
    chatActions = buildChatActionsFromScScheduleOpen(clientSiteCalendarUsed.result);
  }

  const workerStatementUsed = toolsUsed.find(
    (row) => row.name === "open_worker_construction_cost_statement" && row.result?.ok,
  );
  if (workerStatementUsed) {
    answer = formatWorkerStatementOpenAnswer(workerStatementUsed.result);
    chatActions = buildChatActionsFromWorkerStatementOpen(workerStatementUsed.result);
  }

  const clientStatementUsed = toolsUsed.find(
    (row) => row.name === "open_client_construction_cost_statement" && row.result?.ok,
  );
  if (clientStatementUsed) {
    answer = formatClientStatementOpenAnswer(clientStatementUsed.result);
    chatActions = buildChatActionsFromClientStatementOpen(clientStatementUsed.result);
  }

  const depositUsed = toolsUsed.find((row) => row.name === "open_client_deposit_history" && row.result?.ok);
  if (depositUsed) {
    answer = formatDepositOpenAnswer(depositUsed.result);
    chatActions = buildChatActionsFromDepositOpen(depositUsed.result);
  }

  const taxInvoiceUsed = toolsUsed.find(
    (row) => row.name === "open_client_tax_invoice_history" && row.result?.ok,
  );
  if (taxInvoiceUsed) {
    answer = formatTaxInvoiceOpenAnswer(taxInvoiceUsed.result);
    chatActions = buildChatActionsFromTaxInvoiceOpen(taxInvoiceUsed.result);
  }

  const bankOpenUsed = toolsUsed.find(
    (row) =>
      row.name === "navigate_erp" &&
      row.result?.ok &&
      (row.result?.nav?.accountingTab === "bank" || row.args?.target === "accounting_bank"),
  );
  let bankNavHandled = false;
  if (bankOpenUsed?.result?.nav?.startDate && bankOpenUsed.result.nav.endDate) {
    const { startDate, endDate } = bankOpenUsed.result.nav;
    answer = formatBankOpenAnswer({ ok: true, startDate, endDate });
    chatActions = buildChatActionsFromBankOpen({ ok: true, startDate, endDate });
    bankNavHandled = true;
  }

  const navigateUsed = toolsUsed.find((row) => row.name === "navigate_erp" && row.result?.ok);
  if (navigateUsed && !bankNavHandled) {
    answer = formatNavigateAnswer(navigateUsed.result);
    chatActions = buildChatActionsFromNavigateResult(navigateUsed.result);
  }

  const listPagesUsed = toolsUsed.find((row) => row.name === "list_erp_pages" && row.result?.ok);
  if (listPagesUsed) {
    answer = formatListErpPagesAnswer(listPagesUsed.result);
  }

  const openAiTextOnly = Boolean(answer) && toolsUsed.length === 0;

  if (chatActions.length === 0) {
    const openResult = tryRuleBasedOpenFromQuestion(question);
    if (openResult) {
      answer = openResult.answer;
      chatActions = openResult.chatActions;
    }
  }

  if ((!answer || openAiTextOnly) && !chatActions.length) {
    const infoAnswer = tryRuleBasedChat(question, user);
    if (infoAnswer) answer = infoAnswer;
  }

  if (!answer) {
    answer = config.openAiConfigured
      ? "\uC9C8\uBB38\uC744 \uC774\uD574\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. \uBBF8\uC218, \uC77C\uC815, \uC804\uD654\uBC88\uD638, \uCC28\uB7C9\uBC88\uD638 \uC911 \uD558\uB098\uB97C \uAD6C\uCCB4\uC801\uC73C\uB85C \uC801\uC5B4 \uC8FC\uC138\uC694."
      : "\uC624\uD508AI \uC124\uC815\uC774 \uC5C6\uC5B4 \uADDC\uCE59 \uAE30\uBC18 \uB2F5\uBCC0\uB9CC \uC0AC\uC6A9 \uC911\uC785\uB2C8\uB2E4. \uC608: \uC778\uB514\uD37C \uBBF8\uC218, \uB0B4\uC77C \uC77C\uC815, \"\uC5B4\uB290 \uD654\uBA74 \uC5F4 \uC218 \uC788\uC5B4?\"";
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
    actions: chatActions,
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
