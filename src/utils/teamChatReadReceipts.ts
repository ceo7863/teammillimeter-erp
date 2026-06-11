export type TeamChatReadStateMember = {
  userId: number;
  userName: string;
  lastReadMessageId: number;
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

export function formatTeamChatReadReceiptCompact(
  messageId: number,
  members: TeamChatReadStateMember[],
  selfId: number,
) {
  const count = members.filter(
    (member) => member.userId !== selfId && member.lastReadMessageId >= messageId,
  ).length;
  if (!count) return null;
  return count === 1 ? "\uC77D\uC74C" : String(count);
}
