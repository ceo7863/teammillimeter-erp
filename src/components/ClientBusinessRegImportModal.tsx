import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileUp, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ClientFormState } from "@/components/ClientFormModal";
import {
  BUSINESS_REG_IMPORT_FIELDS,
  mergeBusinessRegImport,
  suggestBusinessRegValues,
  type BusinessRegImportFieldKey,
} from "@/utils/businessRegImport";
import { extractBusinessRegistrationDocument, revokeDocumentPreviewUrl } from "@/utils/documentTextExtract";

const L = {
  title: "\uC0AC\uC5C5\uC790\uB4F1\uB85D\uC99D\uC5D0\uC11C \uAC00\uC838\uC624\uAE30",
  desc: "\uBB38\uC11C\uC758 \uAE00\uC790\uB97C \uC120\uD0DD\uD558\uACE0 \uD544\uB4DC\uC5D0 \uB123\uC744 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
  upload: "\uD30C\uC77C \uC120\uD0DD",
  uploadHint: "PDF \uB610\uB294 \uC774\uBBF8\uC9C0 (JPG, PNG)",
  extracting: "\uBB38\uC11C\uC758 \uAE00\uC790\uB97C \uBD84\uC11D \uC911\uC785\uB2C8\uB2E4...",
  textPanel: "\uCD94\uCD9C \uBCC0\uC778 \uAE00\uC790",
  textHint: "\uC544\uB798 \uAE00\uC790\uB97C \uB4DC\uB798\uADF8 \uC120\uD0DD\uD55C \uB4A4 \uD544\uD5BC \uBC84\uD2BC\uC744 \uB204\uB974\uC138\uC694.",
  activeField: (label: string) => `\uC120\uD0DD \uAE00\uC790 \u2192 ${label}`,
  selectionEmpty: "\uAE00\uC790\uB97C \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.",
  fillEmptyOnly: "\uBE48 \uCE78\uB9CC \uCC44\uC6B0\uAE30 (\uAE30\uC874 \uAC12 \uC720\uC9C0)",
  suggestions: "\uC790\uB3D9 \uCD94\uCC9C",
  applySuggestion: "\uC801\uC6A9",
  currentValue: "\uD604\uC7AC",
  emptyField: "\uBE48 \uCE78",
  apply: "\uD3FC\uC5D0 \uBC18\uC601",
  close: "\uB2EB\uAE30",
  noFile: "\uC0AC\uC5C5\uC790\uB4F1\uB85D\uC99D \uD30C\uC77C\uC744 \uC62C\uB824 \uC8FC\uC138\uC694.",
  applyDone: (count: number) => `${count}\uAC1C \uD544\uB4DC\uB97C \uCC44\uC6CC \uC788\uC2B5\uB2C8\uB2E4.`,
  skippedFilled: (count: number) => `${count}\uAC1C \uD544\uB4DC\uB294 \uAE30\uC874 \uAC12\uC774 \uC788\uC5B4 \uAC74\uB108\uB700\uC2B5\uB2C8\uB2E4.`,
};

type DraftPatch = Partial<Record<BusinessRegImportFieldKey, string>>;

type ClientBusinessRegImportModalProps = {
  open: boolean;
  form: ClientFormState;
  editing: boolean;
  onClose: () => void;
  onApply: (next: ClientFormState) => void;
};

export function ClientBusinessRegImportModal({
  open,
  form,
  editing,
  onClose,
  onApply,
}: ClientBusinessRegImportModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textPanelRef = useRef<HTMLDivElement>(null);
  const previewUrlRef = useRef("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [extractedText, setExtractedText] = useState("");
  const [fillEmptyOnly, setFillEmptyOnly] = useState(true);
  const [activeField, setActiveField] = useState<BusinessRegImportFieldKey | null>(null);
  const [draft, setDraft] = useState<DraftPatch>({});

  const suggestions = useMemo(() => suggestBusinessRegValues(extractedText), [extractedText]);

  const resetPreview = useCallback(() => {
    if (previewUrlRef.current) revokeDocumentPreviewUrl(previewUrlRef.current);
    previewUrlRef.current = "";
    setPreviewUrl("");
  }, []);

  const resetState = useCallback(() => {
    resetPreview();
    setLoading(false);
    setError("");
    setMessage("");
    setExtractedText("");
    setDraft({});
    setActiveField(null);
    setFillEmptyOnly(true);
  }, [resetPreview]);

  useEffect(() => {
    if (!open) resetState();
  }, [open, resetState]);

  useEffect(() => {
    if (open) setFillEmptyOnly(editing);
  }, [open, editing]);

  const handleFile = async (file: File | null | undefined) => {
    if (!file) return;
    resetPreview();
    setError("");
    setMessage("");
    setDraft({});
    setLoading(true);
    try {
      const result = await extractBusinessRegistrationDocument(file);
      previewUrlRef.current = result.previewUrl;
      setPreviewUrl(result.previewUrl);
      setExtractedText(result.text);
      const auto = suggestBusinessRegValues(result.text);
      const filteredAuto = fillEmptyOnly
        ? Object.fromEntries(
            Object.entries(auto).filter(([key]) => !String(form[key as BusinessRegImportFieldKey] || "").trim()),
          )
        : auto;
      setDraft((prev) => ({ ...filteredAuto, ...prev }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "\uBB38\uC11C \uBD84\uC11D\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.");
    } finally {
      setLoading(false);
    }
  };

  const getSelectedText = () => {
    const selection = window.getSelection();
    const text = selection?.toString().trim() || "";
    if (!text || !textPanelRef.current) return "";
    const anchor = selection?.anchorNode;
    const focus = selection?.focusNode;
    if (!anchor || !focus) return "";
    if (!textPanelRef.current.contains(anchor) && !textPanelRef.current.contains(focus)) return "";
    return text;
  };

  const assignToField = (key: BusinessRegImportFieldKey, value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (fillEmptyOnly && String(form[key] || "").trim()) {
      setMessage(L.skippedFilled(1));
      return;
    }
    setDraft((prev) => ({ ...prev, [key]: trimmed }));
    setMessage("");
  };

  const handleFieldClick = (key: BusinessRegImportFieldKey) => {
    const selected = getSelectedText();
    if (selected) {
      assignToField(key, selected);
      setActiveField(null);
      return;
    }
    setActiveField((prev) => (prev === key ? null : key));
  };

  const applySuggestion = (key: BusinessRegImportFieldKey) => {
    const value = suggestions[key];
    if (!value) return;
    assignToField(key, value);
  };

  const handleApply = () => {
    const { next, filled, skipped } = mergeBusinessRegImport(form, draft, { fillEmptyOnly });
    onApply(next);
    const parts = [];
    if (filled.length) parts.push(L.applyDone(filled.length));
    if (skipped.length && fillEmptyOnly) parts.push(L.skippedFilled(skipped.length));
    setMessage(parts.join(" "));
    if (filled.length) onClose();
  };

  if (!open) return null;

  return (
    <div className="erp-ledger-modal-backdrop erp-ledger-modal-backdrop--elevated" onClick={onClose}>
      <div
        className="erp-ledger-modal erp-ledger-modal--client-biz-reg-import overflow-y-auto"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        lang="ko"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="erp-text-section font-bold">{L.title}</h2>
            <p className="erp-text-caption mt-1 text-slate-500">{L.desc}</p>
          </div>
          <button type="button" className="rounded-xl p-2 text-slate-400 hover:bg-slate-100" onClick={onClose} aria-label={L.close}>
            <X size={18} />
          </button>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,image/*"
            className="hidden"
            onChange={(event) => void handleFile(event.target.files?.[0])}
          />
          <Button type="button" variant="outline" className="rounded-2xl" disabled={loading} onClick={() => fileInputRef.current?.click()}>
            {loading ? <Loader2 size={14} className="mr-1 animate-spin" /> : <FileUp size={14} className="mr-1" />}
            {L.upload}
          </Button>
          <span className="erp-text-caption text-slate-500">{L.uploadHint}</span>
          <label className="ml-auto inline-flex items-center gap-2 erp-text-caption font-semibold text-slate-600">
            <input
              type="checkbox"
              checked={fillEmptyOnly}
              onChange={(event) => setFillEmptyOnly(event.target.checked)}
            />
            {L.fillEmptyOnly}
          </label>
        </div>

        {error ? <p className="mb-3 erp-text-caption font-semibold text-red-600">{error}</p> : null}
        {message ? <p className="mb-3 erp-text-caption font-semibold text-emerald-700">{message}</p> : null}
        {activeField ? (
          <p className="mb-3 rounded-xl bg-sky-50 px-3 py-2 erp-text-caption font-semibold text-sky-800">
            {L.activeField(BUSINESS_REG_IMPORT_FIELDS.find((field) => field.key === activeField)?.label || activeField)}
          </p>
        ) : null}

        {!previewUrl && !loading ? <p className="py-8 text-center text-sm text-slate-500">{L.noFile}</p> : null}
        {loading ? (
          <p className="py-8 text-center text-sm font-medium text-slate-500">
            <Loader2 size={16} className="mr-2 inline animate-spin" />
            {L.extracting}
          </p>
        ) : null}

        {previewUrl ? (
          <div className="erp-client-biz-reg-import-grid">
            <div className="erp-client-biz-reg-import-preview">
              <img src={previewUrl} alt="\uC0AC\uC5C5\uC790\uB4F1\uB85D\uC99D \uBBF8\uB9AC\uBCF4\uAE30" className="max-h-[420px] w-full rounded-xl border border-slate-200 object-contain bg-white" />
            </div>
            <div className="space-y-3">
              <div>
                <div className="mb-1 erp-text-caption font-bold text-slate-600">{L.textPanel}</div>
                <div
                  ref={textPanelRef}
                  className="erp-client-biz-reg-import-text max-h-48 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-800 whitespace-pre-wrap select-text"
                  onMouseUp={() => {
                    const selected = getSelectedText();
                    if (selected && activeField) {
                      assignToField(activeField, selected);
                      setActiveField(null);
                    }
                  }}
                >
                  {extractedText || L.selectionEmpty}
                </div>
                <p className="mt-1 erp-text-caption text-slate-500">{L.textHint}</p>
              </div>

              {Object.keys(suggestions).length ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <div className="mb-2 erp-text-caption font-bold text-amber-900">{L.suggestions}</div>
                  <div className="space-y-2">
                    {BUSINESS_REG_IMPORT_FIELDS.filter(({ key }) => suggestions[key]).map(({ key, label }) => (
                      <div key={key} className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-bold text-amber-900">{label}</span>
                        <span className="truncate text-slate-700">{suggestions[key]}</span>
                        <Button type="button" size="sm" variant="outline" className="ml-auto h-7 rounded-lg px-2 text-xs" onClick={() => applySuggestion(key)}>
                          {L.applySuggestion}
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {BUSINESS_REG_IMPORT_FIELDS.map(({ key, label }) => {
                  const current = String(form[key] || "").trim();
                  const pending = String(draft[key] || "").trim();
                  const isEmpty = !current;
                  return (
                    <button
                      key={key}
                      type="button"
                      className={`rounded-xl border px-3 py-2 text-left transition ${
                        activeField === key
                          ? "border-sky-400 bg-sky-50 ring-2 ring-sky-200"
                          : pending
                            ? "border-emerald-300 bg-emerald-50"
                            : "border-slate-200 bg-white hover:bg-slate-50"
                      }`}
                      onClick={() => handleFieldClick(key)}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-800">{label}</span>
                        {isEmpty ? (
                          <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">{L.emptyField}</span>
                        ) : null}
                      </div>
                      <div className="mt-1 truncate text-xs text-slate-500">
                        {L.currentValue}: {current || "-"}
                      </div>
                      {pending ? <div className="mt-0.5 truncate text-xs font-semibold text-emerald-700">{pending}</div> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : null}

        <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4">
          <Button type="button" variant="outline" className="rounded-2xl" onClick={onClose}>
            {L.close}
          </Button>
          <Button type="button" className="rounded-2xl" disabled={!Object.values(draft).some((value) => String(value || "").trim())} onClick={handleApply}>
            {L.apply}
          </Button>
        </div>
      </div>
    </div>
  );
}
