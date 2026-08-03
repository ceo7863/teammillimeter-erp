import { useEffect } from "react";

export function isVerticallyScrollable(el: HTMLElement) {
  const { overflowY } = getComputedStyle(el);
  if (overflowY !== "auto" && overflowY !== "scroll" && overflowY !== "overlay") return false;
  return el.scrollHeight > el.clientHeight + 1;
}

export function scrollElement(el: HTMLElement, deltaY: number) {
  const max = el.scrollHeight - el.clientHeight;
  if (max <= 0) return false;
  const next = Math.max(0, Math.min(max, el.scrollTop + deltaY));
  if (next === el.scrollTop) return false;
  el.scrollTop = next;
  return true;
}

/** Prefer nested table-wrap scroll, else panel main; block background when panel open. */
export function resolveLinkPanelWheelTarget(options: {
  panelOpen: boolean;
  panelMain: HTMLElement | null;
  eventTarget: HTMLElement | null;
}) {
  if (!options.panelOpen || !options.panelMain) return null;
  let node: HTMLElement | null = options.eventTarget;
  while (node && node !== document.documentElement) {
    if (
      node.classList?.contains("erp-tax-invoice-link-panel__table-wrap") &&
      isVerticallyScrollable(node)
    ) {
      return { target: node, blockBackground: true as const };
    }
    if (node === options.panelMain) break;
    node = node.parentElement;
  }
  return { target: options.panelMain, blockBackground: true as const };
}

function getOpenDrawerScrollBody() {
  if (!document.documentElement.hasAttribute("data-erp-csr-cal-drawer-open")) return null;
  return document.querySelector<HTMLElement>("[data-erp-csr-cal-drawer-scroll-body]");
}

function getOpenLinkPanelScrollBody() {
  if (!document.documentElement.hasAttribute("data-erp-link-panel-open")) return null;
  return document.querySelector<HTMLElement>("[data-erp-link-panel-scroll], .erp-tax-invoice-link-panel__main");
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

      const linkPanel = getOpenLinkPanelScrollBody();
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (linkPanel) {
        const resolved = resolveLinkPanelWheelTarget({
          panelOpen: true,
          panelMain: linkPanel,
          eventTarget: target,
        });
        if (resolved?.target) {
          scrollElement(resolved.target, event.deltaY);
        }
        event.preventDefault();
        event.stopPropagation();
        return;
      }

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
