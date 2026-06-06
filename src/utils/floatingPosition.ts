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

export function readBankTxAccountTriggerElement(triggerId?: string | null) {
  if (!triggerId) return null;
  const el = document.querySelector(`[${BANK_TX_ACCOUNT_TRIGGER_ATTR}="${CSS.escape(triggerId)}"]`);
  return el instanceof HTMLElement && el.isConnected ? el : null;
}

export function readBankTxAccountTriggerRect(triggerId?: string | null) {
  const el = readBankTxAccountTriggerElement(triggerId);
  return el ? el.getBoundingClientRect() : null;
}

export function readAnchorRect(anchorEl?: HTMLElement | null) {
  if (!anchorEl?.isConnected) return null;
  return anchorEl.getBoundingClientRect();
}
