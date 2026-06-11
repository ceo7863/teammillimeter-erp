import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bot, Loader2, MessageCircle, Mic, Send, Trash2, Volume2, VolumeX, X } from "lucide-react";
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
const FAB_POSITION_KEY = "teammillimeter-erp-chat-fab-position";
const FAB_DRAG_THRESHOLD = 8;
const FAB_DEFAULT_SIZE = { width: 72, height: 44 };
const FAB_MARGIN = 16;

type FabPosition = {
  left: number;
  top: number;
};

function clampFabPosition(left: number, top: number, size = FAB_DEFAULT_SIZE): FabPosition {
  if (typeof window === "undefined") return { left, top };
  const maxLeft = Math.max(FAB_MARGIN, window.innerWidth - size.width - FAB_MARGIN);
  const maxTop = Math.max(FAB_MARGIN, window.innerHeight - size.height - FAB_MARGIN);
  return {
    left: Math.min(Math.max(FAB_MARGIN, left), maxLeft),
    top: Math.min(Math.max(FAB_MARGIN, top), maxTop),
  };
}

function defaultFabPosition(size = FAB_DEFAULT_SIZE): FabPosition {
  if (typeof window === "undefined") return { left: FAB_MARGIN, top: FAB_MARGIN };
  return clampFabPosition(window.innerWidth - size.width - FAB_MARGIN, window.innerHeight - size.height - FAB_MARGIN, size);
}

function loadFabPosition(): FabPosition | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(FAB_POSITION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<FabPosition>;
    if (typeof parsed.left !== "number" || typeof parsed.top !== "number") return null;
    return clampFabPosition(parsed.left, parsed.top);
  } catch {
    return null;
  }
}

function saveFabPosition(position: FabPosition) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(FAB_POSITION_KEY, JSON.stringify(position));
}

function computePanelPosition(fab: FabPosition, fabSize = FAB_DEFAULT_SIZE) {
  if (typeof window === "undefined") {
    return { left: fab.left, top: fab.top, width: 384, height: 512 };
  }
  const isMobile = window.innerWidth <= 640;
  const width = isMobile ? window.innerWidth - 16 : Math.min(384, window.innerWidth - 24);
  const height = isMobile
    ? Math.min(window.innerHeight * 0.7, window.innerHeight - 16)
    : Math.min(512, window.innerHeight - 32);
  let left = fab.left + fabSize.width - width;
  let top = fab.top - height - 12;
  if (top < FAB_MARGIN) top = fab.top + fabSize.height + 12;
  left = Math.min(Math.max(FAB_MARGIN, left), window.innerWidth - width - FAB_MARGIN);
  top = Math.min(Math.max(FAB_MARGIN, top), window.innerHeight - height - FAB_MARGIN);
  return { left, top, width, height };
}

type ErpChatWidgetProps = {
  currentUser: ErpUser | null;
  enabled?: boolean;
  standalone?: boolean;
  defaultOpen?: boolean;
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

export function ErpChatWidget({
  currentUser,
  enabled = true,
  standalone = false,
  defaultOpen = false,
  onAction,
}: ErpChatWidgetProps) {
  const [open, setOpen] = useState(defaultOpen || standalone);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ErpChatMessage[]>(() => loadSessionMessages());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fabPosition, setFabPosition] = useState<FabPosition>(() => loadFabPosition() || defaultFabPosition());
  const [fabDragging, setFabDragging] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);
  const fabDragRef = useRef({
    active: false,
    moved: false,
    startX: 0,
    startY: 0,
    originLeft: 0,
    originTop: 0,
  });
  const sendMessageRef = useRef<(text: string) => Promise<void>>(async () => {});

  const {
    speechSupported,
    ttsSupported,
    listening,
    voiceCapturing,
    interimText,
    speaking,
    autoSpeak,
    voiceError,
    speak,
    stopSpeaking,
    toggleAutoSpeak,
    stopListening,
    toggleVoiceCapture,
  } = useErpChatVoice({
    onFinalTranscript: (text) => {
      void sendMessageRef.current(text);
    },
  });

  useEffect(() => {
    if (typeof window === "undefined" || standalone) return;
    const handleResize = () => {
      setFabPosition((prev) => clampFabPosition(prev.left, prev.top));
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [standalone]);

  const handleFabPointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (standalone) return;
      event.preventDefault();
      fabRef.current?.setPointerCapture(event.pointerId);
      fabDragRef.current = {
        active: true,
        moved: false,
        startX: event.clientX,
        startY: event.clientY,
        originLeft: fabPosition.left,
        originTop: fabPosition.top,
      };
    },
    [fabPosition.left, fabPosition.top, standalone],
  );

  const handleFabPointerMove = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = fabDragRef.current;
    if (!drag.active) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && (Math.abs(dx) > FAB_DRAG_THRESHOLD || Math.abs(dy) > FAB_DRAG_THRESHOLD)) {
      drag.moved = true;
      setFabDragging(true);
    }
    if (!drag.moved) return;
    setFabPosition(clampFabPosition(drag.originLeft + dx, drag.originTop + dy));
  }, []);

  const handleFabPointerUp = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      const drag = fabDragRef.current;
      if (!drag.active) return;
      fabRef.current?.releasePointerCapture(event.pointerId);
      drag.active = false;
      setFabDragging(false);
      if (drag.moved) {
        setFabPosition((prev) => {
          const next = clampFabPosition(prev.left, prev.top);
          saveFabPosition(next);
          return next;
        });
        return;
      }
      setOpen(true);
    },
    [],
  );

  const handleFabPointerCancel = useCallback(() => {
    fabDragRef.current.active = false;
    fabDragRef.current.moved = false;
    setFabDragging(false);
  }, []);

  const panelPosition = useMemo(() => computePanelPosition(fabPosition), [fabPosition]);

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

  const inputValue = draft;
  const displayError = error || voiceError;
  const listeningPreview = voiceCapturing ? String(interimText || "").trim() : "";

  if (!canUse) return null;

  return (
    <>
      {!standalone && !open ? (
        <button
          ref={fabRef}
          type="button"
          className={`erp-chat-fab${fabDragging ? " erp-chat-fab--dragging" : ""}`}
          style={{ left: fabPosition.left, top: fabPosition.top }}
          onPointerDown={handleFabPointerDown}
          onPointerMove={handleFabPointerMove}
          onPointerUp={handleFabPointerUp}
          onPointerCancel={handleFabPointerCancel}
          aria-label={ERP_CHAT_LABELS.open}
          title={ERP_CHAT_LABELS.fabHint}
        >
          <MessageCircle size={22} />
          <span>AI</span>
        </button>
      ) : null}

      {open ? (
        <div
          className={`erp-chat-panel${standalone ? " erp-chat-panel--standalone" : ""}`}
          style={
            standalone
              ? undefined
              : {
                  left: panelPosition.left,
                  top: panelPosition.top,
                  width: panelPosition.width,
                  height: panelPosition.height,
                  right: "auto",
                  bottom: "auto",
                }
          }
          role="dialog"
          aria-modal="true"
          aria-label={ERP_CHAT_LABELS.title}
        >
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
                  title={autoSpeak ? ERP_CHAT_LABELS.autoSpeakOn : ERP_CHAT_LABELS.autoSpeakOff}
                  aria-label={autoSpeak ? ERP_CHAT_LABELS.autoSpeakOn : ERP_CHAT_LABELS.autoSpeakOff}
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
              {!standalone ? (
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
              ) : null}
            </div>
          </div>

          <div className="erp-chat-panel__body" ref={scrollRef}>
            {!messages.length ? (
              <div className="erp-chat-empty">
                <p className="text-sm text-slate-600">{ERP_CHAT_LABELS.intro}</p>
                {speechSupported ? (
                  <p className="text-xs text-slate-500">{ERP_CHAT_LABELS.voiceHoldHint}</p>
                ) : null}
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
          {voiceCapturing ? (
            <div className="erp-chat-listening">
              {listening ? ERP_CHAT_LABELS.listening : ERP_CHAT_LABELS.voiceReadyToSend}
              {listeningPreview ? <div className="erp-chat-listening__preview">{listeningPreview}</div> : null}
            </div>
          ) : null}

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
                className={`erp-chat-voice-btn ${listening || voiceCapturing ? "erp-chat-voice-btn--active" : ""}`}
                disabled={loading}
                title={voiceCapturing ? ERP_CHAT_LABELS.voiceStop : ERP_CHAT_LABELS.voiceStart}
                aria-label={voiceCapturing ? ERP_CHAT_LABELS.voiceStop : ERP_CHAT_LABELS.voiceStart}
                aria-pressed={listening || voiceCapturing}
                onClick={() => toggleVoiceCapture()}
              >
                {listening ? <Mic size={18} /> : <Mic size={16} />}
              </button>
            ) : null}
            <input
              type="text"
              className="erp-chat-input"
              value={inputValue}
              onChange={(event) => {
                stopSpeaking();
                if (listening) stopListening();
                setDraft(event.target.value);
              }}
              onFocus={() => {
                if (listening) stopListening();
              }}
              placeholder={ERP_CHAT_LABELS.placeholder}
              disabled={loading}
              enterKeyHint="send"
              autoComplete="off"
            />
            <button
              type="submit"
              className="erp-chat-send"
              disabled={loading || !inputValue.trim()}
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
