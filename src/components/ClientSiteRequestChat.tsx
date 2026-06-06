import React, { memo, useEffect, useRef } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ClientSiteRequestMessage } from "@/utils/clientSiteRequests";

const L = {
  chatTitle: "\uBA54\uC2DC\uC9C0",
  empty: "\uC544\uC9C1 \uBA54\uC2DC\uC9C0\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.",
  placeholder: "\uBA54\uC2DC\uC9C0\uB97C \uC785\uB825\uD558\uC138\uC694",
  send: "\uC804\uC1A1",
  sending: "\uC804\uC1A1 \uC911...",
  staffLabel: "\uB2F4\uB2F9\uC790",
  clientLabel: "\uAC70\uB798\uCC98",
};

type ClientSiteRequestChatProps = {
  messages: ClientSiteRequestMessage[];
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  sending?: boolean;
  viewer: "client" | "staff";
};

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export const ClientSiteRequestChat = memo(function ClientSiteRequestChat({
  messages,
  draft,
  onDraftChange,
  onSend,
  sending = false,
  viewer,
}: ClientSiteRequestChatProps) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = listRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [messages.length, draft]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.trim() || sending) return;
    onSend();
  };

  return (
    <div className="erp-client-site-request-chat">
      <div className="erp-client-site-request-chat__title">{L.chatTitle}</div>
      <div ref={listRef} className="erp-client-site-request-chat__list">
        {!messages.length ? (
          <p className="erp-client-site-request-chat__empty">{L.empty}</p>
        ) : (
          messages.map((message) => {
            const isMine = viewer === "client" ? message.sender === "client" : message.sender === "staff";
            return (
              <div
                key={message.id}
                className={`erp-client-site-request-chat__bubble-row ${isMine ? "is-mine" : "is-theirs"}`}
              >
                <div className={`erp-client-site-request-chat__bubble ${isMine ? "is-mine" : "is-theirs"}`}>
                  <div className="erp-client-site-request-chat__meta">
                    {message.senderName ||
                      (message.sender === "staff" ? L.staffLabel : L.clientLabel)}
                    {" \u00B7 "}
                    {formatTime(message.createdAt)}
                  </div>
                  <div className="erp-client-site-request-chat__body">{message.body}</div>
                </div>
              </div>
            );
          })
        )}
      </div>
      <form className="erp-client-site-request-chat__composer" onSubmit={handleSubmit}>
        <textarea
          className="erp-client-site-request-chat__input"
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          placeholder={L.placeholder}
          rows={2}
        />
        <Button type="submit" size="sm" className="rounded-xl" disabled={!draft.trim() || sending}>
          <Send size={14} className="mr-1" />
          {sending ? L.sending : L.send}
        </Button>
      </form>
    </div>
  );
});
