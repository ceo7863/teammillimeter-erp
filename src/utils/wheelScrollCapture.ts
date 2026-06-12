import { useEffect } from "react";

function isVerticallyScrollable(el: HTMLElement) {
  const { overflowY } = getComputedStyle(el);
  if (overflowY !== "auto" && overflowY !== "scroll" && overflowY !== "overlay") return false;
  return el.scrollHeight > el.clientHeight + 1;
}

function scrollElement(el: HTMLElement, deltaY: number) {
  const max = el.scrollHeight - el.clientHeight;
  if (max <= 0) return;
  el.scrollTop = Math.max(0, Math.min(max, el.scrollTop + deltaY));
}

function getOpenDrawerScrollBody() {
  if (!document.documentElement.hasAttribute("data-erp-csr-cal-drawer-open")) return null;
  return document.querySelector<HTMLElement>("[data-erp-csr-cal-drawer-scroll-body]");
}

/** Scroll nearest overflow container on wheel (nested flex / drawer isolation). */
export function useWheelScrollCapture(active: boolean) {
  useEffect(() => {
    if (!active) return;

    const onWheel = (event: WheelEvent) => {
      if (event.defaultPrevented) return;

      const drawerBody = getOpenDrawerScrollBody();
      if (drawerBody) {
        event.preventDefault();
        event.stopPropagation();
        scrollElement(drawerBody, event.deltaY);
        return;
      }

      const target = event.target instanceof HTMLElement ? event.target : null;
      let node = target;
      while (node && node !== document.documentElement) {
        if (isVerticallyScrollable(node)) {
          scrollElement(node, event.deltaY);
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        node = node.parentElement;
      }

      const pageBody = target?.closest(".erp-client-calendars-page")
        ? document.querySelector<HTMLElement>(".erp-client-calendars-page__body")
        : null;
      if (pageBody && isVerticallyScrollable(pageBody)) {
        scrollElement(pageBody, event.deltaY);
        event.preventDefault();
        event.stopPropagation();
      }
    };

    document.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => document.removeEventListener("wheel", onWheel, { capture: true });
  }, [active]);
}
