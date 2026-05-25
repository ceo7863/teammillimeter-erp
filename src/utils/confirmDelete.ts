const DEFAULT_DELETE_MESSAGE = "삭제하시겠습니까? 삭제 후에는 복구할 수 없습니다.";

export function confirmDelete(message = DEFAULT_DELETE_MESSAGE): boolean {
  return window.confirm(message);
}

export { DEFAULT_DELETE_MESSAGE };
