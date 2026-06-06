import React, { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  clientContractPreviewUrl,
  getContractTemplateDefaults,
  rebuildClientContractPdf,
  type ClientContract,
  type ContractPdfContent,
} from "@/utils/clientContracts";
import { getAuthToken } from "@/utils/erpApi";

const L = {
  title: "PDF ?? ??",
  clientName: "??? ???",
  contactName: "???",
  contactPhone: "???",
  basicUnitPrice: "???? (?/?)",
  nightWorkRate: "???? ?? (?/??)",
  mealAllowance: "?? (?/?)",
  accommodationFee: "??? (?/?)",
  vehicleRate: "????? (?/km)",
  preview: "????",
  save: "??",
  cancel: "??",
  close: "??",
  saved: "PDF? ???????.",
  saveFail: "PDF ??? ??????.",
  phoneRequired: "???? ??? ???.",
  loadingPreview: "???? ???? ?...",
  previewFail: "????? ???? ?????.",
};

type ClientContractPdfEditModalProps = {
  contract: ClientContract | null;
  open: boolean;
  onClose: () => void;
  onSaved: (contract: ClientContract) => void;
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="erp-text-caption mb-1 block font-semibold text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function Input({
  className = "",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { className?: string }) {
  return (
    <input
      {...props}
      lang={props.lang ?? "ko"}
      className={`erp-input w-full rounded-2xl border bg-white px-3 py-2.5 text-slate-900 outline-none transition focus:border-slate-900 md:px-4 md:py-3 ${className}`}
    />
  );
}

const EMPTY_CONTENT: ContractPdfContent = {
  basicUnitPrice: "",
  nightWorkRate: "",
  mealAllowance: "",
  accommodationFee: "",
  vehicleRate: "",
};

export function ClientContractPdfEditModal({
  contract,
  open,
  onClose,
  onSaved,
}: ClientContractPdfEditModalProps) {
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [pdfContent, setPdfContent] = useState<ContractPdfContent>(EMPTY_CONTENT);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [cacheBuster, setCacheBuster] = useState(0);

  const templateId = contract?.templateId || "unit-price-agreement";

  useEffect(() => {
    if (!open || !contract) return;
    setContactName(contract.contactName || "");
    setContactPhone(contract.contactPhone || "");
    setError("");
    setMessage("");
    setPreviewError("");
    setCacheBuster(Date.now());

    const loadDefaults = async () => {
      const existing = contract.pdfContent || {};
      if (Object.keys(existing).length > 0) {
        setPdfContent({ ...EMPTY_CONTENT, ...existing });
        return;
      }
      try {
        const defaults = await getContractTemplateDefaults(templateId);
        setPdfContent({ ...EMPTY_CONTENT, ...defaults });
      } catch {
        setPdfContent({ ...EMPTY_CONTENT });
      }
    };
    void loadDefaults();
  }, [open, contract, templateId]);

  const previewSrc = useMemo(() => {
    if (!contract || !open) return "";
    const base = clientContractPreviewUrl(contract.id, "original", 1);
    return `${base}${base.includes("?") ? "&" : "?"}t=${cacheBuster}`;
  }, [contract, open, cacheBuster]);

  useEffect(() => {
    if (!open || !contract || !previewSrc) {
      setPreviewUrl("");
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    setPreviewError("");

    const token = getAuthToken();
    fetch(previewSrc, { headers: token ? { Authorization: `Bearer ${token}` } : undefined })
      .then((response) => {
        if (!response.ok) throw new Error(L.previewFail);
        return response.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        setPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setPreviewError(err instanceof Error ? err.message : L.previewFail);
        setPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return "";
        });
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, contract, previewSrc]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  if (!open || !contract) return null;

  const updateContent = (key: keyof ContractPdfContent, value: string) => {
    setPdfContent((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!contactPhone.trim()) {
      setError(L.phoneRequired);
      return;
    }
    setSubmitting(true);
    setError("");
    setMessage("");
    try {
      const saved = await rebuildClientContractPdf(contract.id, {
        contactName: contactName.trim() || undefined,
        contactPhone: contactPhone.trim(),
        pdfContent,
      });
      setCacheBuster(Date.now());
      setMessage(L.saved);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : L.saveFail);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="erp-ledger-modal-backdrop" onClick={onClose}>
      <div
        className="erp-ledger-modal erp-client-contract-pdf-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="erp-text-section font-bold">{L.title}</h2>
            <p className="erp-text-caption mt-1 text-slate-500">{contract.title}</p>
          </div>
          <button
            type="button"
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"
            onClick={onClose}
            aria-label={L.close}
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="space-y-3">
            <Field label={L.clientName}>
              <Input value={contract.clientName} readOnly className="bg-slate-50 text-slate-600" />
            </Field>
            <Field label={L.contactName}>
              <Input value={contactName} onChange={(e) => setContactName(e.target.value)} />
            </Field>
            <Field label={L.contactPhone}>
              <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="010-0000-0000" />
            </Field>
            <Field label={L.basicUnitPrice}>
              <Input value={pdfContent.basicUnitPrice || ""} onChange={(e) => updateContent("basicUnitPrice", e.target.value)} />
            </Field>
            <Field label={L.nightWorkRate}>
              <Input value={pdfContent.nightWorkRate || ""} onChange={(e) => updateContent("nightWorkRate", e.target.value)} />
            </Field>
            <Field label={L.mealAllowance}>
              <Input value={pdfContent.mealAllowance || ""} onChange={(e) => updateContent("mealAllowance", e.target.value)} />
            </Field>
            <Field label={L.accommodationFee}>
              <Input value={pdfContent.accommodationFee || ""} onChange={(e) => updateContent("accommodationFee", e.target.value)} />
            </Field>
            <Field label={L.vehicleRate}>
              <Input value={pdfContent.vehicleRate || ""} onChange={(e) => updateContent("vehicleRate", e.target.value)} />
            </Field>
          </div>

          <div>
            <p className="erp-text-caption mb-2 font-semibold text-slate-500">{L.preview}</p>
            <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 p-2">
              {previewLoading ? (
                <p className="erp-text-caption text-slate-500">{L.loadingPreview}</p>
              ) : previewError ? (
                <p className="erp-text-caption font-semibold text-rose-600">{previewError}</p>
              ) : previewUrl ? (
                <img src={previewUrl} alt={L.preview} className="max-h-[560px] w-full object-contain" />
              ) : null}
            </div>
          </div>
        </div>

        {error ? <p className="erp-text-caption mt-4 font-semibold text-rose-600">{error}</p> : null}
        {message ? <p className="erp-text-caption mt-4 font-semibold text-emerald-600">{message}</p> : null}

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" className="rounded-2xl" onClick={onClose}>
            {L.cancel}
          </Button>
          <Button type="button" className="rounded-2xl" disabled={submitting} onClick={() => void handleSave()}>
            {L.save}
          </Button>
        </div>
      </div>
    </div>
  );
}
