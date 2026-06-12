import React, { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TeamChatAvatar } from "@/components/TeamChatAvatar";
import {
  deleteTeamChatProfilePhoto,
  uploadTeamChatProfilePhoto,
  type TeamChatProfilePhotoMeta,
} from "@/utils/teamChatProfilePhoto";

const L = {
  title: "\uD504\uB85C\uD544 \uC0AC\uC9C4",
  hint: "\uCC57\uC5D0 \uBCF4\uC774\uB294 \uC0AC\uC9C4\uC744 \uBCC0\uACBD\uD569\uB2C8\uB2E4. (JPG, PNG \u00B7 5MB \uC774\uD558)",
  change: "\uC0AC\uC9C4 \uC120\uD0DD",
  remove: "\uC0AC\uC9C4 \uC0AD\uC81C",
  uploading: "\uC5C5\uB85C\uB4DC \uC911\u2026",
  close: "\uB2EB\uAE30",
};

type Props = {
  open: boolean;
  userId: number;
  userName: string;
  photoFileId?: string | null;
  photoUploadedAt?: string | null;
  onClose: () => void;
  onUpdated: (meta: TeamChatProfilePhotoMeta | null) => void;
};

export function TeamChatProfilePhotoModal({
  open,
  userId,
  userName,
  photoFileId,
  photoUploadedAt,
  onClose,
  onUpdated,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [localPhotoFileId, setLocalPhotoFileId] = useState(photoFileId || "");
  const [localPhotoUploadedAt, setLocalPhotoUploadedAt] = useState(photoUploadedAt || "");

  useEffect(() => {
    if (!open) return;
    setLocalPhotoFileId(photoFileId || "");
    setLocalPhotoUploadedAt(photoUploadedAt || "");
    setError("");
  }, [open, photoFileId, photoUploadedAt]);

  const handleFile = useCallback(
    async (file: File | null) => {
      if (!file) return;
      setBusy(true);
      setError("");
      try {
        const meta = await uploadTeamChatProfilePhoto(file);
        setLocalPhotoFileId(meta.id);
        setLocalPhotoUploadedAt(meta.updatedAt);
        onUpdated(meta);
      } catch (err) {
        setError(err instanceof Error ? err.message : "\uC5C5\uB85C\uB4DC\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.");
      } finally {
        setBusy(false);
      }
    },
    [onUpdated],
  );

  const handleRemove = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      await deleteTeamChatProfilePhoto();
      setLocalPhotoFileId("");
      setLocalPhotoUploadedAt("");
      onUpdated(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "\uC0AD\uC81C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.");
    } finally {
      setBusy(false);
    }
  }, [onUpdated]);

  if (!open) return null;

  const handlePick = () => inputRef.current?.click();

  return (
    <div className="erp-ledger-modal-backdrop" onClick={onClose}>
      <div
        className="erp-ledger-modal max-w-sm erp-team-chat-profile-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={L.title}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{L.title}</h2>
            <p className="mt-1 text-sm text-slate-500">{L.hint}</p>
          </div>
          <button type="button" className="rounded-xl p-2 text-slate-500 hover:bg-slate-100" onClick={onClose} aria-label={L.close}>
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col items-center gap-4 py-2">
          <TeamChatAvatar
            userId={userId}
            name={userName}
            photoFileId={localPhotoFileId}
            photoUploadedAt={localPhotoUploadedAt}
            className="erp-team-chat-avatar erp-team-chat-profile-modal__avatar"
          />
          <div className="text-sm font-semibold text-slate-900">{userName}</div>
        </div>

        {error ? <p className="erp-team-chat-error mb-3 text-sm">{error}</p> : null}

        <div className="flex flex-wrap gap-2">
          <Button type="button" className="flex-1 rounded-xl gap-2" onClick={handlePick} disabled={busy}>
            <Camera size={16} />
            {busy ? L.uploading : L.change}
          </Button>
          {localPhotoFileId ? (
            <Button type="button" variant="outline" className="rounded-xl gap-2" onClick={() => void handleRemove()} disabled={busy}>
              <Trash2 size={16} />
              {L.remove}
            </Button>
          ) : null}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0] || null;
            event.target.value = "";
            void handleFile(file);
          }}
        />
      </div>
    </div>
  );
}
