const SCROLLABLE_OVERFLOW = new Set(["auto", "scroll", "overlay"]);

export function isScrollableOverflow(value: string) {
  return SCROLLABLE_OVERFLOW.has(value);
}

/** Window plus overflow scroll/auto ancestors of an element. */
export function getScrollParents(element: HTMLElement | null | undefined): Array<HTMLElement | Window> {
  const parents: Array<HTMLElement | Window> = [window];
  if (!element) return parents;

  let node: HTMLElement | null = element.parentElement;
  while (node) {
    const style = window.getComputedStyle(node);
    if (
      isScrollableOverflow(style.overflowY) ||
      isScrollableOverflow(style.overflowX) ||
      isScrollableOverflow(style.overflow)
    ) {
      parents.push(node);
    }
    node = node.parentElement;
  }

  return parents;
}

export function readAnchorRect(anchorEl?: HTMLElement | null) {
  if (!anchorEl?.isConnected) return null;
  return anchorEl.getBoundingClientRect();
}
