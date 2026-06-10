import React, { useEffect, useRef, useState } from "react";
import { Loader2, Printer, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  fetchClientBusinessRegBlob,
  fetchClientBusinessRegMeta,
  isImageMimeType,
  isPdfMimeType,
  printClientBusinessRegBlob,
  type ClientBusinessRegFileMeta,
} from "@/utils/clientBusinessRegFile";

const L = {
  title: "\uC0AC\uC5C5\uC790\uB4F1\uB85D\uC99D",
  print: "\uC778\uC87D",
  delete: "\uC0AD\uC81C",
  close: "\uB2EB\uAE30",
  loading: "\uC0AC\uC5C5\uC790\uB4F1\uB85D\uC99D\uC744 \uBD88\uB7EC\uC624\uB294 \uC911\uC785\uB2C8\uB2E4...",
  missing: "\uC800\uC7A5\uB41C \uC0AC\uC5C5\uC790\uB4F1\uB85D\uC99D\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  deleteConfirm: "\uC798\uBABB \uC62C\uB9AC\uB41C \uC0AC\uC5C5\uC790\uB4F1\uB85D\uC99D\uC744 \uC0AD\uC81C\uD560\uAE4C\uC694?",
  deletePendingConfirm: "\uC120\uD0DD\uD55C \uC0AC\uC5C5\uC790\uB4F1\uB85D\uC99D\uC744 \uCDE8\uC18C\uD560\uAE4C\uC694?",
  deleting: "\uC0AD\uC81C \uC911...",
};

type ClientBusinessRegViewModalProps = {
  open: boolean;
  clientId: number | string | null;
  clientName?: string;
  localFile?: File | null;
  onClose: () => void;
  onDelete?: () => void | Promise<void>;
};

export function ClientBusinessRegViewModal({
  open,
  clientId,
  clientName,
  localFile = null,
  onClose,
  onDelete,
}: ClientBusinessRegViewModalProps) {
  const previewUrlRef = useRef("");
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [meta, setMeta] = useState<ClientBusinessRegFileMeta | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const canDelete = Boolean(onDelete && (localFile || clientId != null));

  useEffect(() => {
    if (!open) return undefined;

    let cancelled = false;
    setLoading(true);
    setError("");
    setMeta(null);
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = "";
      setPreviewUrl("");
    }

    void (async () => {
      try {
        if (localFile) {
          if (cancelled) return;
          const url = URL.createObjectURL(localFile);
          previewUrlRef.current = url;
          setMeta({
            id: "local",
            clientId: String(clientId || ""),
            fileName: localFile.name,
            mimeType: localFile.type || "application/octet-stream",
            fileSize: localFile.size,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
          setPreviewUrl(url);
          return;
        }

        if (clientId == null) {
          setError(L.missing);
          return;
        }

        const [fileMeta, blob] = await Promise.all([
          fetchClientBusinessRegMeta(clientId),
          fetchClientBusinessRegBlob(clientId),
        ]);
        if (cancelled) return;
        if (!fileMeta || !blob) {
          setError(L.missing);
          return;
        }
        const url = URL.createObjectURL(blob);
        previewUrlRef.current = url;
        setMeta(fileMeta);
        setPreviewUrl(url);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : L.missing);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, clientId, localFile]);

  useEffect(() => {
    if (open) return undefined;
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = "";
    }
    setPreviewUrl("");
    setMeta(null);
    setError("");
    setLoading(false);
    setDeleting(false);
    return undefined;
  }, [open]);

  const handlePrint = async () => {
    try {
      const blob = localFile || (clientId != null ? await fetchClientBusinessRegBlob(clientId) : null);
      if (!blob || !meta) {
        setError(L.missing);
        return;
      }
      printClientBusinessRegBlob(blob, meta.mimeType, meta.fileName || L.title);
    } catch (printError) {
      setError(printError instanceof Error ? printError.message : "\uC778\uC87D\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.");
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    const confirmed = window.confirm(localFile ? L.deletePendingConfirm : L.deleteConfirm);
    if (!confirmed) return;

    setDeleting(true);
    setError("");
    try {
      await onDelete();
      onClose();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "\uC0AD\uC81C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.");
    } finally {
      setDeleting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="erp-ledger-modal-backdrop erp-ledger-modal-backdrop--elevated" onClick={onClose}>
      <div
        className="erp-ledger-modal erp-ledger-modal--client-biz-reg-view overflow-y-auto"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        lang="ko"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="erp-text-section font-bold">{L.title}</h2>
            {clientName ? <p className="erp-text-caption mt-1 text-slate-500">{clientName}</p> : null}
            {meta?.fileName ? <p className="erp-text-caption text-slate-400">{meta.fileName}</p> : null}
          </div>
          <button type="button" className="rounded-xl p-2 text-slate-400 hover:bg-slate-100" onClick={onClose} aria-label={L.close}>
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <p className="py-16 text-center text-sm text-slate-500">
            <Loader2 size={16} className="mr-2 inline animate-spin" />
            {L.loading}
          </p>
        ) : null}
        {error ? <p className="mb-4 text-sm font-semibold text-red-600">{error}</p> : null}

        {previewUrl && meta ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-2">
            {isPdfMimeType(meta.mimeType) ? (
              <iframe title={meta.fileName} src={previewUrl} className="h-[70vh] w-full rounded-xl border-0 bg-white" />
            ) : isImageMimeType(meta.mimeType) ? (
              <img src={previewUrl} alt={meta.fileName} className="mx-auto max-h-[70vh] w-full rounded-xl object-contain" />
            ) : (
              <iframe title={meta.fileName} src={previewUrl} className="h-[70vh] w-full rounded-xl border-0 bg-white" />
            )}
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
          {canDelete ? (
            <Button
              type="button"
              variant="outline"
              className="mr-auto rounded-2xl border-red-200 text-red-600 hover:bg-red-50"
              disabled={loading || deleting}
              onClick={() => void handleDelete()}
            >
              <Trash2 size={14} className="mr-1" />
              {deleting ? L.deleting : L.delete}
            </Button>
          ) : null}
          <Button type="button" variant="outline" className="rounded-2xl" onClick={onClose} disabled={deleting}>
            {L.close}
          </Button>
          <Button type="button" className="rounded-2xl" disabled={!previewUrl || loading || deleting} onClick={() => void handlePrint()}>
            <Printer size={14} className="mr-1" />
            {L.print}
          </Button>
        </div>
      </div>
    </div>
  );
}
