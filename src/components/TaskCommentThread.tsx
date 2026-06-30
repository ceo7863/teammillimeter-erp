import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CornerUpLeft,
  Download,
  ImagePlus,
  Loader2,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Send,
  Trash2,
  X,
} from "lucide-react";
import type { ErpUser } from "@/utils/erpApi";
import { isApiModeEnabled } from "@/utils/erpApi";
import {
  deleteTaskCommentMessage,
  editTaskCommentMessage,
  formatTaskCommentTime,
  loadTaskCommentHistory,
  sendTaskComment,
  TASK_COMMENT_REACTION_OPTIONS,
  toggleTaskCommentReaction,
  type TaskCommentMessage,
  type TaskCommentReplyPreview,
} from "@/utils/taskComments";
import {
  downloadTaskCommentAttachmentBlob,
  fetchTaskCommentAttachmentBlob,
  filterTaskCommentAttachmentFiles,
  formatTaskCommentAttachmentSize,
  hasDraggedFiles,
  isTaskCommentAttachmentFile,
  isTaskCommentImageMimeType,
  TASK_COMMENT_ATTACHMENT_ACCEPT,
  uploadTaskCommentAttachment,
  type TaskCommentAttachment,
} from "@/utils/taskCommentAttachments";
import { teamChatAvatarInitial, teamChatAvatarStyle } from "@/utils/teamChatUi";

const L = {
  title: "댓글",
  empty: "첫 댓글을 남겨 보세요.",
  placeholder: "댓글 입력",
  send: "전송",
  sending: "전송 중…",
  loadError: "댓글을 불러오지 못했습니다.",
  sendError: "댓글 전송에 실패했습니다.",
  attachError: "첨부파일 업로드에 실패했습니다.",
  offline: "서버 모드에서만 댓글·첨부·리액션을 사용할 수 있습니다.",
  dropFiles: "사진이나 파일을 여기에 놓으세요",
  deletedMessage: "삭제된 메시지입니다.",
  edited: "(수정됨)",
  reply: "답장",
  edit: "수정",
  delete: "삭제",
  cancelEdit: "취소",
  saveEdit: "저장",
  replyTo: "답장 중",
  cancelReply: "취소",
  deleteConfirm: "이 댓글을 삭제할까요?",
  react: "리액션",
  fileDownloadError: "파일을 불러오지 못했습니다.",
  downloadImage: "다운로드",
  closePreview: "닫기",
};

type PendingAttachment = TaskCommentAttachment & { previewUrl?: string | null };

type TaskCommentThreadProps = {
  taskId: string;
  currentUser: ErpUser | null;
  className?: string;
};

function ReplyQuotePreview({ replyTo }: { replyTo: TaskCommentReplyPreview }) {
  const body = replyTo.deleted ? L.deletedMessage : replyTo.body || "…";
  return (
    <div className="erp-team-chat-reply-quote">
      <span className="erp-team-chat-reply-quote__author">{replyTo.userName}</span>
      <span className="erp-team-chat-reply-quote__body">{body}</span>
    </div>
  );
}

function MessageReactionBar({
  reactions,
  onToggle,
}: {
  reactions: TaskCommentMessage["reactions"];
  onToggle: (emoji: string) => void;
}) {
  const rows = reactions?.filter((row) => row.count > 0) || [];
  if (!rows.length) return null;
  return (
    <div className="erp-team-chat-reactions">
      {rows.map((reaction) => (
        <button
          key={reaction.emoji}
          type="button"
          className={`erp-team-chat-reaction${reaction.reactedByMe ? " is-mine" : ""}`}
          aria-pressed={reaction.reactedByMe}
          aria-label={`${reaction.emoji} ${reaction.count}명`}
          onClick={() => onToggle(reaction.emoji)}
        >
          <span className="erp-team-chat-reaction__emoji">{reaction.emoji}</span>
          {reaction.count > 1 ? <span className="erp-team-chat-reaction__count">{reaction.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

type ImagePreview = {
  url: string;
  fileName: string;
  attachmentId?: string;
};

function ImagePreviewModal({ preview, onClose }: { preview: ImagePreview | null; onClose: () => void }) {
  const handleDownload = useCallback(async () => {
    if (!preview) return;
    try {
      if (preview.attachmentId) {
        const blob = await fetchTaskCommentAttachmentBlob(preview.attachmentId);
        if (blob) {
          downloadTaskCommentAttachmentBlob(blob, preview.fileName);
          return;
        }
      }
      const response = await fetch(preview.url);
      const blob = await response.blob();
      downloadTaskCommentAttachmentBlob(blob, preview.fileName);
    } catch {
      window.alert(L.fileDownloadError);
    }
  }, [preview]);

  useEffect(() => {
    if (!preview) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, preview]);

  if (!preview) return null;

  const modal = (
    <div
      className="erp-team-chat-image-preview-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={preview.fileName}
    >
      <div className="erp-team-chat-image-preview__toolbar" onClick={(event) => event.stopPropagation()}>
        <span className="erp-team-chat-image-preview__name">{preview.fileName}</span>
        <div className="erp-team-chat-image-preview__actions">
          <button type="button" className="erp-team-chat-image-preview__btn" onClick={() => void handleDownload()}>
            <Download size={16} />
            {L.downloadImage}
          </button>
          <button type="button" className="erp-team-chat-image-preview__btn" onClick={onClose} aria-label={L.closePreview}>
            <X size={18} />
          </button>
        </div>
      </div>
      <div className="erp-team-chat-image-preview__body" onClick={onClose}>
        <img
          src={preview.url}
          alt={preview.fileName}
          className="erp-team-chat-image-preview__img"
          draggable={false}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        />
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modal, document.body) : modal;
}

function AttachmentChip({
  attachment,
  onImagePreview,
}: {
  attachment: TaskCommentAttachment;
  onImagePreview?: (preview: ImagePreview) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isTaskCommentImageMimeType(attachment.mimeType)) return;
    let cancelled = false;
    let objectUrl = "";
    void (async () => {
      try {
        const blob = await fetchTaskCommentAttachmentBlob(attachment.id);
        if (cancelled || !blob) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachment.id, attachment.mimeType]);

  const handleOpen = async () => {
    if (isTaskCommentImageMimeType(attachment.mimeType)) {
      if (url) {
        onImagePreview?.({ url, fileName: attachment.fileName, attachmentId: attachment.id });
        return;
      }
      try {
        const blob = await fetchTaskCommentAttachmentBlob(attachment.id);
        if (!blob) return;
        const objectUrl = URL.createObjectURL(blob);
        onImagePreview?.({ url: objectUrl, fileName: attachment.fileName, attachmentId: attachment.id });
      } catch {
        window.alert(L.fileDownloadError);
      }
      return;
    }
    try {
      const blob = await fetchTaskCommentAttachmentBlob(attachment.id);
      if (blob) downloadTaskCommentAttachmentBlob(blob, attachment.fileName);
    } catch {
      window.alert(L.fileDownloadError);
    }
  };

  return (
    <div className="erp-team-chat-attachment-chip">
      {url ? (
        <button type="button" className="erp-team-chat-attachment-thumb" onClick={() => void handleOpen()} title={attachment.fileName}>
          <img src={url} alt={attachment.fileName} draggable={false} />
        </button>
      ) : (
        <button type="button" className="erp-team-chat-attachment-file" onClick={() => void handleOpen()}>
          <Paperclip size={14} />
          <span className="truncate">{attachment.fileName}</span>
          <span className="text-slate-400">({formatTaskCommentAttachmentSize(attachment.fileSize)})</span>
        </button>
      )}
    </div>
  );
}

function CommentBubble({
  message,
  isMine,
  showSender,
  menuOpen,
  onMenuToggle,
  onReply,
  onEdit,
  onDelete,
  onToggleReaction,
  onImagePreview,
}: {
  message: TaskCommentMessage;
  isMine: boolean;
  showSender: boolean;
  menuOpen: boolean;
  onMenuToggle: () => void;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleReaction: (emoji: string) => void;
  onImagePreview: (preview: ImagePreview) => void;
}) {
  if (message.isDeleted) {
    return (
      <div className={`erp-team-chat-bubble-row ${isMine ? "is-mine" : "is-theirs"}`}>
        <div className={`erp-team-chat-bubble-wrap ${isMine ? "is-mine" : "is-theirs"}`}>
          <div className="erp-team-chat-bubble is-deleted">
            <p className="erp-team-chat-bubble__deleted">{L.deletedMessage}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`erp-team-chat-bubble-row ${isMine ? "is-mine" : "is-theirs"}`}>
      {!isMine ? (
        <div
          className="erp-team-chat-avatar erp-team-chat-msg-avatar"
          style={teamChatAvatarStyle(String(message.userId))}
          aria-hidden="true"
        >
          {teamChatAvatarInitial(message.userName)}
        </div>
      ) : null}
      <div className={`erp-team-chat-bubble-wrap ${isMine ? "is-mine" : "is-theirs"}`}>
        {!isMine && showSender ? (
          <div className="erp-team-chat-bubble__sender">{message.userName}</div>
        ) : null}
        <div className="erp-team-chat-bubble-stack">
          <div className="erp-team-chat-bubble-menu">
            <button
              type="button"
              className="erp-team-chat-bubble-menu__toggle"
              aria-label="메뉴"
              onClick={onMenuToggle}
            >
              <MoreHorizontal size={14} />
            </button>
            {menuOpen ? (
              <div className="erp-team-chat-bubble-menu__panel">
                <div className="erp-team-chat-bubble-menu__reactions" aria-label={L.react}>
                  {TASK_COMMENT_REACTION_OPTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      className={`erp-team-chat-bubble-menu__reaction${
                        message.reactions?.some((row) => row.emoji === emoji && row.reactedByMe) ? " is-active" : ""
                      }`}
                      aria-label={`${L.react} ${emoji}`}
                      onClick={() => onToggleReaction(emoji)}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
                <button type="button" onClick={onReply}>
                  <CornerUpLeft size={13} /> {L.reply}
                </button>
                {isMine ? (
                  <>
                    <button type="button" onClick={onEdit}>
                      <Pencil size={13} /> {L.edit}
                    </button>
                    <button type="button" className="is-danger" onClick={onDelete}>
                      <Trash2 size={13} /> {L.delete}
                    </button>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className={`erp-team-chat-bubble ${isMine ? "is-mine" : "is-theirs"}`}>
            {message.replyTo ? <ReplyQuotePreview replyTo={message.replyTo} /> : null}
            {message.body ? <p className="erp-team-chat-bubble__body">{message.body}</p> : null}
            {message.attachments && message.attachments.length > 0 ? (
              <div className="erp-team-chat-bubble__attachments">
                {message.attachments.map((attachment) => (
                  <AttachmentChip key={attachment.id} attachment={attachment} onImagePreview={onImagePreview} />
                ))}
              </div>
            ) : null}
            <div className="erp-team-chat-bubble__footer">
              <span className="erp-team-chat-bubble__time">
                {formatTaskCommentTime(message.createdAt)}
                {message.editedAt ? ` ${L.edited}` : ""}
              </span>
            </div>
          </div>
          <MessageReactionBar reactions={message.reactions} onToggle={onToggleReaction} />
        </div>
      </div>
    </div>
  );
}

export function TaskCommentThread({ taskId, currentUser, className = "" }: TaskCommentThreadProps) {
  const apiReady = isApiModeEnabled();
  const [messages, setMessages] = useState<TaskCommentMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [draft, setDraft] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [replyTo, setReplyTo] = useState<TaskCommentMessage | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [menuMessageId, setMenuMessageId] = useState<number | null>(null);
  const [imagePreview, setImagePreview] = useState<ImagePreview | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);

  const reload = useCallback(async () => {
    if (!apiReady || !taskId) return;
    setLoading(true);
    try {
      const rows = await loadTaskCommentHistory(taskId, 200);
      setMessages(rows);
    } catch {
      window.alert(L.loadError);
    } finally {
      setLoading(false);
    }
  }, [apiReady, taskId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, taskId]);

  async function uploadFiles(files: File[]) {
    const accepted = files.filter(isTaskCommentAttachmentFile);
    if (!accepted.length) return;
    for (const file of accepted) {
      try {
        const saved = await uploadTaskCommentAttachment(file, taskId);
        let previewUrl: string | null = null;
        if (file.type.startsWith("image/")) {
          previewUrl = URL.createObjectURL(file);
        }
        setPendingAttachments((prev) => [...prev, { ...saved, previewUrl }]);
      } catch {
        window.alert(L.attachError);
      }
    }
  }

  async function handleSend(e?: React.FormEvent) {
    e?.preventDefault();
    if (!apiReady || !currentUser || posting) return;
    if (editingId != null) {
      const body = editDraft.trim();
      if (!body) return;
      setPosting(true);
      try {
        const updated = await editTaskCommentMessage(editingId, body);
        setMessages((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
        setEditingId(null);
        setEditDraft("");
      } catch {
        window.alert(L.sendError);
      } finally {
        setPosting(false);
      }
      return;
    }

    const body = draft.trim();
    if (!body && pendingAttachments.length === 0) return;
    setPosting(true);
    try {
      const message = await sendTaskComment(taskId, body, {
        attachmentIds: pendingAttachments.map((row) => row.id),
        replyToMessageId: replyTo?.id ?? null,
      });
      setMessages((prev) => [...prev, message]);
      setDraft("");
      setReplyTo(null);
      for (const row of pendingAttachments) {
        if (row.previewUrl) URL.revokeObjectURL(row.previewUrl);
      }
      setPendingAttachments([]);
    } catch {
      window.alert(L.sendError);
    } finally {
      setPosting(false);
    }
  }

  async function handleToggleReaction(messageId: number, emoji: string) {
    try {
      const updated = await toggleTaskCommentReaction(messageId, emoji);
      setMessages((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
    } catch {
      window.alert(L.sendError);
    }
  }

  async function handleDelete(messageId: number) {
    if (!window.confirm(L.deleteConfirm)) return;
    try {
      const updated = await deleteTaskCommentMessage(messageId);
      setMessages((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
    } catch {
      window.alert(L.sendError);
    }
  }

  if (!apiReady) {
    return (
      <div className={`rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-xs text-slate-500 ${className}`}>
        {L.offline}
      </div>
    );
  }

  return (
    <section className={`erp-task-comment-thread ${className}`}>
      <div className="erp-task-comment-thread__header">
        <h3 className="text-xs font-semibold text-slate-500">{L.title}</h3>
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" /> : null}
      </div>

      <div
        ref={scrollRef}
        className={`erp-task-comment-thread__messages erp-team-chat-thread__messages${dragOver ? " is-drag-over" : ""}`}
        onDragEnter={(e) => {
          if (!hasDraggedFiles(e.dataTransfer)) return;
          e.preventDefault();
          dragDepthRef.current += 1;
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          if (!hasDraggedFiles(e.dataTransfer)) return;
          e.preventDefault();
          dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
          if (dragDepthRef.current === 0) setDragOver(false);
        }}
        onDragOver={(e) => {
          if (!hasDraggedFiles(e.dataTransfer)) return;
          e.preventDefault();
        }}
        onDrop={(e) => {
          e.preventDefault();
          dragDepthRef.current = 0;
          setDragOver(false);
          void uploadFiles(filterTaskCommentAttachmentFiles(e.dataTransfer.files));
        }}
      >
        {dragOver ? <div className="erp-team-chat-drop-overlay">{L.dropFiles}</div> : null}
        {messages.length === 0 && !loading ? (
          <p className="py-8 text-center text-xs text-slate-400">{L.empty}</p>
        ) : (
          messages.map((message, index) => {
            const prev = index > 0 ? messages[index - 1] : null;
            const isMine = currentUser?.id === message.userId;
            const showSender = !prev || prev.userId !== message.userId;
            if (editingId === message.id) {
              return (
                <div key={message.id} className="erp-task-comment-edit">
                  <textarea
                    className="erp-task-comment-edit__input"
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    rows={3}
                  />
                  <div className="flex justify-end gap-2">
                    <button type="button" className="text-xs text-slate-500" onClick={() => { setEditingId(null); setEditDraft(""); }}>
                      {L.cancelEdit}
                    </button>
                    <button type="button" className="text-xs font-semibold text-teal-700" onClick={() => void handleSend()}>
                      {L.saveEdit}
                    </button>
                  </div>
                </div>
              );
            }
            return (
              <CommentBubble
                key={message.id}
                message={message}
                isMine={isMine}
                showSender={showSender}
                menuOpen={menuMessageId === message.id}
                onMenuToggle={() => setMenuMessageId((prev) => (prev === message.id ? null : message.id))}
                onReply={() => {
                  setMenuMessageId(null);
                  setReplyTo(message);
                }}
                onEdit={() => {
                  setMenuMessageId(null);
                  setEditingId(message.id);
                  setEditDraft(message.body);
                  setReplyTo(null);
                }}
                onDelete={() => {
                  setMenuMessageId(null);
                  void handleDelete(message.id);
                }}
                onToggleReaction={(emoji) => {
                  setMenuMessageId(null);
                  void handleToggleReaction(message.id, emoji);
                }}
                onImagePreview={setImagePreview}
              />
            );
          })
        )}
      </div>

      {replyTo ? (
        <div className="erp-team-chat-composer__reply px-3 pb-2">
          <div className="erp-team-chat-composer__reply-inner">
            <span className="erp-team-chat-composer__reply-label">{L.replyTo}</span>
            <ReplyQuotePreview
              replyTo={{
                id: replyTo.id,
                userName: replyTo.userName,
                body: replyTo.isDeleted ? "" : replyTo.body,
                deleted: replyTo.isDeleted,
              }}
            />
          </div>
          <button type="button" className="erp-team-chat-composer__remove-link" onClick={() => setReplyTo(null)}>
            {L.cancelReply}
          </button>
        </div>
      ) : null}

      {pendingAttachments.length > 0 ? (
        <div className="erp-team-chat-composer__pending-files px-3 pb-2">
          {pendingAttachments.map((row) => (
            <div key={row.id} className="erp-team-chat-composer__pending-file">
              {row.previewUrl ? (
                <img src={row.previewUrl} alt={row.fileName} className="erp-team-chat-composer__pending-thumb" />
              ) : (
                <span className="text-[10px] text-slate-600">{row.fileName}</span>
              )}
              <button
                type="button"
                className="erp-team-chat-composer__pending-remove"
                onClick={() => {
                  if (row.previewUrl) URL.revokeObjectURL(row.previewUrl);
                  setPendingAttachments((prev) => prev.filter((item) => item.id !== row.id));
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <form className="erp-team-chat-composer erp-task-comment-composer" onSubmit={(e) => void handleSend(e)}>
        <input
          ref={fileInputRef}
          type="file"
          accept={TASK_COMMENT_ATTACHMENT_ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => {
            void uploadFiles(filterTaskCommentAttachmentFiles(e.target.files));
            e.target.value = "";
          }}
        />
        <button
          type="button"
          className="erp-team-chat-composer__attach"
          aria-label="첨부"
          disabled={posting || !currentUser}
          onClick={() => fileInputRef.current?.click()}
        >
          <ImagePlus size={18} />
        </button>
        <textarea
          className="erp-team-chat-composer__input"
          placeholder={L.placeholder}
          value={draft}
          disabled={posting || !currentUser || editingId != null}
          rows={1}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
        />
        <button
          type="submit"
          className="erp-team-chat-composer__send"
          disabled={posting || !currentUser || (!draft.trim() && pendingAttachments.length === 0 && editingId == null)}
          aria-label={posting ? L.sending : L.send}
        >
          {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send size={18} />}
        </button>
      </form>

      <ImagePreviewModal preview={imagePreview} onClose={() => setImagePreview(null)} />
    </section>
  );
}
