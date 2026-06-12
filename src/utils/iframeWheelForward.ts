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

function findScrollTarget(doc: Document, clientX: number, clientY: number, iframeRect: DOMRect) {
  const x = clientX - iframeRect.left;
  const y = clientY - iframeRect.top;
  let node = doc.elementFromPoint(x, y);
  while (node && node !== doc.documentElement) {
    if (node instanceof HTMLElement && isVerticallyScrollable(node)) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

/** Forward parent-window wheel events into an iframe document (ERP embed shell). */
export function forwardWheelIntoIframe(iframe: HTMLIFrameElement, event: WheelEvent) {
  const rect = iframe.getBoundingClientRect();
  const over =
    event.clientX >= rect.left &&
    event.clientX <= rect.right &&
    event.clientY >= rect.top &&
    event.clientY <= rect.bottom;
  if (!over) return false;

  const doc = iframe.contentDocument;
  if (!doc) return false;

  event.preventDefault();
  event.stopPropagation();

  const sheetOpen = doc.documentElement.hasAttribute("data-embed-sheet-open");
  if (sheetOpen) {
    const drawerBody = doc.querySelector("[data-embed-scroll-body]") as HTMLElement | null;
    if (drawerBody) scrollElement(drawerBody, event.deltaY);
    return true;
  }

  const scrollTarget = findScrollTarget(doc, event.clientX, event.clientY, rect);
  if (scrollTarget) {
    scrollElement(scrollTarget, event.deltaY);
    return true;
  }

  return true;
}
