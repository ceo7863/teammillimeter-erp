function scrollElement(el: HTMLElement, deltaY: number) {
  const max = el.scrollHeight - el.clientHeight;
  if (max <= 0) return;
  el.scrollTop = Math.max(0, Math.min(max, el.scrollTop + deltaY));
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

  // Calendar body fills the iframe — absorb wheel without scrolling.
  return true;
}
