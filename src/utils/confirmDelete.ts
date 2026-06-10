const DEFAULT_DELETE_MESSAGE = "삭제하시겠습니까? 삭제 후에는 복구할 수 없습니다.";

export function confirmDelete(message = DEFAULT_DELETE_MESSAGE): boolean {
  return window.confirm(message);
}

export function confirmWorkerPermanentDelete(workerName: string): boolean {
  const trimmedName = String(workerName || "").trim();
  if (!trimmedName) return false;
  if (
    !window.confirm(
      `\uC2DC\uACF5\uC790 "${trimmedName}"\uC744(\uB97C) \uC644\uC804 \uC0AD\uC81C\uD569\uB2C8\uB2E4.\n\uB9E4\uCD9C \uB4F1 \uAE30\uC874 \uB370\uC774\uD130\uC640 \uC5F0\uACB0\uB418 \uC788\uC744 \uC218 \uC788\uC2B5\uB2C8\uB2E4.\n\uBE44\uD65C\uC131\uD654\uB97C \uAD8C\uC7A5\uD569\uB2C8\uB2E4.\n\uC815\uB9D0 \uC0AD\uC81C\uD560\uAE4C\uC694?`,
    )
  ) {
    return false;
  }
  const typed = window.prompt(
    `\uC644\uC804 \uC0AD\uC81C\uD558\uB824\uBA74 \uC2DC\uACF5\uC790\uBA85\uC744 \uADF8\uB300\uB85C \uC785\uB825\uD558\uC138\uC694.\n\uC785\uB825: ${trimmedName}`,
  );
  return typed != null && typed.trim() === trimmedName;
}

export { DEFAULT_DELETE_MESSAGE };
