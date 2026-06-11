import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, HelpCircle, MessageSquare, PauseCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { prepareKoreanTextInput } from "@/utils/koreanIme";
import {
  canUserActAsRegistrar,
  canUserActAsSettler,
  formatSaleCommentTime,
  resolveSaleReviewStatus,
  SALE_COMMENT_KIND_LABELS,
  SALE_COMMENT_TEMPLATES,
  SALE_REVIEW_STATUS_LABELS,
  type PendingSaleComment,
  type SaleComment,
  type SaleReviewAction,
  type SaleReviewStatus,
} from "@/utils/saleComments";
import type { ErpUser } from "@/utils/erpApi";

type SaleVoucherCommentsPanelProps = {
  saleId?: string | number | null;
  sale?: { id?: string | number; reviewStatus?: SaleReviewStatus | string } | null;
  comments?: SaleComment[];
  pendingComments?: PendingSaleComment[];
  onAddComment?: (body: string) => void | Promise<void>;
  onReviewAction?: (action: SaleReviewAction, body?: string) => void | Promise<void>;
  currentUser?: Pick<ErpUser, "name" | "email" | "role" | "allowedPages"> | null;
  className?: string;
  mode?: "thread" | "registration";
};

type DisplayComment = {
  id: string;
  body: string;
  authorName: string;
  createdAt: string;
  kind?: SaleComment["kind"];
  pending?: boolean;
};

function readDraft(textarea: HTMLTextAreaElement | null | undefined) {
  return String(textarea?.value || "").trim();
}

function shouldSendOnEnter(event: React.KeyboardEvent<HTMLTextAreaElement>) {
  if (event.key !== "Enter") return false;
  if (event.shiftKey) return false;
  if (event.nativeEvent.isComposing) return false;
  return true;
}

function shouldSendOnShortcut(event: React.KeyboardEvent<HTMLTextAreaElement>) {
  return event.key === "Enter" && (event.ctrlKey || event.metaKey);
}

function kindBadgeLabel(kind?: SaleComment["kind"]) {
  if (!kind) return null;
  return SALE_COMMENT_KIND_LABELS[kind] || null;
}

export const SaleVoucherCommentsPanel = memo(function SaleVoucherCommentsPanel({
  saleId,
  sale,
  comments = [],
  pendingComments = [],
  onAddComment,
  onReviewAction,
  currentUser,
  className = "",
  mode = "thread",
}: SaleVoucherCommentsPanelProps) {
  const [canSubmit, setCanSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionReason, setActionReason] = useState("");
  const [pendingAction, setPendingAction] = useState<SaleReviewAction | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const actionTextareaRef = useRef<HTMLTextAreaElement>(null);
  const submittingRef = useRef(false);
  const onAddCommentRef = useRef(onAddComment);
  const onReviewActionRef = useRef(onReviewAction);
  onAddCommentRef.current = onAddComment;
  onReviewActionRef.current = onReviewAction;

  const syncCanSubmit = useCallback(() => {
    setCanSubmit(readDraft(textareaRef.current).length > 0);
  }, []);

  const reviewStatus = useMemo(() => {
    if (sale) return resolveSaleReviewStatus(sale, comments);
    if (pendingComments.length) return "pending" as SaleReviewStatus;
    return null;
  }, [comments, pendingComments.length, sale]);

  const displayComments = useMemo((): DisplayComment[] => {
    const persisted = comments.map((row) => ({
      id: row.id,
      body: row.body,
      authorName: row.authorName,
      createdAt: row.createdAt,
      kind: row.kind,
      pending: false,
    }));
    const pending = pendingComments.map((row) => ({
      id: row.id,
      body: row.body,
      authorName: row.authorName,
      createdAt: row.createdAt,
      kind: row.kind || ("note" as const),
      pending: true,
    }));
    return [...persisted, ...pending].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  }, [comments, pendingComments]);

  useEffect(() => {
    const node = listRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [displayComments.length, pendingAction]);

  const submitNote = useCallback(async () => {
    if (submittingRef.current) return;
    const body = readDraft(textareaRef.current);
    if (!body) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      if (onReviewActionRef.current && mode === "thread") {
        const action: SaleReviewAction = reviewStatus === "needs_review" ? "reply" : "note";
        await onReviewActionRef.current(action, body);
      } else if (onAddCommentRef.current) {
        await onAddCommentRef.current(body);
      }
      if (textareaRef.current) textareaRef.current.value = "";
      setCanSubmit(false);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [mode, reviewStatus]);

  const submitReviewAction = useCallback(async (action: SaleReviewAction) => {
    if (!onReviewActionRef.current || submittingRef.current) return;
    const needsReason = action === "question" || action === "hold";
    if (needsReason && !pendingAction) {
      setPendingAction(action);
      setActionReason("");
      return;
    }
    const body = needsReason ? readDraft(actionTextareaRef.current) || undefined : undefined;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      await onReviewActionRef.current(action, body);
      setPendingAction(null);
      setActionReason("");
      if (actionTextareaRef.current) actionTextareaRef.current.value = "";
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [pendingAction]);

  const queueSubmit = useCallback(() => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        void submitNote();
      });
    });
  }, [submitNote]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (shouldSendOnShortcut(event)) {
      event.preventDefault();
      event.stopPropagation();
      queueSubmit();
      return;
    }
    if (!shouldSendOnEnter(event)) return;
    event.preventDefault();
    event.stopPropagation();
    queueSubmit();
  };

  const insertTemplate = (text: string) => {
    const node = textareaRef.current;
    if (!node) return;
    const current = readDraft(node);
    node.value = current ? `${current}\n${text}` : text;
    setCanSubmit(true);
    node.focus();
  };

  const authorLabel = String(currentUser?.name || currentUser?.email || "사용자").trim() || "사용자";
  const isSettler = canUserActAsSettler(currentUser);
  const isRegistrar = canUserActAsRegistrar(currentUser);
  const showSettlerActions = mode === "thread" && isSettler && onReviewAction && reviewStatus !== "confirmed";
  const showRegistrarReply = mode === "thread" && isRegistrar && onReviewAction && reviewStatus === "needs_review";

  return (
    <Card className={`erp-sale-voucher-comments rounded-xl border-slate-200/80 shadow-sm ${className}`.trim()}>
      <CardContent className="p-3 md:p-4">
        <div className="erp-sale-voucher-comments-head">
          <div className="flex flex-wrap items-center gap-2">
            <MessageSquare size={16} className="text-slate-500" />
            <h2 className="text-sm font-bold text-slate-800">전표 코멘트</h2>
            {reviewStatus ? (
              <span className={`erp-sale-review-badge erp-sale-review-badge--inline is-${reviewStatus.replace("_", "-")}`}>
                {SALE_REVIEW_STATUS_LABELS[reviewStatus]}
              </span>
            ) : null}
            {displayComments.length ? (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                {displayComments.length}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {saleId
              ? "담당자·결제자 확인 스레드입니다."
              : "저장 전 작성한 코멘트는 전표 저장 시 함께 기록됩니다."}
          </p>
        </div>

        <div ref={listRef} className="erp-sale-voucher-comments-list" aria-live="polite">
          {!displayComments.length ? (
            <p className="py-6 text-center text-sm text-slate-400">아직 코멘트가 없습니다.</p>
          ) : (
            displayComments.map((row) => {
              const kindLabel = kindBadgeLabel(row.kind);
              return (
                <div
                  key={row.id}
                  className={`erp-sale-voucher-comments-item${row.pending ? " is-pending" : ""}`}
                >
                  <div className="erp-sale-voucher-comments-item-head">
                    <span className="font-semibold text-slate-800">{row.authorName}</span>
                    <span className="text-xs text-slate-400">{formatSaleCommentTime(row.createdAt)}</span>
                    {kindLabel ? (
                      <span className={`erp-sale-comment-kind is-${row.kind || "note"}`}>{kindLabel}</span>
                    ) : null}
                    {row.pending ? (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[0.6875rem] font-semibold text-amber-700">
                        저장 대기
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">{row.body}</p>
                </div>
              );
            })
          )}
        </div>

        {showSettlerActions ? (
          <div className="erp-sale-review-actions">
            <span className="erp-text-caption font-semibold text-slate-500">결제 확인</span>
            <div className="erp-sale-review-action-btns">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 rounded-lg border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                disabled={submitting}
                onClick={() => void submitReviewAction("confirm")}
              >
                <CheckCircle2 size={14} />
                확인완료
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 rounded-lg border-amber-200 text-amber-800 hover:bg-amber-50"
                disabled={submitting}
                onClick={() => void submitReviewAction("question")}
              >
                <HelpCircle size={14} />
                확인필요
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 rounded-lg border-slate-300 text-slate-700 hover:bg-slate-50"
                disabled={submitting}
                onClick={() => void submitReviewAction("hold")}
              >
                <PauseCircle size={14} />
                보류
              </Button>
            </div>
            {pendingAction === "question" || pendingAction === "hold" ? (
              <div className="erp-sale-review-reason">
                <textarea
                  ref={actionTextareaRef}
                  lang="ko"
                  className="erp-input erp-sale-voucher-comments-input min-h-[56px] w-full rounded-xl"
                  defaultValue={actionReason}
                  placeholder={pendingAction === "hold" ? "보류 사유 (선택)" : "확인이 필요한 내용"}
                  onPointerDown={(event) => prepareKoreanTextInput(event.currentTarget)}
                  onFocus={(event) => prepareKoreanTextInput(event.currentTarget)}
                />
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="outline" className="h-8 rounded-lg" onClick={() => setPendingAction(null)}>
                    취소
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 rounded-lg"
                    disabled={submitting}
                    onClick={() => void submitReviewAction(pendingAction)}
                  >
                    등록
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="erp-sale-comment-templates">
          {SALE_COMMENT_TEMPLATES.map((chip) => (
            <button
              key={chip}
              type="button"
              className="erp-sale-comment-template-chip"
              onClick={() => insertTemplate(chip)}
            >
              {chip}
            </button>
          ))}
        </div>

        <form
          className="erp-sale-voucher-comments-compose"
          onSubmit={(event) => {
            event.preventDefault();
            void submitNote();
          }}
        >
          <textarea
            ref={textareaRef}
            lang="ko"
            enterKeyHint="send"
            className="erp-input erp-sale-voucher-comments-input min-h-[72px] w-full rounded-xl"
            defaultValue=""
            placeholder={
              showRegistrarReply
                ? `${authorLabel}님, 답변·추가 코멘트 (Enter 전송)`
                : `${authorLabel}님, 추가 코멘트 (Enter 전송 · Ctrl+Enter 전송 · Shift+Enter 줄바꿈)`
            }
            onPointerDown={(event) => prepareKoreanTextInput(event.currentTarget)}
            onFocus={(event) => prepareKoreanTextInput(event.currentTarget)}
            onInput={syncCanSubmit}
            onKeyDown={handleKeyDown}
          />
          <Button
            type="submit"
            size="sm"
            className="h-9 shrink-0 rounded-xl px-4"
            disabled={submitting || !canSubmit}
          >
            <Send size={14} />
            {showRegistrarReply ? "답변" : "추가"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
});
