import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bot, Loader2, MessageCircle, Mic, MicOff, Send, Trash2, Volume2, VolumeX, X } from "lucide-react";
import type { ErpUser } from "@/utils/erpApi";
import {
  clearErpChatHistoryApi,
  fetchErpChatHistory,
  sendErpChatMessage,
  type ErpChatAction,
  type ErpChatMessage,
} from "@/utils/erpChatApi";
import { ERP_CHAT_LABELS } from "@/utils/erpChatLabels";
import { useErpChatVoice } from "@/utils/useErpChatVoice";

const STORAGE_KEY = "teammillimeter-erp-chat-session";

type ErpChatWidgetProps = {
  currentUser: ErpUser | null;
  enabled?: boolean;
  onAction?: (action: ErpChatAction) => void;
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

export function ErpChatWidget({ currentUser, enabled = true, onAction }: ErpChatWidgetProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ErpChatMessage[]>(() => loadSessionMessages());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const sendMessageRef = useRef<(text: string) => Promise<void>>(async () => {});

  const {
    speechSupported,
    ttsSupported,
    listening,
    interimText,
    speaking,
    autoSpeak,
    voiceError,
    toggleListening,
    speak,
    stopSpeaking,
    toggleAutoSpeak,
    stopListening,
  } = useErpChatVoice({
    onFinalTranscript: (text) => {
      void sendMessageRef.current(text);
    },
  });

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

      stopListening();
      setError("");
      setLoading(true);
      const nextMessages: ErpChatMessage[] = [...messages, { role: "user", content }];
      setMessages(nextMessages);
      setDraft("");

      try {
        const result = await sendErpChatMessage(nextMessages);
        if (!result.ok || !result.answer) {
          throw new Error(result.error || ERP_CHAT_LABELS.loadFailed);
        }
        const answer = result.answer || "";
        setMessages((prev) => [...prev, { role: "assistant", content: answer }]);
        if (result.actions?.length) {
          for (const action of result.actions) {
            onAction?.(action);
          }
        }
        if (autoSpeak && ttsSupported) {
          speak(answer);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : ERP_CHAT_LABELS.networkFailed;
        setError(message);
        setMessages((prev) => prev.slice(0, -1));
      } finally {
        setLoading(false);
      }
    },
    [autoSpeak, canUse, loading, messages, onAction, speak, stopListening, ttsSupported],
  );

  sendMessageRef.current = sendMessage;

  const handleClear = useCallback(async () => {
    stopListening();
    stopSpeaking();
    setMessages([]);
    setError("");
    saveSessionMessages([]);
    try {
      await clearErpChatHistoryApi();
    } catch {
      // ignore
    }
  }, [stopListening, stopSpeaking]);

  const subtitle = useMemo(() => {
    if (!currentUser) return "";
    return currentUser.role === "admin" ? ERP_CHAT_LABELS.admin : currentUser.name || currentUser.loginId;
  }, [currentUser]);

  const inputValue = listening ? interimText || draft : draft;
  const displayError = error || voiceError;

  if (!canUse) return null;

  return (
    <>
      {!open ? (
        <button
          type="button"
          className="erp-chat-fab"
          onClick={() => setOpen(true)}
          aria-label={ERP_CHAT_LABELS.open}
        >
          <MessageCircle size={22} />
          <span>AI</span>
        </button>
      ) : null}

      {open ? (
        <div className="erp-chat-panel" role="dialog" aria-modal="true" aria-label={ERP_CHAT_LABELS.title}>
          <div className="erp-chat-panel__head">
            <div className="erp-chat-panel__title">
              <Bot size={18} />
              <div>
                <div className="font-bold">{ERP_CHAT_LABELS.title}</div>
                <div className="text-xs text-slate-500">{subtitle}</div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {ttsSupported ? (
                <button
                  type="button"
                  className={`erp-chat-icon-btn ${autoSpeak ? "erp-chat-icon-btn--active" : ""}`}
                  onClick={toggleAutoSpeak}
                  title={ERP_CHAT_LABELS.autoSpeak}
                  aria-pressed={autoSpeak}
                >
                  {autoSpeak ? <Volume2 size={16} /> : <VolumeX size={16} />}
                </button>
              ) : null}
              <button
                type="button"
                className="erp-chat-icon-btn"
                onClick={() => void handleClear()}
                title={ERP_CHAT_LABELS.clear}
              >
                <Trash2 size={16} />
              </button>
              <button
                type="button"
                className="erp-chat-icon-btn"
                onClick={() => {
                  stopListening();
                  stopSpeaking();
                  setOpen(false);
                }}
                aria-label={ERP_CHAT_LABELS.close}
              >
                <X size={18} />
              </button>
            </div>
          </div>

          <div className="erp-chat-panel__body" ref={scrollRef}>
            {!messages.length ? (
              <div className="erp-chat-empty">
                <p className="text-sm text-slate-600">{ERP_CHAT_LABELS.intro}</p>
                <div className="erp-chat-suggestions">
                  {ERP_CHAT_LABELS.suggestions.map((item) => (
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
                  {message.role === "assistant" && ttsSupported ? (
                    <button
                      type="button"
                      className="erp-chat-speak-btn"
                      onClick={() => {
                        if (speaking) stopSpeaking();
                        else speak(message.content);
                      }}
                      title={speaking ? ERP_CHAT_LABELS.stopSpeak : ERP_CHAT_LABELS.speak}
                      aria-label={speaking ? ERP_CHAT_LABELS.stopSpeak : ERP_CHAT_LABELS.speak}
                    >
                      {speaking ? <VolumeX size={14} /> : <Volume2 size={14} />}
                    </button>
                  ) : null}
                </div>
              ))
            )}
            {loading ? (
              <div className="erp-chat-bubble erp-chat-bubble--assistant">
                <Loader2 size={16} className="animate-spin text-slate-500" />
              </div>
            ) : null}
          </div>

          {displayError ? <div className="erp-chat-error">{displayError}</div> : null}
          {listening ? <div className="erp-chat-listening">{ERP_CHAT_LABELS.listening}</div> : null}

          <form
            className="erp-chat-panel__foot"
            onSubmit={(event) => {
              event.preventDefault();
              void sendMessage(draft);
            }}
          >
            {speechSupported ? (
              <button
                type="button"
                className={`erp-chat-voice-btn ${listening ? "erp-chat-voice-btn--active" : ""}`}
                onClick={toggleListening}
                disabled={loading}
                title={listening ? ERP_CHAT_LABELS.voiceStop : ERP_CHAT_LABELS.voiceStart}
                aria-label={listening ? ERP_CHAT_LABELS.voiceStop : ERP_CHAT_LABELS.voiceStart}
                aria-pressed={listening}
              >
                {listening ? <MicOff size={16} /> : <Mic size={16} />}
              </button>
            ) : null}
            <input
              type="text"
              className="erp-chat-input"
              value={inputValue}
              onChange={(event) => {
                stopSpeaking();
                setDraft(event.target.value);
              }}
              placeholder={ERP_CHAT_LABELS.placeholder}
              disabled={loading || listening}
            />
            <button
              type="submit"
              className="erp-chat-send"
              disabled={loading || !inputValue.trim() || listening}
              aria-label={ERP_CHAT_LABELS.send}
            >
              <Send size={16} />
            </button>
          </form>
        </div>
      ) : null}
    </>
  );
}
