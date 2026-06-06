import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MessageSquare, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  formatSaleCommentTime,
  type PendingSaleComment,
  type SaleComment,
} from "@/utils/saleComments";

type SaleVoucherCommentsPanelProps = {
  saleId?: string | number | null;
  comments?: SaleComment[];
  pendingComments?: PendingSaleComment[];
  onAddComment: (body: string) => void | Promise<void>;
  currentUser?: { name?: string; email?: string } | null;
  className?: string;
};

type DisplayComment = {
  id: string;
  body: string;
  authorName: string;
  createdAt: string;
  pending?: boolean;
};

export const SaleVoucherCommentsPanel = memo(function SaleVoucherCommentsPanel({
  saleId,
  comments = [],
  pendingComments = [],
  onAddComment,
  currentUser,
  className = "",
}: SaleVoucherCommentsPanelProps) {
  const [submitting, setSubmitting] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const onAddCommentRef = useRef(onAddComment);
  onAddCommentRef.current = onAddComment;

  const displayComments = useMemo((): DisplayComment[] => {
    const persisted = comments.map((row) => ({
      id: row.id,
      body: row.body,
      authorName: row.authorName,
      createdAt: row.createdAt,
      pending: false,
    }));
    const pending = pendingComments.map((row) => ({
      id: row.id,
      body: row.body,
      authorName: row.authorName,
      createdAt: row.createdAt,
      pending: true,
    }));
    return [...persisted, ...pending].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  }, [comments, pendingComments]);

  useEffect(() => {
    const node = listRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [displayComments.length]);

  const submit = useCallback(async () => {
    const body = String(textareaRef.current?.value || "").trim();
    if (!body || submitting) return;
    setSubmitting(true);
    try {
      await onAddCommentRef.current(body);
      if (textareaRef.current) {
        textareaRef.current.value = "";
      }
    } finally {
      setSubmitting(false);
    }
  }, [submitting]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  };

  const authorLabel = String(currentUser?.name || currentUser?.email || "\uC0AC\uC6A9\uC790").trim() || "\uC0AC\uC6A9\uC790";

  return (
    <Card className={`erp-sale-voucher-comments rounded-xl border-slate-200/80 shadow-sm ${className}`.trim()}>
      <CardContent className="p-3 md:p-4">
        <div className="erp-sale-voucher-comments-head">
          <div className="flex items-center gap-2">
            <MessageSquare size={16} className="text-slate-500" />
            <h2 className="text-sm font-bold text-slate-800">{"\uC804\uD45C \uCF54\uBA58\uD2B8"}</h2>
            {displayComments.length ? (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                {displayComments.length}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {saleId
              ? "\uC774 \uC804\uD45C\uC5D0 \uB300\uD55C \uD300 \uCF54\uBA58\uD2B8\uC785\uB2C8\uB2E4."
              : "\uC800\uC7A5 \uC804 \uC791\uC131\uD55C \uCF54\uBA58\uD2B8\uB294 \uC804\uD45C \uC800\uC7A5 \uC2DC \uD568\uAED8 \uAE30\uB85D\uB429\uB2C8\uB2E4."}
          </p>
        </div>

        <div ref={listRef} className="erp-sale-voucher-comments-list" aria-live="polite">
          {!displayComments.length ? (
            <p className="py-6 text-center text-sm text-slate-400">{"\uC544\uC9C1 \uCF54\uBA58\uD2B8\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4."}</p>
          ) : (
            displayComments.map((row) => (
              <div
                key={row.id}
                className={`erp-sale-voucher-comments-item${row.pending ? " is-pending" : ""}`}
              >
                <div className="erp-sale-voucher-comments-item-head">
                  <span className="font-semibold text-slate-800">{row.authorName}</span>
                  <span className="text-xs text-slate-400">{formatSaleCommentTime(row.createdAt)}</span>
                  {row.pending ? (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[0.6875rem] font-semibold text-amber-700">
                      {"\uC800\uC7A5 \uB300\uAE30"}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">{row.body}</p>
              </div>
            ))
          )}
        </div>

        <div className="erp-sale-voucher-comments-compose">
          <textarea
            ref={textareaRef}
            lang="ko"
            className="erp-input erp-sale-voucher-comments-input min-h-[72px] w-full rounded-xl"
            defaultValue=""
            placeholder={`${authorLabel}\uB2D8, \uCF54\uBA58\uD2B8 \uC785\uB825 (Enter \uC804\uC1A1 \u00B7 Shift+Enter \uC904\uBC14\uAFC8)`}
            onKeyDown={handleKeyDown}
          />
          <Button
            type="button"
            size="sm"
            className="h-9 shrink-0 rounded-xl px-4"
            disabled={submitting}
            onClick={() => void submit()}
          >
            <Send size={14} />
            {"\uC804\uC1A1"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
});
