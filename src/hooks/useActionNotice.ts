import { useCallback, useEffect, useState } from "react";
import { useActionFeedback, type ActionFeedbackTone } from "@/context/ActionFeedbackContext";

function inferNoticeTone(message: string): ActionFeedbackTone {
  const text = message.trim();
  if (!text) return "info";
  if (/??|??|????|??? ? ?|??|??/.test(text)) return "error";
  if (/???|??|??/.test(text)) return "info";
  return "success";
}

export function useActionNotice(initialMessage = "") {
  const { notify } = useActionFeedback();
  const [message, setMessage] = useState(initialMessage);

  const showNotice = useCallback(
    (nextMessage: string, tone?: ActionFeedbackTone) => {
      const trimmed = String(nextMessage || "").trim();
      setMessage(trimmed);
      if (trimmed) notify(trimmed, tone ?? inferNoticeTone(trimmed));
    },
    [notify]
  );

  const clearNotice = useCallback(() => {
    setMessage("");
  }, []);

  useEffect(() => {
    if (!message) return undefined;
    const timer = window.setTimeout(() => setMessage(""), 3200);
    return () => window.clearTimeout(timer);
  }, [message]);

  return { message, showNotice, clearNotice, setMessage: showNotice };
}

export function useSaveFeedback() {
  const { notify } = useActionFeedback();

  return useCallback(
    (message: string, tone?: ActionFeedbackTone) => {
      const trimmed = String(message || "").trim();
      if (!trimmed) return;
      notify(trimmed, tone ?? inferNoticeTone(trimmed));
    },
    [notify]
  );
}
