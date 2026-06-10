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

function normalizeVoiceText(text: string) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function mergeVoiceFinal(current: string, incoming: string) {
  const next = normalizeVoiceText(incoming);
  if (!next) return current;
  const prev = normalizeVoiceText(current);
  if (!prev) return next;
  if (prev === next || prev.endsWith(next)) return prev;
  if (next.startsWith(prev)) return next;
  if (prev.startsWith(next)) return prev;
  return `${prev} ${next}`.trim();
}

export function useErpChatVoice(options?: {
  onFinalTranscript?: (text: string) => void;
}) {
  const onFinalRef = useRef(options?.onFinalTranscript);
  onFinalRef.current = options?.onFinalTranscript;

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const voiceCaptureOpenRef = useRef(false);
  const pendingSendRef = useRef(false);
  const accumulatedRef = useRef("");
  const interimRef = useRef("");
  const [listening, setListening] = useState(false);
  const [voiceCapturing, setVoiceCapturing] = useState(false);
  const [interimText, setInterimText] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(() => readAutoSpeakPreference());
  const [voiceError, setVoiceError] = useState("");

  const speechSupported = isSpeechRecognitionSupported();
  const ttsSupported = isSpeechSynthesisSupported();

  const updatePreview = useCallback((text: string) => {
    const preview = normalizeVoiceText(text);
    interimRef.current = preview;
    setInterimText(preview);
  }, []);

  const resetVoiceCapture = useCallback(() => {
    voiceCaptureOpenRef.current = false;
    pendingSendRef.current = false;
    accumulatedRef.current = "";
    interimRef.current = "";
    setVoiceCapturing(false);
    setInterimText("");
    setListening(false);
  }, []);

  const deliverVoiceText = useCallback(
    (raw: string) => {
      const text = normalizeVoiceText(raw);
      resetVoiceCapture();
      if (text) onFinalRef.current?.(text);
    },
    [resetVoiceCapture],
  );

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
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
      const content = normalizeVoiceText(text);
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

  const applyRecognitionResults = useCallback(
    (event: SpeechRecognitionEventLike) => {
      let interim = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const chunk = String(result?.[0]?.transcript || "");
        if (!chunk) continue;
        if (result?.isFinal) {
          accumulatedRef.current = mergeVoiceFinal(accumulatedRef.current, chunk);
        } else {
          interim = chunk;
        }
      }
      updatePreview(interim ? mergeVoiceFinal(accumulatedRef.current, interim) : accumulatedRef.current);
    },
    [updatePreview],
  );

  const finishVoiceCapture = useCallback(
    (send: boolean) => {
      pendingSendRef.current = send;
      const recognition = recognitionRef.current;
      if (recognition && listening) {
        try {
          recognition.stop();
        } catch {
          deliverVoiceText(send ? interimRef.current || accumulatedRef.current : "");
        }
        return;
      }

      if (send) deliverVoiceText(interimRef.current || accumulatedRef.current);
      else resetVoiceCapture();
    },
    [deliverVoiceText, listening, resetVoiceCapture],
  );

  const startRecognitionPass = useCallback(() => {
    setVoiceError("");
    if (!speechSupported || typeof window === "undefined") {
      setVoiceError(ERP_CHAT_LABELS.voiceUnsupported);
      return;
    }

    stopSpeaking();
    recognitionRef.current?.abort();
    recognitionRef.current = null;

    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) {
      setVoiceError(ERP_CHAT_LABELS.voiceUnsupported);
      return;
    }

    const recognition = new Ctor();
    recognition.lang = "ko-KR";
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      applyRecognitionResults(event);
    };

    recognition.onerror = (event) => {
      if (event.error === "not-allowed") {
        setVoiceError(ERP_CHAT_LABELS.micDenied);
        resetVoiceCapture();
      } else if (event.error === "aborted") {
        if (!pendingSendRef.current) resetVoiceCapture();
      } else if (event.error !== "no-speech") {
        setVoiceError(ERP_CHAT_LABELS.voiceUnsupported);
      }
      recognitionRef.current = null;
      setListening(false);
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      setListening(false);

      if (pendingSendRef.current) {
        pendingSendRef.current = false;
        deliverVoiceText(interimRef.current || accumulatedRef.current);
        return;
      }

      updatePreview(accumulatedRef.current);
    };

    recognitionRef.current = recognition;
    setListening(true);
    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setListening(false);
      setVoiceError(ERP_CHAT_LABELS.voiceUnsupported);
    }
  }, [applyRecognitionResults, deliverVoiceText, resetVoiceCapture, speechSupported, stopSpeaking, updatePreview]);

  const stopListening = useCallback(() => {
    pendingSendRef.current = false;
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    resetVoiceCapture();
  }, [resetVoiceCapture]);

  const toggleVoiceCapture = useCallback(() => {
    if (!voiceCaptureOpenRef.current) {
      voiceCaptureOpenRef.current = true;
      setVoiceCapturing(true);
      accumulatedRef.current = "";
      interimRef.current = "";
      setInterimText("");
      startRecognitionPass();
      return;
    }

    finishVoiceCapture(true);
  }, [finishVoiceCapture, startRecognitionPass]);

  const beginPushToTalk = toggleVoiceCapture;
  const endPushToTalk = useCallback(() => {
    finishVoiceCapture(true);
  }, [finishVoiceCapture]);

  const startListening = useCallback(() => {
    if (!voiceCaptureOpenRef.current) {
      voiceCaptureOpenRef.current = true;
      setVoiceCapturing(true);
      accumulatedRef.current = "";
      interimRef.current = "";
      setInterimText("");
    }
    startRecognitionPass();
  }, [startRecognitionPass]);

  const toggleListening = useCallback(() => {
    if (listening || voiceCaptureOpenRef.current) finishVoiceCapture(true);
    else startListening();
  }, [finishVoiceCapture, listening, startListening]);

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
    voiceCapturing,
    interimText,
    speaking,
    autoSpeak,
    voiceError,
    setVoiceError,
    startListening,
    stopListening,
    beginPushToTalk,
    endPushToTalk,
    toggleVoiceCapture,
    toggleListening,
    speak,
    stopSpeaking,
    toggleAutoSpeak,
  };
}
