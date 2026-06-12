import React, { useEffect, useState } from "react";
import { fetchTeamChatProfilePhotoBlob, teamChatUserHasPhoto } from "@/utils/teamChatProfilePhoto";
import { teamChatAvatarInitial, teamChatAvatarStyle } from "@/utils/teamChatUi";

type Props = {
  userId?: number | string | null;
  name: string;
  photoFileId?: string | null;
  photoUploadedAt?: string | null;
  className?: string;
  seed?: string;
};

export function TeamChatAvatar({
  userId,
  name,
  photoFileId,
  photoUploadedAt,
  className = "erp-team-chat-avatar",
  seed,
}: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const styleSeed = seed || String(userId || name);
  const avatarStyle = teamChatAvatarStyle(styleSeed);
  const initial = teamChatAvatarInitial(name);
  const hasPhoto = teamChatUserHasPhoto({ photoFileId });

  useEffect(() => {
    let objectUrl = "";
    let cancelled = false;
    const id = Number(userId);
    if (!hasPhoto || !Number.isFinite(id) || id <= 0) {
      setSrc(null);
      return () => {};
    }
    void (async () => {
      try {
        const blob = await fetchTeamChatProfilePhotoBlob(id);
        if (cancelled || !blob) {
          if (!cancelled) setSrc(null);
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      } catch {
        if (!cancelled) setSrc(null);
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [hasPhoto, photoFileId, photoUploadedAt, userId]);

  return (
    <div className={`${className}${src ? " erp-team-chat-avatar--photo" : ""}`} style={src ? undefined : avatarStyle} aria-hidden="true">
      {src ? <img src={src} alt="" className="erp-team-chat-avatar__img" draggable={false} /> : initial}
    </div>
  );
}
