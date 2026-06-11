import type { TeamChatChannel } from "@/utils/teamChat";

export function teamChatAvatarHue(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
}

export function teamChatAvatarStyle(seed: string) {
  const hue = teamChatAvatarHue(seed);
  return {
    background: `hsl(${hue} 42% 52%)`,
    color: "#fff",
  } as const;
}

export function teamChatAvatarInitial(label: string) {
  const trimmed = String(label || "").trim();
  if (!trimmed) return "?";
  return trimmed.charAt(0);
}

export function teamChatChannelAvatarLabel(channel: Pick<TeamChatChannel, "type" | "title">) {
  if (channel.type === "team") return "\uC804";
  return teamChatAvatarInitial(channel.title);
}

export function sortTeamChatChannels(channels: TeamChatChannel[]) {
  return [...channels].sort((a, b) => {
    const ta = a.lastMessageAt ? Date.parse(a.lastMessageAt) : 0;
    const tb = b.lastMessageAt ? Date.parse(b.lastMessageAt) : 0;
    if (tb !== ta) return tb - ta;
    return String(a.title || "").localeCompare(String(b.title || ""), "ko");
  });
}
