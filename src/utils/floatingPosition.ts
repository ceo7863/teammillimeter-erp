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

export const BANK_TX_ACCOUNT_TRIGGER_ATTR = "data-bank-tx-account-trigger";

function isVisibleAnchor(el: HTMLElement) {
  if (!el.isConnected) return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

export function readBankTxAccountTriggerElement(triggerId?: string | null) {
  if (!triggerId) return null;
  const nodes = document.querySelectorAll(`[${BANK_TX_ACCOUNT_TRIGGER_ATTR}="${CSS.escape(triggerId)}"]`);
  for (const node of nodes) {
    if (node instanceof HTMLElement && isVisibleAnchor(node)) return node;
  }
  return null;
}

export function resolveBankTxAccountTriggerElement(
  triggerId?: string | null,
  preferred?: HTMLElement | null,
) {
  if (preferred && isVisibleAnchor(preferred)) return preferred;
  return readBankTxAccountTriggerElement(triggerId);
}

export function readBankTxAccountTriggerRect(
  triggerId?: string | null,
  preferred?: HTMLElement | null,
) {
  const el = resolveBankTxAccountTriggerElement(triggerId, preferred);
  return el ? el.getBoundingClientRect() : null;
}

export function readAnchorRect(anchorEl?: HTMLElement | null) {
  if (!anchorEl?.isConnected) return null;
  return anchorEl.getBoundingClientRect();
}
