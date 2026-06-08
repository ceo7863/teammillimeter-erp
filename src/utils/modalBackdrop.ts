import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  useEffect,
  type PointerEvent,
} from "react";

function armSuppressUntil(ref: { current: number }, delayMs: number) {
  ref.current = performance.now() + delayMs;
}

export function useModalDismissGuard(active: boolean, delayMs = 900) {
  const suppressUntilRef = useRef(0);
  const wasActiveRef = useRef(false);

  if (active && !wasActiveRef.current) {
    armSuppressUntil(suppressUntilRef, delayMs);
  }
  wasActiveRef.current = active;

  useLayoutEffect(() => {
    if (!active) return;
    armSuppressUntil(suppressUntilRef, delayMs);
  }, [active, delayMs]);

  const guardedClose = useCallback(
    (onClose: () => void) => {
      if (performance.now() < suppressUntilRef.current) return;
      onClose();
    },
    [],
  );

  const interactionsLocked = active && performance.now() < suppressUntilRef.current;

  return { guardedClose, suppressUntilRef, interactionsLocked };
}

export function useIsTouchDevice() {
  const [touch, setTouch] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => {
      const coarse = window.matchMedia("(pointer: coarse)").matches;
      const touchPoints = navigator.maxTouchPoints > 0;
      setTouch(coarse || touchPoints);
    };
    update();
    window.matchMedia("(pointer: coarse)").addEventListener("change", update);
    return () => window.matchMedia("(pointer: coarse)").removeEventListener("change", update);
  }, []);

  return touch;
}

/** Dismiss backdrop only on desktop; touch devices use the close button. */
export function useBackdropPointerDismiss(active: boolean, onClose: () => void, delayMs = 900) {
  const suppressUntilRef = useRef(0);
  const wasActiveRef = useRef(false);
  const pointerDownOnBackdropRef = useRef(false);
  const isTouchDevice = useIsTouchDevice();

  if (active && !wasActiveRef.current) {
    armSuppressUntil(suppressUntilRef, delayMs);
  }
  wasActiveRef.current = active;

  useLayoutEffect(() => {
    if (!active) return;
    armSuppressUntil(suppressUntilRef, delayMs);
  }, [active, delayMs]);

  const onPointerDown = useCallback((event: PointerEvent) => {
    pointerDownOnBackdropRef.current = event.target === event.currentTarget;
  }, []);

  const onPointerUp = useCallback(
    (event: PointerEvent) => {
      if (isTouchDevice) return;
      if (!pointerDownOnBackdropRef.current) return;
      pointerDownOnBackdropRef.current = false;
      if (event.target !== event.currentTarget) return;
      if (performance.now() < suppressUntilRef.current) return;
      onClose();
    },
    [isTouchDevice, onClose],
  );

  return { onPointerDown, onPointerUp, isTouchDevice };
}

export function deferAfterTouch(handler: () => void, delayMs = 80) {
  window.setTimeout(handler, delayMs);
}

export function openCalendarForClient(
  setCalendarModalClient: (value: { clientId: number | string; clientName: string }) => void,
  clientId: number | string,
  clientName: string,
) {
  deferAfterTouch(() => setCalendarModalClient({ clientId, clientName }), 80);
}
