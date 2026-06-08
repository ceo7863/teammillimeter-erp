export function extractBarobillMgtKeyFromMemo(memo?: string | null) {
  const match = String(memo || "").match(/MgtKey:\s*([^\s\u00B7]+)/i);
  return match?.[1]?.trim() || "";
}
