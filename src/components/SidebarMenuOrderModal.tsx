import React, { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, GripVertical, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getPageLabel, type ErpPageDef, type ErpPageKey } from "@/utils/pageAccess";
import { buildSidebarOrderDraft } from "@/utils/sidebarOrder";

const L = {
  title: "메뉴 순서",
  desc: "사이드바 메뉴 순서를 본인 취향에 맞게 바꿀 수 있습니다. 저장하면 계정에 저장되어 다른 기기에서도 동일하게 적용됩니다.",
  save: "순서 저장",
  cancel: "취소",
  close: "닫기",
  reset: "기본 순서",
  moveUp: "위로",
  moveDown: "아래로",
  dragHint: "드래그하거나 화살표로 순서를 바꿀 수 있습니다.",
  saved: "메뉴 순서가 저장되었습니다.",
  saveError: "메뉴 순서 저장에 실패했습니다.",
  saving: "저장 중...",
};

type SidebarMenuOrderModalProps = {
  open: boolean;
  pages: ErpPageDef[];
  savedOrder: ErpPageKey[] | null;
  apiMode?: boolean;
  onClose: () => void;
  onSave: (order: ErpPageKey[]) => void | Promise<void>;
};

function reorderKeys(keys: ErpPageKey[], fromIndex: number, toIndex: number) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= keys.length || toIndex >= keys.length) {
    return keys;
  }
  const next = [...keys];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

export function SidebarMenuOrderModal({ open, pages, savedOrder, onClose, onSave }: SidebarMenuOrderModalProps) {
  const defaultDraft = useMemo(() => buildSidebarOrderDraft(pages, savedOrder), [pages, savedOrder]);
  const [draft, setDraft] = useState<ErpPageKey[]>(defaultDraft);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(buildSidebarOrderDraft(pages, savedOrder));
    setDragIndex(null);
    setMessage("");
    setError("");
    setSubmitting(false);
  }, [open, pages, savedOrder]);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(""), 2400);
    return () => window.clearTimeout(timer);
  }, [message]);

  if (!open) return null;

  const moveItem = (index: number, delta: number) => {
    setDraft((prev) => reorderKeys(prev, index, index + delta));
  };

  const handleDrop = (targetIndex: number) => {
    if (dragIndex == null) return;
    setDraft((prev) => reorderKeys(prev, dragIndex, targetIndex));
    setDragIndex(null);
  };

  const handleReset = () => {
    setDraft(pages.map((page) => page.key));
  };

  const handleSave = async () => {
    setSubmitting(true);
    setError("");
    setMessage("");
    try {
      await onSave(draft);
      setMessage(L.saved);
      window.setTimeout(() => onClose(), 500);
    } catch (err) {
      setError(err instanceof Error ? err.message : L.saveError);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="erp-ledger-modal-backdrop" onClick={onClose}>
      <div
        className="erp-ledger-modal erp-sidebar-order-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
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

        <p className="erp-text-caption mb-3 rounded-2xl bg-slate-50 px-4 py-3 text-slate-600">{L.dragHint}</p>

        <ul className="erp-sidebar-order-list">
          {draft.map((key, index) => (
            <li
              key={key}
              className={`erp-sidebar-order-item ${dragIndex === index ? "is-dragging" : ""}`}
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragEnd={() => setDragIndex(null)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => handleDrop(index)}
            >
              <span className="erp-sidebar-order-grip" aria-hidden="true">
                <GripVertical size={16} />
              </span>
              <span className="erp-sidebar-order-label">{getPageLabel(key)}</span>
              <div className="erp-sidebar-order-actions">
                <button
                  type="button"
                  className="erp-sidebar-order-move-btn"
                  onClick={() => moveItem(index, -1)}
                  disabled={index === 0}
                  aria-label={`${getPageLabel(key)} ${L.moveUp}`}
                >
                  <ArrowUp size={15} />
                </button>
                <button
                  type="button"
                  className="erp-sidebar-order-move-btn"
                  onClick={() => moveItem(index, 1)}
                  disabled={index === draft.length - 1}
                  aria-label={`${getPageLabel(key)} ${L.moveDown}`}
                >
                  <ArrowDown size={15} />
                </button>
              </div>
            </li>
          ))}
        </ul>

        {error ? <p className="erp-text-caption mt-3 font-semibold text-rose-600">{error}</p> : null}
        {message ? <p className="erp-text-caption mt-3 font-semibold text-emerald-600">{message}</p> : null}

        <div className="mt-5 flex flex-wrap justify-between gap-2">
          <Button type="button" variant="outline" className="rounded-2xl" onClick={handleReset} disabled={submitting}>
            <RotateCcw size={15} className="mr-1.5" />
            {L.reset}
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" className="rounded-2xl" onClick={onClose} disabled={submitting}>
              {L.cancel}
            </Button>
            <Button type="button" className="rounded-2xl" onClick={handleSave} disabled={submitting}>
              {submitting ? L.saving : L.save}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
