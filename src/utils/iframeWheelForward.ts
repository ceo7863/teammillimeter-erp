export const ERP_EMBED_WHEEL_MESSAGE = "erp-embed-wheel" as const;

function scrollElement(el: HTMLElement, deltaY: number) {
  const max = el.scrollHeight - el.clientHeight;
  if (max <= 0) return false;
  const next = Math.max(0, Math.min(max, el.scrollTop + deltaY));
  if (next === el.scrollTop) return false;
  el.scrollTop = next;
  return true;
}

function postWheelToIframe(iframe: HTMLIFrameElement, event: WheelEvent, rect: DOMRect) {
  iframe.contentWindow?.postMessage(
    {
      type: ERP_EMBED_WHEEL_MESSAGE,
      deltaX: event.deltaX,
      deltaY: event.deltaY,
      deltaMode: event.deltaMode,
      clientX: event.clientX - rect.left,
      clientY: event.clientY - rect.top,
    },
    "*",
  );
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

  event.preventDefault();
  event.stopPropagation();

  const doc = iframe.contentDocument;
  if (doc) {
    if (!doc.documentElement.hasAttribute("data-embed-sheet-open")) return true;

    const drawerBody = doc.querySelector("[data-embed-scroll-body]") as HTMLElement | null;
    if (drawerBody) scrollElement(drawerBody, event.deltaY);
    return true;
  }

  postWheelToIframe(iframe, event, rect);
  return true;
}

export function embedIframeTargetOrigin(embedUrl: string) {
  try {
    return new URL(embedUrl).origin;
  } catch {
    return "";
  }
}
