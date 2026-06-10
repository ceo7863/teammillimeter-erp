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

const CHAT_LABELS = {
  title: "ERP AI ??",
  open: "ERP AI ?? ??",
  close: "??",
  clear: "?? ???",
  send: "??",
  placeholder: "??? ?????...",
  intro: "??, ??, ???? ?? ???? ?????.",
  admin: "???",
  loadFailed: "??? ??? ? ????.",
  networkFailed: "?? ??? ??????.",
  suggestions: [
    "???? ?? ??? ???",
    "?? ?? ? ????",
    "??? ??? ???? ??",
  ] as const,
};

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
          throw new Error(result.error || CHAT_LABELS.loadFailed);
        }
        setMessages((prev) => [...prev, { role: "assistant", content: result.answer || "" }]);
      } catch (err) {
        const message = err instanceof Error ? err.message : CHAT_LABELS.networkFailed;
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
    return currentUser.role === "admin" ? CHAT_LABELS.admin : currentUser.name || currentUser.loginId;
  }, [currentUser]);

  if (!canUse) return null;

  return (
    <>
      {!open ? (
        <button
          type="button"
          className="erp-chat-fab"
          onClick={() => setOpen(true)}
          aria-label={CHAT_LABELS.open}
        >
          <MessageCircle size={22} />
          <span>AI</span>
        </button>
      ) : null}

      {open ? (
        <div className="erp-chat-panel" role="dialog" aria-modal="true" aria-label={CHAT_LABELS.title}>
          <div className="erp-chat-panel__head">
            <div className="erp-chat-panel__title">
              <Bot size={18} />
              <div>
                <div className="font-bold">{CHAT_LABELS.title}</div>
                <div className="text-xs text-slate-500">{subtitle}</div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="erp-chat-icon-btn"
                onClick={() => void handleClear()}
                title={CHAT_LABELS.clear}
              >
                <Trash2 size={16} />
              </button>
              <button type="button" className="erp-chat-icon-btn" onClick={() => setOpen(false)} aria-label={CHAT_LABELS.close}>
                <X size={18} />
              </button>
            </div>
          </div>

          <div className="erp-chat-panel__body" ref={scrollRef}>
            {!messages.length ? (
              <div className="erp-chat-empty">
                <p className="text-sm text-slate-600">{CHAT_LABELS.intro}</p>
                <div className="erp-chat-suggestions">
                  {CHAT_LABELS.suggestions.map((item) => (
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
                  <div className="erp-chat-bubble__text">{message.content}</div>
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
              placeholder={CHAT_LABELS.placeholder}
              disabled={loading}
            />
            <button type="submit" className="erp-chat-send" disabled={loading || !draft.trim()} aria-label={CHAT_LABELS.send}>
              <Send size={16} />
            </button>
          </form>
        </div>
      ) : null}
    </>
  );
}
