export const ERP_EMBED_WHEEL_MESSAGE = "erp-embed-wheel" as const;

function scrollElement(el: HTMLElement, deltaY: number) {
  const max = el.scrollHeight - el.clientHeight;
  if (max <= 0) return false;
  const next = Math.max(0, Math.min(max, el.scrollTop + deltaY));
  if (next === el.scrollTop) return false;
  el.scrollTop = next;
  return true;
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
  if (!doc) {
    // Cross-origin: Chrome delivers wheel inside the iframe; SC handles drawer scroll there.
    return false;
  }

  const sheetOpen = doc.documentElement.hasAttribute("data-embed-sheet-open");
  if (!sheetOpen) return false;

  const drawerBody = doc.querySelector("[data-embed-scroll-body]") as HTMLElement | null;
  if (!drawerBody || drawerBody.scrollHeight <= drawerBody.clientHeight + 1) return false;

  event.preventDefault();
  event.stopPropagation();
  scrollElement(drawerBody, event.deltaY);
  return true;
}

export function embedIframeTargetOrigin(embedUrl: string) {
  try {
    return new URL(embedUrl).origin;
  } catch {
    return "";
  }
}
