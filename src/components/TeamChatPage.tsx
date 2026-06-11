import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ExternalLink, MessageCircle, Paperclip, Plus, Search, Send, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ErpUser } from "@/utils/erpApi";
import type { ErpChatAction } from "@/utils/erpChatApi";
import {
  downloadTeamChatAttachmentBlob,
  fetchTeamChatAttachmentBlob,
  formatTeamChatAttachmentSize,
  isTeamChatImageMimeType,
  uploadTeamChatAttachment,
  type TeamChatAttachment,
} from "@/utils/teamChatAttachments";
import { TEAM_CHAT_LINK_LABELS, teamChatLinkToAction, type TeamChatLink } from "@/utils/teamChatLinks";
import { consumeTeamChatShare, TEAM_CHAT_SHARE_CHANNEL } from "@/utils/teamChatShare";
import { openTeamChatPopup } from "@/utils/teamChatPopup";
import {
  fetchTeamChatMessages,
  formatTeamChatTime,
  listTeamChatChannels,
  listTeamChatUsers,
  loadTeamChatHistory,
  markTeamChatChannelRead,
  openTeamChatDm,
  sendTeamChatMessage,
  type TeamChatChannel,
  type TeamChatMessage,
  type TeamChatUser,
} from "@/utils/teamChat";

const L = {
  title: "\uC0AC\uB0B4 \uCC57",
  teamSection: "\uC804\uCCB4",
  dmSection: "1:1",
  newDm: "\uC0C8 \uB300\uD654",
  pickUser: "\uB300\uD654\uD560 \uC9F1\uC6D0 \uC120\uD0DD",
  searchUser: "\uC774\uB984 \uAC80\uC0C9",
  emptyChannels: "\uC544\uC9C1 1:1 \uB300\uD654\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.",
  emptyMessages: "\uCCAB \uBA54\uC2DC\uC9C0\uB97C \uBCF4\uB0B4 \uBCF4\uC138\uC694.",
  placeholder: "\uBA54\uC2DC\uC9C0 \uC785\uB825",
  send: "\uC804\uC1A1",
  sending: "\uC804\uC1A1 \uC911\u2026",
  back: "\uBAA9\uB85D",
  loadError: "\uCC57\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.",
  sendError: "\uBA54\uC2DC\uC9C0 \uC804\uC1A1\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.",
  attachError: "\uCCA8\uBD80\uD30C\uC77C \uC5C5\uB85C\uB4DC\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.",
  noPreview: "\uB300\uD654 \uC5C6\uC74C",
  loading: "\uBD88\uB7EC\uC624\uB294 \uC911\u2026",
  pickChannelHint: "\uB300\uD654\uBC29\uC744 \uC120\uD0DD\uD558\uAC70\uB098 \uC0C8 1:1 \uB300\uD654\uB97C \uC2DC\uC791\uD558\uC138\uC694.",
  teamChannelLabel: "\uC804\uCCB4 \uB2E8\uD1A1",
  dmChannelLabel: "1:1 \uB300\uD654",
  attach: "\uCCA8\uBD80",
  removeLink: "\uB9C1\uD06C \uC81C\uAC70",
  openLink: "\uC774\uB3D9",
  fileDownloadError: "\uD30C\uC77C\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.",
  openPopup: "\uBCC4\uB3C4 \uCC3D",
};

type PendingAttachment = TeamChatAttachment & { previewUrl?: string | null };

type TeamChatPageProps = {
  currentUser: ErpUser | null;
  isPageActive?: boolean;
  standalone?: boolean;
  onUnreadChange?: () => void;
  onErpAction?: (action: ErpChatAction) => void;
};

function ChannelListItem({
  channel,
  active,
  onSelect,
}: {
  channel: TeamChatChannel;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`erp-team-chat-channel ${active ? "is-active" : ""}`}
      onClick={onSelect}
    >
      <div className="erp-team-chat-channel__icon" aria-hidden="true">
        {channel.type === "team" ? <Users size={18} /> : <MessageCircle size={18} />}
      </div>
      <div className="erp-team-chat-channel__main">
        <div className="erp-team-chat-channel__head">
          <span className="erp-team-chat-channel__title">{channel.title}</span>
          {channel.lastMessageAt ? (
            <span className="erp-team-chat-channel__time">{formatTeamChatTime(channel.lastMessageAt)}</span>
          ) : null}
        </div>
        <div className="erp-team-chat-channel__preview">
          {channel.lastMessagePreview
            ? `${channel.lastMessageUserName ? `${channel.lastMessageUserName}: ` : ""}${channel.lastMessagePreview}`
            : L.noPreview}
        </div>
      </div>
      {channel.unreadCount > 0 ? (
        <span className="erp-team-chat-channel__badge">{channel.unreadCount > 99 ? "99+" : channel.unreadCount}</span>
      ) : null}
    </button>
  );
}

function MessageAttachmentChip({ attachment }: { attachment: TeamChatAttachment }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isTeamChatImageMimeType(attachment.mimeType)) return;
    let cancelled = false;
    let objectUrl = "";
    void (async () => {
      try {
        const blob = await fetchTeamChatAttachmentBlob(attachment.id);
        if (cancelled || !blob) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      } catch {
        // ignore preview errors
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachment.id, attachment.mimeType]);

  const handleDownload = async () => {
    try {
      const blob = await fetchTeamChatAttachmentBlob(attachment.id);
      if (blob) downloadTeamChatAttachmentBlob(blob, attachment.fileName);
    } catch {
      window.alert(L.fileDownloadError);
    }
  };

  return (
    <div className="erp-team-chat-attachment-chip">
      {url ? (
        <button type="button" className="erp-team-chat-attachment-thumb" onClick={() => void handleDownload()} title={attachment.fileName}>
          <img src={url} alt={attachment.fileName} />
        </button>
      ) : (
        <button type="button" className="erp-team-chat-attachment-file" onClick={() => void handleDownload()}>
          <Paperclip size={14} />
          <span className="truncate">{attachment.fileName}</span>
          <span className="text-slate-400">({formatTeamChatAttachmentSize(attachment.fileSize)})</span>
        </button>
      )}
    </div>
  );
}

function MessageLinkCard({
  link,
  onOpen,
}: {
  link: TeamChatLink;
  onOpen: (link: TeamChatLink) => void;
}) {
  const typeLabel = TEAM_CHAT_LINK_LABELS[link.type as keyof typeof TEAM_CHAT_LINK_LABELS] || link.type;
  return (
    <button type="button" className="erp-team-chat-link-card" onClick={() => onOpen(link)}>
      <span className="erp-team-chat-link-card__type">{typeLabel}</span>
      <span className="erp-team-chat-link-card__label">{link.label}</span>
      <span className="erp-team-chat-link-card__action">{L.openLink}</span>
    </button>
  );
}

export const TeamChatPage = memo(function TeamChatPage({
  currentUser,
  isPageActive = true,
  standalone = false,
  onUnreadChange,
  onErpAction,
}: TeamChatPageProps) {
  const [channels, setChannels] = useState<TeamChatChannel[]>([]);
  const [users, setUsers] = useState<TeamChatUser[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [messages, setMessages] = useState<TeamChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [pendingLink, setPendingLink] = useState<TeamChatLink | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [userQuery, setUserQuery] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastMessageIdRef = useRef(0);
  const shareAppliedRef = useRef(false);

  const selectedChannel = useMemo(
    () => channels.find((row) => row.id === selectedChannelId) || null,
    [channels, selectedChannelId],
  );

  const teamChannels = useMemo(() => channels.filter((row) => row.type === "team"), [channels]);
  const dmChannels = useMemo(() => channels.filter((row) => row.type === "dm"), [channels]);

  const filteredUsers = useMemo(() => {
    const q = userQuery.trim().toLowerCase();
    if (!q) return users;
    return users.filter((row) => {
      const name = String(row.name || "").toLowerCase();
      const loginId = String(row.loginId || "").toLowerCase();
      return name.includes(q) || loginId.includes(q);
    });
  }, [userQuery, users]);

  const scrollToBottom = useCallback(() => {
    const node = listRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, []);

  const refreshChannels = useCallback(async () => {
    const rows = await listTeamChatChannels();
    setChannels(rows);
    return rows;
  }, []);

  const applyPendingShare = useCallback((channelRows: TeamChatChannel[]) => {
    if (shareAppliedRef.current) return;
    const payload = consumeTeamChatShare();
    if (!payload) return;
    shareAppliedRef.current = true;
    if (payload.body) setDraft(payload.body);
    if (payload.link) setPendingLink(payload.link);
    if (payload.channelId && channelRows.some((row) => row.id === payload.channelId)) {
      setSelectedChannelId(payload.channelId);
    }
  }, []);

  const handleIncomingShare = useCallback(() => {
    shareAppliedRef.current = false;
    void refreshChannels().then((rows) => applyPendingShare(rows));
  }, [applyPendingShare, refreshChannels]);

  const loadInitialMessages = useCallback(async (channelId: string) => {
    const rows = await loadTeamChatHistory(channelId, 120);
    setMessages(rows);
    const lastId = rows.length ? rows[rows.length - 1].id : 0;
    lastMessageIdRef.current = lastId;
    if (lastId > 0) {
      await markTeamChatChannelRead(channelId, lastId);
      onUnreadChange?.();
    }
    window.requestAnimationFrame(scrollToBottom);
  }, [onUnreadChange, scrollToBottom]);

  const pollMessages = useCallback(async (channelId: string) => {
    const afterId = lastMessageIdRef.current;
    const rows = await fetchTeamChatMessages(channelId, { afterId, limit: 100 });
    if (!rows.length) return;
    setMessages((prev) => {
      const seen = new Set(prev.map((row) => row.id));
      const next = [...prev];
      for (const row of rows) {
        if (!seen.has(row.id)) next.push(row);
      }
      return next;
    });
    const lastId = rows[rows.length - 1].id;
    lastMessageIdRef.current = lastId;
    await markTeamChatChannelRead(channelId, lastId);
    onUnreadChange?.();
    window.requestAnimationFrame(scrollToBottom);
  }, [onUnreadChange, scrollToBottom]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError("");
      try {
        const [channelRows, userRows] = await Promise.all([listTeamChatChannels(), listTeamChatUsers()]);
        if (cancelled) return;
        setChannels(channelRows);
        setUsers(userRows);
        applyPendingShare(channelRows);
      } catch {
        if (!cancelled) setError(L.loadError);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyPendingShare]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(TEAM_CHAT_SHARE_CHANNEL);
      channel.onmessage = () => handleIncomingShare();
    } catch {
      // ignore
    }
    return () => {
      channel?.close();
    };
  }, [handleIncomingShare]);

  useEffect(() => {
    if (!selectedChannelId && channels.length) {
      const team = channels.find((row) => row.type === "team");
      if (team) setSelectedChannelId(team.id);
    }
  }, [channels, selectedChannelId]);

  useEffect(() => {
    if (!selectedChannelId) {
      setMessages([]);
      lastMessageIdRef.current = 0;
      return;
    }
    let cancelled = false;
    void (async () => {
      setError("");
      try {
        await loadInitialMessages(selectedChannelId);
        if (!cancelled) await refreshChannels();
      } catch {
        if (!cancelled) setError(L.loadError);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadInitialMessages, refreshChannels, selectedChannelId]);

  useEffect(() => {
    if (!selectedChannelId || !isPageActive) return;
    const timer = window.setInterval(() => {
      void pollMessages(selectedChannelId).catch(() => {});
      void refreshChannels().catch(() => {});
    }, 5000);
    return () => window.clearInterval(timer);
  }, [isPageActive, pollMessages, refreshChannels, selectedChannelId]);

  useEffect(() => {
    return () => {
      for (const row of pendingAttachments) {
        if (row.previewUrl) URL.revokeObjectURL(row.previewUrl);
      }
    };
  }, [pendingAttachments]);

  const handleSelectChannel = useCallback((channelId: string) => {
    setSelectedChannelId(channelId);
    setDraft("");
    setPendingLink(null);
    setPendingAttachments([]);
    setPickerOpen(false);
  }, []);

  const handleStartDm = useCallback(
    async (otherUserId: number) => {
      setError("");
      try {
        const channel = await openTeamChatDm(otherUserId);
        const rows = await refreshChannels();
        const resolved = rows.find((row) => row.id === channel.id) || channel;
        setChannels((prev) => {
          if (prev.some((row) => row.id === resolved.id)) {
            return prev.map((row) => (row.id === resolved.id ? resolved : row));
          }
          return [resolved, ...prev];
        });
        setPickerOpen(false);
        setUserQuery("");
        handleSelectChannel(resolved.id);
      } catch {
        setError(L.loadError);
      }
    },
    [handleSelectChannel, refreshChannels],
  );

  const handlePickFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!selectedChannelId || !fileList?.length || uploading) return;
      setUploading(true);
      setError("");
      try {
        const next: PendingAttachment[] = [];
        for (const file of Array.from(fileList)) {
          const saved = await uploadTeamChatAttachment(file, selectedChannelId);
          const previewUrl = isTeamChatImageMimeType(saved.mimeType) ? URL.createObjectURL(file) : null;
          next.push({ ...saved, previewUrl });
        }
        setPendingAttachments((prev) => [...prev, ...next]);
      } catch {
        setError(L.attachError);
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [selectedChannelId, uploading],
  );

  const removePendingAttachment = useCallback((id: string) => {
    setPendingAttachments((prev) => {
      const target = prev.find((row) => row.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((row) => row.id !== id);
    });
  }, []);

  const handleOpenLink = useCallback(
    (link: TeamChatLink) => {
      const action = teamChatLinkToAction(link);
      if (action) onErpAction?.(action);
    },
    [onErpAction],
  );

  const canSend =
    Boolean(selectedChannelId) &&
    !sending &&
    !uploading &&
    (draft.trim().length > 0 || pendingLink || pendingAttachments.length > 0);

  const handleSend = useCallback(async () => {
    if (!selectedChannelId || !canSend) return;
    const body = draft.trim();
    const attachmentIds = pendingAttachments.map((row) => row.id);
    setSending(true);
    setError("");
    try {
      const message = await sendTeamChatMessage(selectedChannelId, body, {
        link: pendingLink,
        attachmentIds,
      });
      setDraft("");
      setPendingLink(null);
      for (const row of pendingAttachments) {
        if (row.previewUrl) URL.revokeObjectURL(row.previewUrl);
      }
      setPendingAttachments([]);
      setMessages((prev) => [...prev, message]);
      lastMessageIdRef.current = message.id;
      await refreshChannels();
      onUnreadChange?.();
      window.requestAnimationFrame(scrollToBottom);
    } catch {
      setError(L.sendError);
    } finally {
      setSending(false);
    }
  }, [canSend, draft, onUnreadChange, pendingAttachments, pendingLink, refreshChannels, scrollToBottom, selectedChannelId, sending]);

  const showThreadOnMobile = Boolean(selectedChannelId);
  const selfId = Number(currentUser?.id) || 0;

  return (
    <div className={`erp-team-chat-page ${standalone ? "erp-team-chat-page--standalone" : ""} ${showThreadOnMobile ? "is-thread-open" : ""}`}>
      <aside className={`erp-team-chat-sidebar ${showThreadOnMobile ? "is-hidden-mobile" : ""}`}>
        <div className="erp-team-chat-sidebar__head">
          <h1 className="erp-team-chat-sidebar__title">{L.title}</h1>
          <div className="flex items-center gap-1">
            {!standalone ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 rounded-lg gap-1 px-2"
                onClick={() => openTeamChatPopup()}
                title={L.openPopup}
              >
                <ExternalLink size={14} />
                <span className="hidden sm:inline">{L.openPopup}</span>
              </Button>
            ) : null}
            <Button type="button" size="sm" variant="outline" className="h-8 rounded-lg gap-1" onClick={() => setPickerOpen(true)}>
              <Plus size={14} />
              {L.newDm}
            </Button>
          </div>
        </div>

        {loading ? <p className="erp-team-chat-muted px-4 py-6 text-sm">{L.loading}</p> : null}
        {error && !selectedChannelId ? <p className="erp-team-chat-error px-4 py-2 text-sm">{error}</p> : null}

        <div className="erp-team-chat-sidebar__sections">
          {teamChannels.length ? (
            <section>
              <h2 className="erp-team-chat-section-title">{L.teamSection}</h2>
              {teamChannels.map((channel) => (
                <ChannelListItem
                  key={channel.id}
                  channel={channel}
                  active={channel.id === selectedChannelId}
                  onSelect={() => handleSelectChannel(channel.id)}
                />
              ))}
            </section>
          ) : null}

          <section>
            <h2 className="erp-team-chat-section-title">{L.dmSection}</h2>
            {dmChannels.length ? (
              dmChannels.map((channel) => (
                <ChannelListItem
                  key={channel.id}
                  channel={channel}
                  active={channel.id === selectedChannelId}
                  onSelect={() => handleSelectChannel(channel.id)}
                />
              ))
            ) : (
              <p className="erp-team-chat-muted px-4 py-3 text-sm">{L.emptyChannels}</p>
            )}
          </section>
        </div>
      </aside>

      <section className={`erp-team-chat-thread ${selectedChannelId ? "is-open" : ""}`}>
        {!selectedChannel ? (
          <div className="erp-team-chat-thread__empty">
            <MessageCircle size={40} className="text-slate-300" />
            <p className="mt-3 text-sm text-slate-500">{L.pickChannelHint}</p>
          </div>
        ) : (
          <>
            <div className="erp-team-chat-thread__head">
              <button
                type="button"
                className="erp-team-chat-back lg:hidden"
                onClick={() => setSelectedChannelId(null)}
              >
                <ArrowLeft size={18} />
                {L.back}
              </button>
              <div className="min-w-0">
                <h2 className="truncate text-base font-bold text-slate-900">{selectedChannel.title}</h2>
                <p className="text-xs text-slate-500">
                  {selectedChannel.type === "team" ? L.teamChannelLabel : L.dmChannelLabel}
                </p>
              </div>
            </div>

            <div ref={listRef} className="erp-team-chat-thread__messages">
              {!messages.length ? <p className="erp-team-chat-muted text-center text-sm">{L.emptyMessages}</p> : null}
              {messages.map((message) => {
                const isMine = Number(message.userId) === selfId;
                const link = message.link as TeamChatLink | null | undefined;
                return (
                  <div
                    key={message.id}
                    className={`erp-team-chat-bubble-row ${isMine ? "is-mine" : "is-theirs"}`}
                  >
                    <div className={`erp-team-chat-bubble ${isMine ? "is-mine" : "is-theirs"}`}>
                      <div className="erp-team-chat-bubble__meta">
                        {message.userName}
                        {" \u00B7 "}
                        {formatTeamChatTime(message.createdAt)}
                      </div>
                      {link?.type && link?.id ? (
                        <MessageLinkCard link={link} onOpen={handleOpenLink} />
                      ) : null}
                      {message.body ? <div className="erp-team-chat-bubble__body">{message.body}</div> : null}
                      {message.attachments?.length ? (
                        <div className="erp-team-chat-bubble__attachments">
                          {message.attachments.map((attachment) => (
                            <MessageAttachmentChip key={attachment.id} attachment={attachment} />
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>

            {error ? <p className="erp-team-chat-error px-4 py-1 text-sm">{error}</p> : null}

            {pendingLink ? (
              <div className="erp-team-chat-composer__pending-link px-4 pb-2">
                <MessageLinkCard link={pendingLink} onOpen={handleOpenLink} />
                <button type="button" className="erp-team-chat-composer__remove-link" onClick={() => setPendingLink(null)}>
                  {L.removeLink}
                </button>
              </div>
            ) : null}

            {pendingAttachments.length ? (
              <div className="erp-team-chat-composer__pending-files px-4 pb-2">
                {pendingAttachments.map((attachment) => (
                  <div key={attachment.id} className="erp-team-chat-composer__pending-file">
                    {attachment.previewUrl ? (
                      <img src={attachment.previewUrl} alt={attachment.fileName} className="erp-team-chat-composer__pending-thumb" />
                    ) : (
                      <span className="truncate text-xs">{attachment.fileName}</span>
                    )}
                    <button type="button" className="erp-team-chat-composer__pending-remove" onClick={() => removePendingAttachment(attachment.id)}>
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            <form
              className="erp-team-chat-composer"
              onSubmit={(event) => {
                event.preventDefault();
                void handleSend();
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                multiple
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.txt"
                capture="environment"
                onChange={(event) => void handlePickFiles(event.target.files)}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-10 rounded-xl px-3"
                disabled={uploading || sending}
                onClick={() => fileInputRef.current?.click()}
                title={L.attach}
              >
                <Paperclip size={16} />
              </Button>
              <textarea
                className="erp-team-chat-composer__input"
                rows={1}
                value={draft}
                placeholder={L.placeholder}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void handleSend();
                  }
                }}
              />
              <Button type="submit" size="sm" className="h-10 rounded-xl px-4" disabled={!canSend}>
                <Send size={16} className="mr-1" />
                {sending ? L.sending : L.send}
              </Button>
            </form>
          </>
        )}
      </section>

      {pickerOpen ? (
        <div className="erp-ledger-modal-backdrop" onClick={() => setPickerOpen(false)}>
          <div
            className="erp-ledger-modal max-w-md"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={L.pickUser}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">{L.pickUser}</h2>
                <p className="mt-1 text-sm text-slate-500">{L.searchUser}</p>
              </div>
              <button type="button" className="rounded-xl p-2 text-slate-500 hover:bg-slate-100" onClick={() => setPickerOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <label className="mb-3 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <Search size={16} className="text-slate-400" />
              <input
                className="w-full bg-transparent text-sm outline-none"
                value={userQuery}
                onChange={(event) => setUserQuery(event.target.value)}
                placeholder={L.searchUser}
              />
            </label>
            <ul className="max-h-[min(24rem,50vh)] space-y-1 overflow-y-auto">
              {filteredUsers.map((user) => (
                <li key={user.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left hover:bg-slate-50"
                    onClick={() => void handleStartDm(user.id)}
                  >
                    <span className="font-semibold text-slate-900">{user.name}</span>
                    <span className="text-xs text-slate-500">{user.loginId || user.role}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
});
