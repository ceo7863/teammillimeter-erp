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
  /** Walk stops here; defaults to the ambient document (tests pass a shim root). */
  documentElement?: HTMLElement | null;
}) {
  if (!options.panelOpen || !options.panelMain) return null;
  const root = options.documentElement ?? document.documentElement;
  let node: HTMLElement | null = options.eventTarget;
  while (node && node !== root) {
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

function getOpenDrawerScrollBody(doc: Document) {
  if (!doc.documentElement.hasAttribute("data-erp-csr-cal-drawer-open")) return null;
  return doc.querySelector<HTMLElement>("[data-erp-csr-cal-drawer-scroll-body]");
}

function getOpenLinkPanelScrollBody(doc: Document) {
  if (!doc.documentElement.hasAttribute("data-erp-link-panel-open")) return null;
  return doc.querySelector<HTMLElement>("[data-erp-link-panel-scroll], .erp-tax-invoice-link-panel__main");
}

export type WheelScrollCaptureResult = {
  /** Which container consumed the wheel: link panel, drawer, nearest overflow ancestor, page body. */
  handledBy: "drawer" | "linkPanel" | "ancestor" | "pageBody" | "none";
  /** Element whose scrollTop was changed (null when nothing scrolled). */
  scrolled: HTMLElement | null;
  /** True when the background/page was prevented from scrolling. */
  blockedBackground: boolean;
};

/**
 * The wheel policy itself, extracted from the hook so it is testable without React.
 * `scripts/test-bank-link-panel-browser.mjs` drives it with a realistic panel DOM and
 * asserts the panel scrolls while the background stays put.
 */
export function handleWheelScrollCapture(event: WheelEvent, doc: Document): WheelScrollCaptureResult {
  if (event.defaultPrevented) {
    return { handledBy: "none", scrolled: null, blockedBackground: false };
  }

  const drawerBody = getOpenDrawerScrollBody(doc);
  if (drawerBody) {
    event.preventDefault();
    event.stopPropagation();
    const moved = scrollElement(drawerBody, event.deltaY);
    return { handledBy: "drawer", scrolled: moved ? drawerBody : null, blockedBackground: true };
  }

  const linkPanel = getOpenLinkPanelScrollBody(doc);
  const target = isElementLike(event.target) ? (event.target as HTMLElement) : null;
  if (linkPanel) {
    const resolved = resolveLinkPanelWheelTarget({
      panelOpen: true,
      panelMain: linkPanel,
      eventTarget: target,
      documentElement: doc.documentElement,
    });
    let scrolled: HTMLElement | null = null;
    if (resolved?.target) {
      scrolled = scrollElement(resolved.target, event.deltaY) ? resolved.target : null;
    }
    event.preventDefault();
    event.stopPropagation();
    return { handledBy: "linkPanel", scrolled, blockedBackground: true };
  }

  let node = target;
  while (node && node !== doc.documentElement) {
    if (isVerticallyScrollable(node)) {
      const moved = scrollElement(node, event.deltaY);
      event.preventDefault();
      event.stopPropagation();
      return { handledBy: "ancestor", scrolled: moved ? node : null, blockedBackground: true };
    }
    node = node.parentElement;
  }

  const pageBody = target?.closest?.(".erp-client-calendars-page")
    ? doc.querySelector<HTMLElement>(".erp-client-calendars-page__body")
    : null;
  if (pageBody && isVerticallyScrollable(pageBody)) {
    const moved = scrollElement(pageBody, event.deltaY);
    event.preventDefault();
    event.stopPropagation();
    return { handledBy: "pageBody", scrolled: moved ? pageBody : null, blockedBackground: true };
  }

  return { handledBy: "none", scrolled: null, blockedBackground: false };
}

function isElementLike(value: unknown): value is HTMLElement {
  if (typeof HTMLElement !== "undefined" && value instanceof HTMLElement) return true;
  return Boolean(value && typeof value === "object" && "classList" in (value as object));
}

/** Scroll nearest overflow container on wheel (nested flex / drawer isolation). */
export function useWheelScrollCapture(active: boolean) {
  useEffect(() => {
    if (!active) return;

    const onWheel = (event: WheelEvent) => {
      handleWheelScrollCapture(event, document);
    };

    document.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => document.removeEventListener("wheel", onWheel, { capture: true });
  }, [active]);
}
