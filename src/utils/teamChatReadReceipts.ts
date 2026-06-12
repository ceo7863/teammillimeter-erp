export type TeamChatReadStateMember = {
  userId: number;
  userName: string;
  lastReadMessageId: number;
};

type OwnMessageLike = {
  id: number;
  userId: number;
  isDeleted?: boolean;
};

export function formatTeamChatReadReceipt(
  messageId: number,
  members: TeamChatReadStateMember[],
  selfId: number,
) {
  const readers = members.filter(
    (member) => member.userId !== selfId && member.lastReadMessageId >= messageId,
  );
  if (!readers.length) return null;
  if (readers.length === 1) return `\uC77D\uC74C ${readers[0].userName}`;
  if (readers.length === 2) return `\uC77D\uC74C ${readers[0].userName}, ${readers[1].userName}`;
  return `\uC77D\uC74C ${readers[0].userName} \uC678 ${readers.length - 1}\uBA85`;
}

/** Kakao-style unread count: how many other members have not read this message yet. */
export function formatTeamChatUnreadReceiptCompact(
  messageId: number,
  members: TeamChatReadStateMember[],
  selfId: number,
) {
  const unread = members.filter(
    (member) => member.userId !== selfId && member.lastReadMessageId < messageId,
  ).length;
  if (!unread) return null;
  return String(unread);
}

/** @deprecated Use formatTeamChatUnreadReceiptCompact for bubble badges. */
export function formatTeamChatReadReceiptCompact(
  messageId: number,
  members: TeamChatReadStateMember[],
  selfId: number,
) {
  return formatTeamChatUnreadReceiptCompact(messageId, members, selfId);
}

export function isLastOwnMessageInBlock(
  messages: OwnMessageLike[],
  index: number,
  selfId: number,
) {
  const message = messages[index];
  if (!message || message.isDeleted || Number(message.userId) !== selfId) return false;
  for (let i = index + 1; i < messages.length; i += 1) {
    const next = messages[i];
    if (next.isDeleted) continue;
    return Number(next.userId) !== selfId;
  }
  return true;
}
