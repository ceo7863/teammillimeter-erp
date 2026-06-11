import { useRef } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const L = {
  label: "\uC778\uC0AC\uC0AC\uC9C4",
  upload: "\uC0AC\uC9C4 \uC120\uD0DD",
  replace: "\uC0AC\uC9C4 \uBCC0\uACBD",
  delete: "\uC0AD\uC81C",
  hintCreate: "\uC2DC\uACF5\uC790 \uC800\uC7A5 \uD6C4 \uC778\uC0AC\uC0AC\uC9C4\uC744 \uB4F1\uB85D\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
  hintEdit: "JPG, PNG, WEBP \u00B7 5MB \uC774\uD558",
  uploading: "\uC5C5\uB85C\uB4DC \uC911\u2026",
};

type WorkerPhotoFieldProps = {
  previewUrl?: string | null;
  hasPhoto?: boolean;
  uploading?: boolean;
  createMode?: boolean;
  onSelectFile: (file: File) => void;
  onDelete?: () => void;
};

export function WorkerPhotoField({
  previewUrl,
  hasPhoto = false,
  uploading = false,
  createMode = false,
  onSelectFile,
  onDelete,
}: WorkerPhotoFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="sm:col-span-2 xl:col-span-4">
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="mb-3 text-sm font-semibold text-slate-700">{L.label}</div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="worker-photo-preview flex h-28 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white">
            {previewUrl ? (
              <img src={previewUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <ImagePlus className="h-8 w-8 text-slate-400" />
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <p className="text-xs text-slate-500">{createMode ? L.hintCreate : L.hintEdit}</p>
            <div className="flex flex-wrap gap-2">
              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                disabled={uploading}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) onSelectFile(file);
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-xl"
                disabled={uploading}
                onClick={() => inputRef.current?.click()}
              >
                {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {uploading ? L.uploading : hasPhoto || previewUrl ? L.replace : L.upload}
              </Button>
              {hasPhoto && onDelete ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-xl text-red-600"
                  disabled={uploading}
                  onClick={onDelete}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {L.delete}
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
