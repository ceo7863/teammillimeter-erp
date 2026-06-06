import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildUnreadSaleCommentCountBySaleId,
  countUnreadSaleComments,
  getSaleCommentsSeenAt,
  setSaleCommentsSeenAt,
  type SaleComment,
} from "@/utils/saleComments";

export function useSaleCommentReadState(
  userId: string | number | null | undefined,
  saleComments: SaleComment[],
  currentUser?: { name?: string; email?: string; loginId?: string } | null,
) {
  const [seenAt, setSeenAtState] = useState<string | null>(() =>
    userId != null && userId !== "" ? getSaleCommentsSeenAt(userId) : null,
  );

  useEffect(() => {
    if (userId == null || userId === "") {
      setSeenAtState(null);
      return;
    }
    let stored = getSaleCommentsSeenAt(userId);
    if (!stored) {
      stored = new Date().toISOString();
      setSaleCommentsSeenAt(userId, stored);
    }
    setSeenAtState(stored);
  }, [userId]);

  const markAllRead = useCallback(() => {
    if (userId == null || userId === "") return;
    const now = new Date().toISOString();
    setSaleCommentsSeenAt(userId, now);
    setSeenAtState(now);
  }, [userId]);

  const unreadCount = useMemo(
    () => countUnreadSaleComments(saleComments, seenAt, currentUser),
    [saleComments, seenAt, currentUser],
  );

  const unreadCountBySaleId = useMemo(
    () => buildUnreadSaleCommentCountBySaleId(saleComments, seenAt, currentUser),
    [saleComments, seenAt, currentUser],
  );

  return { unreadCount, unreadCountBySaleId, markAllRead, seenAt };
}
