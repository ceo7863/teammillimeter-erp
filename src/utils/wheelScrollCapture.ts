import { useEffect } from "react";

function isVerticallyScrollable(el: HTMLElement) {
  const { overflowY } = getComputedStyle(el);
  if (overflowY !== "auto" && overflowY !== "scroll" && overflowY !== "overlay") return false;
  return el.scrollHeight > el.clientHeight + 1;
}

/** Scroll nearest overflow container on wheel (fixes nested flex / modal scroll). */
export function useWheelScrollCapture(active: boolean) {
  useEffect(() => {
    if (!active) return;

    const onWheel = (event: WheelEvent) => {
      if (event.defaultPrevented) return;

      let node = event.target instanceof HTMLElement ? event.target : null;
      while (node && node !== document.documentElement) {
        if (isVerticallyScrollable(node)) {
          const maxScroll = node.scrollHeight - node.clientHeight;
          const next = node.scrollTop + event.deltaY;
          if (
            (event.deltaY > 0 && node.scrollTop < maxScroll - 0.5) ||
            (event.deltaY < 0 && node.scrollTop > 0.5)
          ) {
            node.scrollTop = Math.max(0, Math.min(maxScroll, next));
            event.preventDefault();
            event.stopPropagation();
          }
          return;
        }
        node = node.parentElement;
      }
    };

    document.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => document.removeEventListener("wheel", onWheel, { capture: true });
  }, [active]);
}
