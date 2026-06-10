import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bot, Loader2, MessageCircle, Send, Trash2, X } from "lucide-react";
import type { ErpUser } from "@/utils/erpApi";
import {
  clearErpChatHistoryApi,
  fetchErpChatHistory,
  sendErpChatMessage,
  type ErpChatMessage,
} from "@/utils/erpChatApi";

const STORAGE_KEY = "teammillimeter-erp-chat-session";

const SUGGESTIONS = [
  "\uC778\uB514\uD37C\uC758 \uD604\uC7AC \uBBF8\uC218\uB97C \uC54C\uB824\uC918",
  "\uB0B4\uC77C \uC77C\uC815 \uBA87 \uAC74\uC774\uC57C?",
  "\uAC70\uB798\uCC98 \uB2F4\uB2F9\uC790 \uC804\uD654\uBC88\uD638 \uC870\uD68C",
];

type ErpChatWidgetProps = {
  currentUser: ErpUser | null;
  enabled?: boolean;
};

function loadSessionMessages(): ErpChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((row) => row?.role && row?.content) : [];
  } catch {
    return [];
  }
}

function saveSessionMessages(messages: ErpChatMessage[]) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-40)));
}

export function ErpChatWidget({ currentUser, enabled = true }: ErpChatWidgetProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ErpChatMessage[]>(() => loadSessionMessages());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    saveSessionMessages(messages);
  }, [messages]);

  useEffect(() => {
    if (!open || !currentUser) return;
    void fetchErpChatHistory(20)
      .then((result) => {
        if (messages.length) return;
        const restored: ErpChatMessage[] = [];
        for (const log of result.logs || []) {
          restored.push({ role: "user", content: log.question });
          restored.push({ role: "assistant", content: log.answer });
        }
        if (restored.length) setMessages(restored.slice(-20));
      })
      .catch(() => {});
  }, [open, currentUser, messages.length]);

  useEffect(() => {
    if (!open) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open, loading]);

  const canUse = Boolean(currentUser && enabled);

  const sendMessage = useCallback(
    async (text: string) => {
      const content = String(text || "").trim();
      if (!content || loading || !canUse) return;

      setError("");
      setLoading(true);
      const nextMessages: ErpChatMessage[] = [...messages, { role: "user", content }];
      setMessages(nextMessages);
      setDraft("");

      try {
        const result = await sendErpChatMessage(nextMessages);
        if (!result.ok || !result.answer) {
          throw new Error(result.error || "\uC751\uB2F5\uC744 \uAC00\uC838\uC98C \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
        }
        setMessages((prev) => [...prev, { role: "assistant", content: result.answer || "" }]);
      } catch (err) {
        const message = err instanceof Error ? err.message : "\uC804\uC1A1 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.";
        setError(message);
        setMessages((prev) => prev.slice(0, -1));
      } finally {
        setLoading(false);
      }
    },
    [canUse, loading, messages],
  );

  const handleClear = useCallback(async () => {
    setMessages([]);
    setError("");
    saveSessionMessages([]);
    try {
      await clearErpChatHistoryApi();
    } catch {
      // ignore
    }
  }, []);

  const subtitle = useMemo(() => {
    if (!currentUser) return "";
    return currentUser.role === "admin" ? "\uAD00\uB9AC\uC790" : currentUser.name || currentUser.loginId;
  }, [currentUser]);

  if (!canUse) return null;

  return (
    <>
      {!open ? (
        <button
          type="button"
          className="erp-chat-fab"
          onClick={() => setOpen(true)}
          aria-label="ERP AI \uCC57\uBD07 \uC5F4\uAE30"
        >
          <MessageCircle size={22} />
          <span>AI</span>
        </button>
      ) : null}

      {open ? (
        <div className="erp-chat-panel" role="dialog" aria-modal="true" aria-label="ERP AI \uCC57\uBD07">
          <div className="erp-chat-panel__head">
            <div className="erp-chat-panel__title">
              <Bot size={18} />
              <div>
                <div className="font-bold">ERP AI \uCC57\uBD07</div>
                <div className="text-xs text-slate-500">{subtitle}</div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" className="erp-chat-icon-btn" onClick={() => void handleClear()} title="\uB300\uD654 \uC9C0\uC6B0\uAE30">
                <Trash2 size={16} />
              </button>
              <button type="button" className="erp-chat-icon-btn" onClick={() => setOpen(false)} aria-label="\uB2EB\uAE30">
                <X size={18} />
              </button>
            </div>
          </div>

          <div className="erp-chat-panel__body" ref={scrollRef}>
            {!messages.length ? (
              <div className="erp-chat-empty">
                <p className="text-sm text-slate-600">
                  {"\uBBF8\uC218, \uC77C\uC815, \uC804\uD654\uBC88\uD638 \uB4F1\uC744 \uC790\uC5F0\uC5B4\uB85C \uBB3C\uC5B4\uBCF4\uC138\uC694."}
                </p>
                <div className="erp-chat-suggestions">
                  {SUGGESTIONS.map((item) => (
                    <button key={item} type="button" className="erp-chat-suggestion" onClick={() => void sendMessage(item)}>
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((message, index) => (
                <div
                  key={`${index}-${message.role}`}
                  className={`erp-chat-bubble ${message.role === "user" ? "erp-chat-bubble--user" : "erp-chat-bubble--assistant"}`}
                >
                  <pre className="erp-chat-bubble__text">{message.content}</pre>
                </div>
              ))
            )}
            {loading ? (
              <div className="erp-chat-bubble erp-chat-bubble--assistant">
                <Loader2 size={16} className="animate-spin text-slate-500" />
              </div>
            ) : null}
          </div>

          {error ? <div className="erp-chat-error">{error}</div> : null}

          <form
            className="erp-chat-panel__foot"
            onSubmit={(event) => {
              event.preventDefault();
              void sendMessage(draft);
            }}
          >
            <input
              type="text"
              className="erp-chat-input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="\uC9C8\uBB38\uC744 \uC785\uB825\uD558\uC138\uC694\u2026"
              disabled={loading}
            />
            <button type="submit" className="erp-chat-send" disabled={loading || !draft.trim()} aria-label="\uC804\uC1A1">
              <Send size={16} />
            </button>
          </form>
        </div>
      ) : null}
    </>
  );
}
