import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  CornerUpLeft,
  ExternalLink,
  MessageCircle,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Plus,
  Search,
  Send,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ErpUser } from "@/utils/erpApi";
import type { ErpChatAction } from "@/utils/erpChatApi";
import { useTeamChatEvents, type TeamChatStreamEvent } from "@/hooks/useTeamChatEvents";
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
  createTeamChatGroup,
  deleteTeamChatMessage,
  editTeamChatMessage,
  fetchTeamChatMessages,
  formatTeamChatTime,
  fetchTeamChatReadState,
  listTeamChatChannels,
  listTeamChatUsers,
  loadTeamChatHistory,
  markTeamChatChannelRead,
  openTeamChatDm,
  searchTeamChatMessages,
  sendTeamChatMessage,
  type TeamChatChannel,
  type TeamChatMessage,
  type TeamChatReplyPreview,
  type TeamChatUser,
} from "@/utils/teamChat";
import { formatTeamChatReadReceiptCompact, type TeamChatReadStateMember } from "@/utils/teamChatReadReceipts";
import {
  sortTeamChatChannels,
  teamChatAvatarInitial,
  teamChatAvatarStyle,
  teamChatChannelAvatarLabel,
} from "@/utils/teamChatUi";

const L = {
  title: "\uC0AC\uB0B4 \uCC57",
  teamSection: "\uC804\uCCB4",
  groupSection: "\uADF8\uB8F9",
  dmSection: "1:1",
  newDm: "\uC0C8 \uB300\uD654",
  newGroup: "\uADF8\uB8F9",
  pickUser: "\uB300\uD654\uD560 \uC9F1\uC6D0 \uC120\uD0DD",
  createGroup: "\uADF8\uB8F9 \uBC29 \uB9CC\uB4E4\uAE30",
  groupTitle: "\uADF8\uB8F9 \uBC29 \uC774\uB984",
  groupMembers: "\uBA64\uBC84 \uC120\uD0DD",
  groupCreate: "\uC0DD\uC131",
  searchUser: "\uC774\uB984 \uAC80\uC0C9",
  searchMessages: "\uBA54\uC2DC\uC9C0 \uAC80\uC0C9",
  searchPlaceholder: "\uAC80\uC0C9\uC5B4 \uC785\uB825",
  searchEmpty: "\uAC80\uC0C9 \uACB0\uACFC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.",
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
  pickChannelHint: "\uB300\uD654\uBC29\uC744 \uC120\uD0DD\uD558\uAC70\uB098 \uC0C8 \uB300\uD654\uB97C \uC2DC\uC791\uD558\uC138\uC694.",
  teamChannelLabel: "\uC804\uCCB4 \uB2E8\uD1A1",
  groupChannelLabel: "\uADF8\uB8F9 \uCC44\uB110",
  dmChannelLabel: "1:1 \uB300\uD654",
  attach: "\uCCA8\uBD80",
  removeLink: "\uB9C1\uD06C \uC81C\uAC70",
  openLink: "\uC774\uB3D9",
  fileDownloadError: "\uD30C\uC77C\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.",
  openPopup: "\uBCC4\uB3C4 \uCC3D",
  deletedMessage: "\uC0AD\uC81C\uB41C \uBA54\uC2DC\uC9C0\uC785\uB2C8\uB2E4.",
  edited: "(\uC218\uC815\uB428)",
  reply: "\uB2F5\uC7A5",
  edit: "\uC218\uC815",
  delete: "\uC0AD\uC81C",
  cancelEdit: "\uCDE8\uC18C",
  saveEdit: "\uC800\uC7A5",
  replyTo: "\uB2F5\uC7A5 \uC911",
  cancelReply: "\uCDE8\uC18C",
  deleteConfirm: "\uC774 \uBA54\uC2DC\uC9C0\uB97C \uC0AD\uC81C\uD560\uAE4C\uC694?",
  unread: "\uBBF8\uC77D\uC74C",
};

type PendingAttachment = TeamChatAttachment & { previewUrl?: string | null };

type TeamChatPageProps = {
  currentUser: ErpUser | null;
  isPageActive?: boolean;
  standalone?: boolean;
  onUnreadChange?: () => void;
  onErpAction?: (action: ErpChatAction) => void;
};

function channelTypeLabel(type: TeamChatChannel["type"]) {
  if (type === "team") return L.teamChannelLabel;
  if (type === "group") return L.groupChannelLabel;
  return L.dmChannelLabel;
}

function ChannelListItem({
  channel,
  active,
  onSelect,
}: {
  channel: TeamChatChannel;
  active: boolean;
  onSelect: (channelId: string) => void;
}) {
  const avatarLabel = teamChatChannelAvatarLabel(channel);
  const avatarStyle = teamChatAvatarStyle(channel.id || channel.title);
  return (
    <button
      type="button"
      className={`erp-team-chat-channel ${active ? "is-active" : ""}`}
      onClick={() => onSelect(channel.id)}
    >
      <div className="erp-team-chat-avatar erp-team-chat-channel__avatar" style={avatarStyle} aria-hidden="true">
        {avatarLabel}
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

function ReplyQuotePreview({ replyTo }: { replyTo: TeamChatReplyPreview }) {
  const body = replyTo.deleted
    ? L.deletedMessage
    : replyTo.body || "\u2026";
  return (
    <div className="erp-team-chat-reply-quote">
      <span className="erp-team-chat-reply-quote__author">{replyTo.userName}</span>
      <span className="erp-team-chat-reply-quote__body">{body}</span>
    </div>
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
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [userQuery, setUserQuery] = useState("");
  const [groupTitle, setGroupTitle] = useState("");
  const [groupMemberIds, setGroupMemberIds] = useState<number[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<TeamChatMessage[]>([]);
  const [searching, setSearching] = useState(false);
  const [replyingTo, setReplyingTo] = useState<TeamChatMessage | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [menuMessageId, setMenuMessageId] = useState<number | null>(null);
  const [readState, setReadState] = useState<TeamChatReadStateMember[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastMessageIdRef = useRef(0);
  const selectedChannelIdRef = useRef<string | null>(null);
  const shareAppliedRef = useRef(false);
  const onUnreadChangeRef = useRef(onUnreadChange);

  selectedChannelIdRef.current = selectedChannelId;
  onUnreadChangeRef.current = onUnreadChange;

  const selectedChannel = useMemo(
    () => channels.find((row) => row.id === selectedChannelId) || null,
    [channels, selectedChannelId],
  );

  const sortedChannels = useMemo(() => sortTeamChatChannels(channels), [channels]);
  const showSenderNames = selectedChannel?.type === "team" || selectedChannel?.type === "group";

  const channelTitleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of channels) map.set(row.id, row.title);
    return map;
  }, [channels]);

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

  const mergeMessage = useCallback((incoming: TeamChatMessage) => {
    setMessages((prev) => {
      const index = prev.findIndex((row) => row.id === incoming.id);
      if (index >= 0) {
        const next = [...prev];
        next[index] = incoming;
        return next;
      }
      return [...prev, incoming];
    });
    if (incoming.id > lastMessageIdRef.current) {
      lastMessageIdRef.current = incoming.id;
    }
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
      onUnreadChangeRef.current?.();
    }
    window.requestAnimationFrame(scrollToBottom);
  }, [scrollToBottom]);

  const pollMessages = useCallback(async (channelId: string) => {
    const afterId = lastMessageIdRef.current;
    const rows = await fetchTeamChatMessages(channelId, { afterId, limit: 100 });
    if (rows.length) {
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
      onUnreadChangeRef.current?.();
      window.requestAnimationFrame(scrollToBottom);
    }
    await refreshChannels();
  }, [refreshChannels, scrollToBottom]);

  const refreshReadState = useCallback(async (channelId: string) => {
    try {
      setReadState(await fetchTeamChatReadState(channelId));
    } catch {
      setReadState([]);
    }
  }, []);

  const handleStreamEvent = useCallback(
    (event: TeamChatStreamEvent) => {
      if (event.type === "read.updated" && event.channelId === selectedChannelIdRef.current) {
        setReadState((prev) => {
          const userId = Number(event.userId);
          const lastReadMessageId = Number(event.lastReadMessageId) || 0;
          const index = prev.findIndex((row) => row.userId === userId);
          if (index >= 0) {
            const next = [...prev];
            next[index] = { ...next[index], lastReadMessageId };
            return next;
          }
          return [...prev, { userId, userName: `\uC0AC\uC6A9\uC790 #${userId}`, lastReadMessageId }];
        });
        return;
      }
      if (event.type === "channel.updated") {
        void refreshChannels();
        return;
      }
      const message = event.message as TeamChatMessage | undefined;
      if (!message?.id) return;
      if (event.type === "message.new") {
        if (String(message.channelId) === String(selectedChannelIdRef.current)) {
          mergeMessage(message);
          void markTeamChatChannelRead(message.channelId, message.id);
          window.requestAnimationFrame(scrollToBottom);
        }
        void refreshChannels();
        onUnreadChangeRef.current?.();
        return;
      }
      if (event.type === "message.updated" || event.type === "message.deleted") {
        if (String(message.channelId) === String(selectedChannelIdRef.current)) {
          mergeMessage(message);
        }
        void refreshChannels();
      }
    },
    [mergeMessage, refreshChannels, scrollToBottom],
  );

  const { connected: sseConnected } = useTeamChatEvents({
    enabled: isPageActive,
    onEvent: handleStreamEvent,
  });

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
      setReadState([]);
      lastMessageIdRef.current = 0;
      return;
    }
    let cancelled = false;
    const channelId = selectedChannelId;
    void (async () => {
      setError("");
      setReplyingTo(null);
      setEditingMessageId(null);
      setMenuMessageId(null);
      try {
        await loadInitialMessages(channelId);
        if (!cancelled) {
          await refreshChannels();
          await refreshReadState(channelId);
        }
      } catch {
        if (!cancelled) setError(L.loadError);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Only reload thread when the selected channel changes, not when parent re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChannelId]);

  useEffect(() => {
    if (!selectedChannelId || !isPageActive) return;
    const intervalMs = sseConnected ? 30000 : 5000;
    const timer = window.setInterval(() => {
      void pollMessages(selectedChannelId).catch(() => {});
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [isPageActive, pollMessages, selectedChannelId, sseConnected]);

  useEffect(() => {
    return () => {
      for (const row of pendingAttachments) {
        if (row.previewUrl) URL.revokeObjectURL(row.previewUrl);
      }
    };
  }, [pendingAttachments]);

  const resetComposerExtras = useCallback(() => {
    setReplyingTo(null);
    setEditingMessageId(null);
    setEditDraft("");
    setMenuMessageId(null);
  }, []);

  const handleSelectChannel = useCallback((channelId: string) => {
    if (channelId === selectedChannelIdRef.current) return;
    setSelectedChannelId(channelId);
    setDraft("");
    setPendingLink(null);
    setPendingAttachments([]);
    setPickerOpen(false);
    resetComposerExtras();
  }, [resetComposerExtras]);

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

  const handleCreateGroup = useCallback(async () => {
    const title = groupTitle.trim();
    if (!title || groupMemberIds.length < 1) return;
    setError("");
    try {
      const channel = await createTeamChatGroup(title, groupMemberIds);
      await refreshChannels();
      setGroupModalOpen(false);
      setGroupTitle("");
      setGroupMemberIds([]);
      setUserQuery("");
      handleSelectChannel(channel.id);
    } catch {
      setError(L.loadError);
    }
  }, [groupMemberIds, groupTitle, handleSelectChannel, refreshChannels]);

  const toggleGroupMember = useCallback((userId: number) => {
    setGroupMemberIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  }, []);

  const runMessageSearch = useCallback(async () => {
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const rows = await searchTeamChatMessages(q, 40);
      setSearchResults(rows);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, [searchQuery]);

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

  const handleReply = useCallback((message: TeamChatMessage) => {
    setReplyingTo(message);
    setEditingMessageId(null);
    setEditDraft("");
    setMenuMessageId(null);
  }, []);

  const handleStartEdit = useCallback((message: TeamChatMessage) => {
    setEditingMessageId(message.id);
    setEditDraft(message.body);
    setReplyingTo(null);
    setMenuMessageId(null);
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editingMessageId) return;
    const body = editDraft.trim();
    if (!body) return;
    setSending(true);
    setError("");
    try {
      const updated = await editTeamChatMessage(editingMessageId, body);
      mergeMessage(updated);
      setEditingMessageId(null);
      setEditDraft("");
      await refreshChannels();
    } catch {
      setError(L.sendError);
    } finally {
      setSending(false);
    }
  }, [editDraft, editingMessageId, mergeMessage, refreshChannels]);

  const handleDeleteMessage = useCallback(
    async (messageId: number) => {
      if (!window.confirm(L.deleteConfirm)) return;
      setError("");
      try {
        const updated = await deleteTeamChatMessage(messageId);
        mergeMessage(updated);
        setMenuMessageId(null);
        await refreshChannels();
      } catch {
        setError(L.sendError);
      }
    },
    [mergeMessage, refreshChannels],
  );

  const canSend =
    Boolean(selectedChannelId) &&
    !sending &&
    !uploading &&
    !editingMessageId &&
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
        replyToMessageId: replyingTo?.id ?? null,
      });
      setDraft("");
      setPendingLink(null);
      setReplyingTo(null);
      for (const row of pendingAttachments) {
        if (row.previewUrl) URL.revokeObjectURL(row.previewUrl);
      }
      setPendingAttachments([]);
      mergeMessage(message);
      await refreshChannels();
      await refreshReadState(selectedChannelId);
      onUnreadChangeRef.current?.();
      window.requestAnimationFrame(scrollToBottom);
    } catch {
      setError(L.sendError);
    } finally {
      setSending(false);
    }
  }, [
    canSend,
    draft,
    mergeMessage,
    pendingAttachments,
    pendingLink,
    refreshChannels,
    refreshReadState,
    replyingTo?.id,
    scrollToBottom,
    selectedChannelId,
  ]);

  const showThreadOnMobile = standalone ? false : Boolean(selectedChannelId);
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
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 rounded-lg px-2"
              onClick={() => setSearchOpen(true)}
              title={L.searchMessages}
            >
              <Search size={14} />
            </Button>
            <Button type="button" size="sm" variant="outline" className="h-8 rounded-lg gap-1 px-2" onClick={() => setGroupModalOpen(true)}>
              <Users size={14} />
              <span className="hidden sm:inline">{L.newGroup}</span>
            </Button>
            <Button type="button" size="sm" variant="outline" className="h-8 rounded-lg gap-1 px-2" onClick={() => setPickerOpen(true)}>
              <Plus size={14} />
              <span className="hidden sm:inline">{L.newDm}</span>
            </Button>
          </div>
        </div>

        {loading ? <p className="erp-team-chat-muted px-4 py-6 text-sm">{L.loading}</p> : null}
        {error && !selectedChannelId ? <p className="erp-team-chat-error px-4 py-2 text-sm">{error}</p> : null}

        <div className="erp-team-chat-sidebar__sections">
          {sortedChannels.length ? (
            sortedChannels.map((channel) => (
              <ChannelListItem
                key={channel.id}
                channel={channel}
                active={channel.id === selectedChannelId}
                onSelect={handleSelectChannel}
              />
            ))
          ) : (
            <p className="erp-team-chat-muted px-4 py-3 text-sm">{L.emptyChannels}</p>
          )}
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
              {!standalone ? (
                <button
                  type="button"
                  className="erp-team-chat-back lg:hidden"
                  onClick={() => setSelectedChannelId(null)}
                >
                  <ArrowLeft size={18} />
                  {L.back}
                </button>
              ) : null}
              <div className="min-w-0 flex-1 flex items-center gap-2.5">
                <div
                  className="erp-team-chat-avatar erp-team-chat-thread__avatar"
                  style={teamChatAvatarStyle(selectedChannel.id || selectedChannel.title)}
                  aria-hidden="true"
                >
                  {teamChatChannelAvatarLabel(selectedChannel)}
                </div>
                <div className="min-w-0">
                  <h2 className="truncate text-[15px] font-bold text-[#191919]">{selectedChannel.title}</h2>
                  <p className="text-[11px] text-[#888]">{channelTypeLabel(selectedChannel.type)}</p>
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 rounded-lg px-2"
                onClick={() => setSearchOpen(true)}
                title={L.searchMessages}
              >
                <Search size={16} />
              </Button>
            </div>

            <div ref={listRef} className="erp-team-chat-thread__messages">
              {!messages.length ? <p className="erp-team-chat-muted text-center text-sm">{L.emptyMessages}</p> : null}
              {messages.map((message) => {
                const isMine = Number(message.userId) === selfId;
                const link = message.link as TeamChatLink | null | undefined;
                const isEditing = editingMessageId === message.id;
                const readReceipt =
                  isMine && !message.isDeleted
                    ? formatTeamChatReadReceiptCompact(message.id, readState, selfId)
                    : null;
                const senderInitial = teamChatAvatarInitial(message.userName);
                const senderAvatarStyle = teamChatAvatarStyle(String(message.userId || message.userName));
                return (
                  <div
                    key={message.id}
                    className={`erp-team-chat-bubble-row ${isMine ? "is-mine" : "is-theirs"}`}
                  >
                    {!isMine ? (
                      <div className="erp-team-chat-msg-avatar erp-team-chat-avatar" style={senderAvatarStyle} aria-hidden="true">
                        {senderInitial}
                      </div>
                    ) : null}
                    <div className={`erp-team-chat-bubble-wrap ${isMine ? "is-mine" : "is-theirs"}`}>
                      {!isMine && showSenderNames ? (
                        <div className="erp-team-chat-bubble__sender">{message.userName}</div>
                      ) : null}
                      <div className="erp-team-chat-bubble-stack">
                        {!message.isDeleted ? (
                          <div className="erp-team-chat-bubble-menu">
                            <button
                              type="button"
                              className="erp-team-chat-bubble-menu__toggle"
                              onClick={() => setMenuMessageId((prev) => (prev === message.id ? null : message.id))}
                              aria-label={L.reply}
                            >
                              <MoreHorizontal size={14} />
                            </button>
                            {menuMessageId === message.id ? (
                              <div className="erp-team-chat-bubble-menu__panel">
                                <button type="button" onClick={() => handleReply(message)}>
                                  <CornerUpLeft size={13} />
                                  {L.reply}
                                </button>
                                {isMine ? (
                                  <>
                                    <button type="button" onClick={() => handleStartEdit(message)}>
                                      <Pencil size={13} />
                                      {L.edit}
                                    </button>
                                    <button type="button" className="is-danger" onClick={() => void handleDeleteMessage(message.id)}>
                                      <Trash2 size={13} />
                                      {L.delete}
                                    </button>
                                  </>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                        <div className={`erp-team-chat-bubble ${isMine ? "is-mine" : "is-theirs"}${message.isDeleted ? " is-deleted" : ""}`}>
                          {message.replyTo ? <ReplyQuotePreview replyTo={message.replyTo} /> : null}
                          {message.isDeleted ? (
                            <div className="erp-team-chat-bubble__deleted">{L.deletedMessage}</div>
                          ) : isEditing ? (
                            <div className="erp-team-chat-bubble__edit">
                              <textarea
                                className="erp-team-chat-composer__input"
                                rows={2}
                                value={editDraft}
                                onChange={(event) => setEditDraft(event.target.value)}
                              />
                              <div className="erp-team-chat-bubble__edit-actions">
                                <Button type="button" size="sm" variant="outline" className="h-8 rounded-lg" onClick={() => { setEditingMessageId(null); setEditDraft(""); }}>
                                  {L.cancelEdit}
                                </Button>
                                <Button type="button" size="sm" className="h-8 rounded-lg" disabled={!editDraft.trim() || sending} onClick={() => void handleSaveEdit()}>
                                  {L.saveEdit}
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <>
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
                            </>
                          )}
                        </div>
                        <div className="erp-team-chat-bubble__footer">
                          {readReceipt ? (
                            <span className="erp-team-chat-read-receipt" aria-label={readReceipt}>
                              {readReceipt}
                            </span>
                          ) : null}
                          <span className="erp-team-chat-bubble__time">
                            {formatTeamChatTime(message.createdAt)}
                            {message.editedAt ? ` \u00B7 ${L.edited}` : ""}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {error ? <p className="erp-team-chat-error px-4 py-1 text-sm">{error}</p> : null}

            {replyingTo ? (
              <div className="erp-team-chat-composer__reply px-4 pb-2">
                <div className="erp-team-chat-composer__reply-inner">
                  <span className="erp-team-chat-composer__reply-label">{L.replyTo}</span>
                  <ReplyQuotePreview
                    replyTo={{
                      id: replyingTo.id,
                      userName: replyingTo.userName,
                      body: replyingTo.isDeleted ? "" : replyingTo.body,
                      deleted: replyingTo.isDeleted,
                    }}
                  />
                </div>
                <button type="button" className="erp-team-chat-composer__remove-link" onClick={() => setReplyingTo(null)}>
                  {L.cancelReply}
                </button>
              </div>
            ) : null}

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
              <button
                type="button"
                className="erp-team-chat-composer__attach"
                disabled={uploading || sending || Boolean(editingMessageId)}
                onClick={() => fileInputRef.current?.click()}
                title={L.attach}
              >
                <Plus size={20} />
              </button>
              <textarea
                className="erp-team-chat-composer__input"
                rows={1}
                value={draft}
                placeholder={L.placeholder}
                disabled={Boolean(editingMessageId)}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void handleSend();
                  }
                }}
              />
              <button
                type="submit"
                className="erp-team-chat-composer__send"
                disabled={!canSend}
                title={L.send}
              >
                <Send size={16} />
              </button>
            </form>
          </>
        )}
      </section>

      {pickerOpen ? (
        <div className="erp-ledger-modal-backdrop" onClick={() => setPickerOpen(false)}>
          <div
            className="erp-ledger-modal max-w-md erp-team-chat-user-modal"
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

      {groupModalOpen ? (
        <div className="erp-ledger-modal-backdrop" onClick={() => setGroupModalOpen(false)}>
          <div
            className="erp-ledger-modal max-w-md erp-team-chat-group-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={L.createGroup}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">{L.createGroup}</h2>
                <p className="mt-1 text-sm text-slate-500">{L.groupMembers}</p>
              </div>
              <button type="button" className="rounded-xl p-2 text-slate-500 hover:bg-slate-100" onClick={() => setGroupModalOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <label className="mb-3 block">
              <span className="mb-1 block text-xs font-semibold text-slate-600">{L.groupTitle}</span>
              <input
                className="erp-input w-full rounded-xl"
                value={groupTitle}
                onChange={(event) => setGroupTitle(event.target.value)}
                placeholder={L.groupTitle}
              />
            </label>
            <label className="mb-3 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <Search size={16} className="text-slate-400" />
              <input
                className="w-full bg-transparent text-sm outline-none"
                value={userQuery}
                onChange={(event) => setUserQuery(event.target.value)}
                placeholder={L.searchUser}
              />
            </label>
            <ul className="erp-team-chat-group-modal__members max-h-[min(20rem,45vh)] space-y-1 overflow-y-auto">
              {filteredUsers.map((user) => {
                const checked = groupMemberIds.includes(user.id);
                return (
                  <li key={user.id}>
                    <label className="flex cursor-pointer items-center justify-between rounded-xl px-3 py-2.5 hover:bg-slate-50">
                      <span>
                        <span className="font-semibold text-slate-900">{user.name}</span>
                        <span className="ml-2 text-xs text-slate-500">{user.loginId || user.role}</span>
                      </span>
                      <input type="checkbox" checked={checked} onChange={() => toggleGroupMember(user.id)} />
                    </label>
                  </li>
                );
              })}
            </ul>
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setGroupModalOpen(false)}>
                {L.cancelEdit}
              </Button>
              <Button
                type="button"
                className="rounded-xl"
                disabled={!groupTitle.trim() || groupMemberIds.length < 1}
                onClick={() => void handleCreateGroup()}
              >
                {L.groupCreate}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {searchOpen ? (
        <div className="erp-ledger-modal-backdrop" onClick={() => setSearchOpen(false)}>
          <div
            className="erp-ledger-modal max-w-lg erp-team-chat-search-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={L.searchMessages}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">{L.searchMessages}</h2>
              </div>
              <button type="button" className="rounded-xl p-2 text-slate-500 hover:bg-slate-100" onClick={() => setSearchOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <form
              className="mb-3 flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void runMessageSearch();
              }}
            >
              <label className="flex flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                <Search size={16} className="text-slate-400" />
                <input
                  className="w-full bg-transparent text-sm outline-none"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder={L.searchPlaceholder}
                />
              </label>
              <Button type="submit" className="rounded-xl" disabled={searching}>
                {L.searchMessages}
              </Button>
            </form>
            <ul className="erp-team-chat-search-results max-h-[min(28rem,55vh)] space-y-2 overflow-y-auto">
              {searching ? <li className="text-sm text-slate-500">{L.loading}</li> : null}
              {!searching && searchQuery.trim() && !searchResults.length ? (
                <li className="text-sm text-slate-500">{L.searchEmpty}</li>
              ) : null}
              {searchResults.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    className="erp-team-chat-search-result w-full rounded-xl border border-slate-200 px-3 py-2.5 text-left hover:bg-slate-50"
                    onClick={() => {
                      setSearchOpen(false);
                      handleSelectChannel(row.channelId);
                    }}
                  >
                    <div className="text-xs font-semibold text-slate-500">
                      {channelTitleById.get(row.channelId) || row.channelId}
                      {" \u00B7 "}
                      {row.userName}
                      {" \u00B7 "}
                      {formatTeamChatTime(row.createdAt)}
                    </div>
                    <div className="mt-1 text-sm text-slate-900">{row.body}</div>
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
