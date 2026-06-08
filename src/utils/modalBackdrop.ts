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

/** Ignore backdrop dismiss briefly after open; block mobile ghost-tap close. */
export function useBackdropCloseGuard(active: boolean, delayMs = 800) {
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

  const canDismiss = useCallback(() => performance.now() >= suppressUntilRef.current, []);

  return useCallback(
    (event: PointerEvent, onClose: () => void) => {
      if (event.target !== event.currentTarget) return;
      if (!canDismiss()) return;
      onClose();
    },
    [canDismiss],
  );
}

/** Dismiss only when pointer down+up both start on backdrop (not ghost click from opener). */
export function useBackdropPointerDismiss(active: boolean, onClose: () => void, delayMs = 800) {
  const suppressUntilRef = useRef(0);
  const wasActiveRef = useRef(false);
  const pointerDownOnBackdropRef = useRef(false);
  const isCoarsePointer = useIsCoarsePointer();

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
      if (isCoarsePointer) return;
      if (!pointerDownOnBackdropRef.current) return;
      pointerDownOnBackdropRef.current = false;
      if (event.target !== event.currentTarget) return;
      if (performance.now() < suppressUntilRef.current) return;
      onClose();
    },
    [isCoarsePointer, onClose],
  );

  return { onPointerDown, onPointerUp, isCoarsePointer };
}

export function useIsCoarsePointer() {
  const [coarse, setCoarse] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(pointer: coarse)");
    const update = () => setCoarse(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return coarse;
}

export function deferAfterTouch(handler: () => void, delayMs = 50) {
  window.setTimeout(handler, delayMs);
}
