import { useEffect } from "react";

let lockCount = 0;
let previousBodyOverflow = "";

/** Clears iOS Safari pinch-zoom that can persist after focusing small inputs. */
export function resetIOSViewportZoom() {
  if (typeof window === "undefined") return;
  if (!/iPhone|iPad|iPod/i.test(navigator.userAgent)) return;

  const meta = document.querySelector('meta[name="viewport"]');
  if (!meta) return;

  const original = meta.getAttribute("content") ?? "";
  if (!original) return;

  meta.setAttribute("content", `${original}, maximum-scale=1`);
  requestAnimationFrame(() => {
    meta.setAttribute("content", original);
  });
}

export function lockBodyScroll() {
  if (lockCount === 0) {
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  lockCount += 1;

  return () => {
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount === 0) {
      document.body.style.overflow = previousBodyOverflow;
      resetIOSViewportZoom();
    }
  };
}

export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    return lockBodyScroll();
  }, [active]);
}
