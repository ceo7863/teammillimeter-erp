import { useCallback, useEffect, useRef, useState } from "react";
import { ERP_CHAT_LABELS } from "@/utils/erpChatLabels";

type SpeechRecognitionInstance = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  }
}

const AUTO_SPEAK_KEY = "teammillimeter-erp-chat-auto-speak";
const RESTART_DELAY_MS = 500;

export function isSpeechRecognitionSupported() {
  return typeof window !== "undefined" && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export function isSpeechSynthesisSupported() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function readAutoSpeakPreference() {
  if (typeof window === "undefined") return true;
  const raw = window.sessionStorage.getItem(AUTO_SPEAK_KEY);
  if (raw === "0") return false;
  if (raw === "1") return true;
  return true;
}

export function writeAutoSpeakPreference(enabled: boolean) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(AUTO_SPEAK_KEY, enabled ? "1" : "0");
}

export function useErpChatVoice(options?: {
  onFinalTranscript?: (text: string) => void;
}) {
  const onFinalRef = useRef(options?.onFinalTranscript);
  onFinalRef.current = options?.onFinalTranscript;

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const voiceSessionActiveRef = useRef(false);
  const accumulatedRef = useRef("");
  const interimRef = useRef("");
  const restartTimerRef = useRef<number | null>(null);
  const [listening, setListening] = useState(false);
  const [interimText, setInterimText] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(() => readAutoSpeakPreference());
  const [voiceError, setVoiceError] = useState("");

  const speechSupported = isSpeechRecognitionSupported();
  const ttsSupported = isSpeechSynthesisSupported();

  const clearRestartTimer = useCallback(() => {
    if (restartTimerRef.current == null) return;
    window.clearTimeout(restartTimerRef.current);
    restartTimerRef.current = null;
  }, []);

  const resetVoiceSessionState = useCallback(() => {
    voiceSessionActiveRef.current = false;
    clearRestartTimer();
    accumulatedRef.current = "";
    interimRef.current = "";
    setInterimText("");
    setListening(false);
  }, [clearRestartTimer]);

  useEffect(() => {
    return () => {
      clearRestartTimer();
      recognitionRef.current?.abort();
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, [clearRestartTimer]);

  const stopSpeaking = useCallback(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (!ttsSupported || typeof window === "undefined") return;
      const content = String(text || "").trim();
      if (!content) return;

      stopSpeaking();
      const utterance = new SpeechSynthesisUtterance(content);
      utterance.lang = "ko-KR";
      utterance.rate = 1;
      utterance.onstart = () => setSpeaking(true);
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);
      window.speechSynthesis.speak(utterance);
    },
    [stopSpeaking, ttsSupported],
  );

  const applyRecognitionResults = useCallback((event: SpeechRecognitionEventLike, appendFinals: boolean) => {
    let interim = "";
    let freshFinal = "";

    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      const chunk = String(result?.[0]?.transcript || "");
      if (!chunk) continue;
      if (result?.isFinal) freshFinal += chunk;
      else interim += chunk;
    }

    if (appendFinals && freshFinal) {
      accumulatedRef.current += freshFinal;
    }

    const preview = appendFinals ? accumulatedRef.current + interim : freshFinal || interim;
    interimRef.current = preview;
    setInterimText(preview);

    return freshFinal.trim();
  }, []);

  const attachRecognitionHandlers = useCallback(
    (recognition: SpeechRecognitionInstance, voiceSession: boolean) => {
      recognition.onresult = (event) => {
        const freshFinal = applyRecognitionResults(event, voiceSession);
        if (!voiceSession && freshFinal) {
          onFinalRef.current?.(freshFinal);
        }
      };

      recognition.onerror = (event) => {
        if (event.error === "not-allowed") {
          setVoiceError(ERP_CHAT_LABELS.micDenied);
        } else if (event.error !== "aborted" && event.error !== "no-speech") {
          setVoiceError(ERP_CHAT_LABELS.voiceUnsupported);
        }
        resetVoiceSessionState();
        recognitionRef.current = null;
      };

      recognition.onend = () => {
        if (!voiceSessionActiveRef.current || recognitionRef.current !== recognition) {
          if (!voiceSessionActiveRef.current) {
            setListening(false);
            setInterimText("");
          }
          return;
        }

        clearRestartTimer();
        restartTimerRef.current = window.setTimeout(() => {
          restartTimerRef.current = null;
          if (!voiceSessionActiveRef.current || recognitionRef.current !== recognition) return;
          try {
            recognition.start();
          } catch {
            resetVoiceSessionState();
            recognitionRef.current = null;
          }
        }, RESTART_DELAY_MS);
      };
    },
    [applyRecognitionResults, clearRestartTimer, resetVoiceSessionState],
  );

  const stopListening = useCallback(() => {
    voiceSessionActiveRef.current = false;
    clearRestartTimer();
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    accumulatedRef.current = "";
    interimRef.current = "";
    setListening(false);
    setInterimText("");
  }, [clearRestartTimer]);

  const startListening = useCallback(
    (voiceSession = false) => {
      setVoiceError("");
      if (!speechSupported || typeof window === "undefined") {
        setVoiceError(ERP_CHAT_LABELS.voiceUnsupported);
        return;
      }

      stopSpeaking();
      clearRestartTimer();
      recognitionRef.current?.abort();

      const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!Ctor) {
        setVoiceError(ERP_CHAT_LABELS.voiceUnsupported);
        return;
      }

      const recognition = new Ctor();
      recognition.lang = "ko-KR";
      recognition.continuous = voiceSession;
      recognition.interimResults = true;

      voiceSessionActiveRef.current = voiceSession;
      accumulatedRef.current = "";
      interimRef.current = "";
      attachRecognitionHandlers(recognition, voiceSession);

      recognitionRef.current = recognition;
      setListening(true);
      setInterimText("");
      try {
        recognition.start();
      } catch {
        resetVoiceSessionState();
        recognitionRef.current = null;
        setVoiceError(ERP_CHAT_LABELS.voiceUnsupported);
      }
    },
    [attachRecognitionHandlers, clearRestartTimer, resetVoiceSessionState, speechSupported, stopSpeaking],
  );

  const beginPushToTalk = useCallback(() => {
    if (listening) return;
    startListening(true);
  }, [listening, startListening]);

  const endPushToTalk = useCallback(() => {
    if (!voiceSessionActiveRef.current && !listening) return;

    voiceSessionActiveRef.current = false;
    clearRestartTimer();

    const text = String(interimRef.current || accumulatedRef.current || "").trim();
    recognitionRef.current?.abort();
    recognitionRef.current = null;

    accumulatedRef.current = "";
    interimRef.current = "";
    setListening(false);
    setInterimText("");

    if (text) onFinalRef.current?.(text);
  }, [clearRestartTimer, listening]);

  const toggleListening = useCallback(() => {
    if (listening) stopListening();
    else startListening(false);
  }, [listening, startListening, stopListening]);

  const toggleAutoSpeak = useCallback(() => {
    setAutoSpeak((prev) => {
      const next = !prev;
      writeAutoSpeakPreference(next);
      if (!next) stopSpeaking();
      return next;
    });
  }, [stopSpeaking]);

  return {
    speechSupported,
    ttsSupported,
    listening,
    interimText,
    speaking,
    autoSpeak,
    voiceError,
    setVoiceError,
    startListening,
    stopListening,
    beginPushToTalk,
    endPushToTalk,
    toggleListening,
    speak,
    stopSpeaking,
    toggleAutoSpeak,
  };
}
