function isScrollableY(el: HTMLElement) {
  const { overflowY } = window.getComputedStyle(el);
  if (overflowY !== "auto" && overflowY !== "scroll" && overflowY !== "overlay") return false;
  return el.scrollHeight > el.clientHeight + 1;
}

function scrollElement(el: HTMLElement, deltaY: number) {
  const max = el.scrollHeight - el.clientHeight;
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

  const innerX = event.clientX - rect.left;
  const innerY = event.clientY - rect.top;

  const openSheet = doc.querySelector('[data-slot="sheet-content"][data-state="open"]');
  if (openSheet) {
    const drawerBody = openSheet.querySelector("[data-embed-scroll-body]") as HTMLElement | null;
    if (drawerBody) {
      scrollElement(drawerBody, event.deltaY);
      return true;
    }
  }

  let node = doc.elementFromPoint(innerX, innerY) as HTMLElement | null;
  while (node && node !== doc.documentElement) {
    if (isScrollableY(node)) {
      scrollElement(node, event.deltaY);
      return true;
    }
    node = node.parentElement;
  }

  const root = doc.querySelector("[data-embed-scroll-root]") as HTMLElement | null;
  if (root) {
    scrollElement(root, event.deltaY);
    return true;
  }

  return true;
}
