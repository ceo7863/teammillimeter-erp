import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Info, AlertCircle, X } from "lucide-react";

export type ActionFeedbackTone = "success" | "info" | "error";

type ActionFeedbackItem = {
  id: number;
  message: string;
  tone: ActionFeedbackTone;
};

type ActionFeedbackContextValue = {
  notify: (message: string, tone?: ActionFeedbackTone) => void;
  flashElement: (element: HTMLElement | null) => void;
};

const ActionFeedbackContext = createContext<ActionFeedbackContextValue | null>(null);

const TONE_CLASS: Record<ActionFeedbackTone, string> = {
  success: "is-success",
  info: "is-info",
  error: "is-error",
};

const TONE_ICON: Record<ActionFeedbackTone, React.ReactNode> = {
  success: <CheckCircle2 size={18} aria-hidden />,
  info: <Info size={18} aria-hidden />,
  error: <AlertCircle size={18} aria-hidden />,
};

function flashButtonElement(element: HTMLElement | null) {
  if (!element) return;
  element.classList.remove("erp-btn-applied-flash");
  void element.offsetWidth;
  element.classList.add("erp-btn-applied-flash");
  window.setTimeout(() => {
    element.classList.remove("erp-btn-applied-flash");
  }, 520);
}

export function ActionFeedbackProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ActionFeedbackItem[]>([]);
  const idRef = useRef(0);
  const timersRef = useRef<Map<number, number>>(new Map());

  const dismiss = useCallback((id: number) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const notify = useCallback(
    (message: string, tone: ActionFeedbackTone = "success") => {
      const trimmed = String(message || "").trim();
      if (!trimmed) return;
      const id = ++idRef.current;
      setItems((prev) => [...prev.slice(-2), { id, message: trimmed, tone }]);
      const timer = window.setTimeout(() => dismiss(id), 3200);
      timersRef.current.set(id, timer);
    },
    [dismiss]
  );

  const flashElement = useCallback((element: HTMLElement | null) => {
    flashButtonElement(element);
  }, []);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest("button,[data-action-feedback]") as HTMLElement | null;
      if (!button) return;
      if (button.matches(":disabled,[aria-disabled='true']")) return;
      if (button.closest("[data-no-action-feedback]")) return;

      const message = button.getAttribute("data-action-feedback");
      const shouldFlash =
        button.hasAttribute("data-action-flash") ||
        button.classList.contains("erp-action-btn") ||
        button.tagName === "BUTTON";

      if (shouldFlash) {
        flashButtonElement(button);
      }

      if (message) {
        const tone = (button.getAttribute("data-action-feedback-tone") as ActionFeedbackTone) || "success";
        window.setTimeout(() => notify(message, tone), 0);
      }
    };

    document.addEventListener("click", handleClick, false);
    return () => document.removeEventListener("click", handleClick, false);
  }, [notify]);

  useEffect(() => {
    return () => {
      timersRef.current.forEach((timer) => window.clearTimeout(timer));
      timersRef.current.clear();
    };
  }, []);

  const value = useMemo(() => ({ notify, flashElement }), [notify, flashElement]);

  return (
    <ActionFeedbackContext.Provider value={value}>
      {children}
      <div className="erp-action-feedback-stack" aria-live="polite" aria-relevant="additions">
        {items.map((item) => (
          <div key={item.id} className={`erp-action-feedback-toast ${TONE_CLASS[item.tone]}`} role="status">
            <span className="erp-action-feedback-toast-icon">{TONE_ICON[item.tone]}</span>
            <span className="erp-action-feedback-toast-message">{item.message}</span>
            <button
              type="button"
              className="erp-action-feedback-toast-close"
              aria-label="??"
              onClick={() => dismiss(item.id)}
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ActionFeedbackContext.Provider>
  );
}

export function useActionFeedback() {
  const context = useContext(ActionFeedbackContext);
  if (!context) {
    throw new Error("useActionFeedback must be used within ActionFeedbackProvider");
  }
  return context;
}
