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
  const pushToTalkActiveRef = useRef(false);
  const accumulatedRef = useRef("");
  const interimRef = useRef("");
  const [listening, setListening] = useState(false);
  const [interimText, setInterimText] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(() => readAutoSpeakPreference());
  const [voiceError, setVoiceError] = useState("");

  const speechSupported = isSpeechRecognitionSupported();
  const ttsSupported = isSpeechSynthesisSupported();

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

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

  const stopListening = useCallback(() => {
    pushToTalkActiveRef.current = false;
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  const attachRecognitionHandlers = useCallback(
    (recognition: SpeechRecognitionInstance, pushToTalk: boolean) => {
      recognition.onresult = (event) => {
        let interim = "";
        let finalText = "";
        for (let index = 0; index < event.results.length; index += 1) {
          const chunk = event.results[index]?.[0]?.transcript || "";
          if (event.results[index]?.isFinal) finalText += chunk;
          else interim += chunk;
        }

        if (pushToTalk) {
          accumulatedRef.current = finalText;
          interimRef.current = finalText + interim;
          setInterimText(interimRef.current);
          return;
        }

        setInterimText(finalText || interim);
        if (finalText.trim()) {
          onFinalRef.current?.(finalText.trim());
        }
      };

      recognition.onerror = (event) => {
        if (event.error === "not-allowed") {
          setVoiceError(ERP_CHAT_LABELS.micDenied);
        } else if (event.error !== "aborted") {
          setVoiceError(ERP_CHAT_LABELS.voiceUnsupported);
        }
        pushToTalkActiveRef.current = false;
        setListening(false);
      };

      recognition.onend = () => {
        if (pushToTalkActiveRef.current) {
          try {
            recognition.start();
          } catch {
            pushToTalkActiveRef.current = false;
            setListening(false);
            setInterimText("");
          }
          return;
        }
        setListening(false);
        setInterimText("");
      };
    },
    [],
  );

  const startListening = useCallback(
    (pushToTalk = false) => {
      setVoiceError("");
      if (!speechSupported || typeof window === "undefined") {
        setVoiceError(ERP_CHAT_LABELS.voiceUnsupported);
        return;
      }

      stopSpeaking();
      const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!Ctor) {
        setVoiceError(ERP_CHAT_LABELS.voiceUnsupported);
        return;
      }

      recognitionRef.current?.abort();
      const recognition = new Ctor();
      recognition.lang = "ko-KR";
      recognition.continuous = pushToTalk;
      recognition.interimResults = true;

      pushToTalkActiveRef.current = pushToTalk;
      accumulatedRef.current = "";
      interimRef.current = "";
      attachRecognitionHandlers(recognition, pushToTalk);

      recognitionRef.current = recognition;
      setListening(true);
      setInterimText("");
      try {
        recognition.start();
      } catch {
        pushToTalkActiveRef.current = false;
        setListening(false);
        setVoiceError(ERP_CHAT_LABELS.voiceUnsupported);
      }
    },
    [attachRecognitionHandlers, speechSupported, stopSpeaking],
  );

  const beginPushToTalk = useCallback(() => {
    if (listening) return;
    startListening(true);
  }, [listening, startListening]);

  const endPushToTalk = useCallback(() => {
    if (!pushToTalkActiveRef.current && !listening) return;
    pushToTalkActiveRef.current = false;
    const text = String(interimRef.current || accumulatedRef.current || "").trim();
    recognitionRef.current?.stop();
    setListening(false);
    setInterimText("");
    accumulatedRef.current = "";
    interimRef.current = "";
    if (text) onFinalRef.current?.(text);
  }, [listening]);

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
