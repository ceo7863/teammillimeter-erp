let koreanImeAnchor: HTMLInputElement | null = null;

export function ensureKoreanImeAnchor() {
  if (typeof document === "undefined") return null;
  if (koreanImeAnchor?.isConnected) return koreanImeAnchor;

  const anchor = document.createElement("input");
  anchor.type = "text";
  anchor.lang = "ko";
  anchor.autocomplete = "off";
  anchor.tabIndex = -1;
  anchor.setAttribute("aria-hidden", "true");
  anchor.style.cssText = "position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;";
  document.body.appendChild(anchor);
  koreanImeAnchor = anchor;
  return anchor;
}

export function prepareKoreanTextInput(input: HTMLInputElement | HTMLTextAreaElement | null | undefined) {
  if (!(input instanceof HTMLInputElement) && !(input instanceof HTMLTextAreaElement)) return;
  input.setAttribute("lang", "ko");
  input.removeAttribute("inputmode");
}

export function isKoreanTextInput(input: HTMLInputElement) {
  const inputMode = String(input.inputMode || input.getAttribute("inputmode") || "").toLowerCase();
  if (inputMode === "numeric" || inputMode === "decimal") return false;
  if (input.type === "number" || input.type === "date") return false;
  return true;
}

export function focusKoreanTextInput(input: HTMLInputElement | null | undefined) {
  if (!(input instanceof HTMLInputElement)) return;
  if (isKoreanTextInput(input)) prepareKoreanTextInput(input);
  input.focus({ preventScroll: true });
}
