import React, { memo, useCallback, useImperativeHandle, useRef, useState } from "react";
import { SaleVoucherCommentsPanel } from "@/components/SaleVoucherCommentsPanel";
import {
  createPendingSaleComment,
  pendingCommentsToSaleComments,
  type PendingSaleComment,
  type SaleComment,
} from "@/utils/saleComments";

export type SaleRegistrationCommentsHandle = {
  flushPending: (saleId: string | number) => SaleComment[];
  reset: () => void;
  hasPending: () => boolean;
};

type SaleRegistrationCommentsPanelProps = {
  currentUser?: { name?: string; email?: string } | null;
  panelRef?: React.Ref<SaleRegistrationCommentsHandle>;
};

export const SaleRegistrationCommentsPanel = memo(function SaleRegistrationCommentsPanel({
  currentUser,
  panelRef,
}: SaleRegistrationCommentsPanelProps) {
  const [pendingComments, setPendingComments] = useState<PendingSaleComment[]>([]);
  const pendingRef = useRef(pendingComments);
  pendingRef.current = pendingComments;

  useImperativeHandle(
    panelRef,
    () => ({
      flushPending: (saleId) => pendingCommentsToSaleComments(pendingRef.current, saleId),
      reset: () => setPendingComments([]),
      hasPending: () => pendingRef.current.length > 0,
    }),
    [],
  );

  const handleAddComment = useCallback(
    (body: string) => {
      setPendingComments((prev) => [...prev, createPendingSaleComment(body, currentUser, "note")]);
    },
    [currentUser],
  );

  return (
    <SaleVoucherCommentsPanel
      comments={[]}
      pendingComments={pendingComments}
      onAddComment={handleAddComment}
      currentUser={currentUser}
      mode="registration"
    />
  );
});
