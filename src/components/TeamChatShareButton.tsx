import { MessageCircle } from "lucide-react";
import { openTeamChatWithShare, type TeamChatSharePayload } from "@/utils/teamChatShare";

type TeamChatShareButtonProps = {
  payload: TeamChatSharePayload;
  title?: string;
  className?: string;
};

export function TeamChatShareButton({ payload, title, className = "" }: TeamChatShareButtonProps) {
  return (
    <button
      type="button"
      className={`erp-icon-btn text-slate-500 hover:text-blue-600 ${className}`.trim()}
      title={title || "\uCC57\uC5D0 \uACF5\uC720"}
      aria-label={title || "\uCC57\uC5D0 \uACF5\uC720"}
      onClick={() => openTeamChatWithShare(payload)}
    >
      <MessageCircle size={16} />
    </button>
  );
}
