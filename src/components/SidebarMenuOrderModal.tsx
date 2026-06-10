import React, { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, GripVertical, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getPageLabel, type ErpPageDef, type ErpPageKey } from "@/utils/pageAccess";
import { buildSidebarHiddenDraft, buildSidebarOrderDraft } from "@/utils/sidebarOrder";

const L = {
  title: "메뉴 설정",
  desc: "사이드바 메뉴 순서를 바꾸거나 본인에게만 숨길 수 있습니다. 저장하면 계정에 저장되어 다른 기기에서도 동일하게 적용됩니다.",
  save: "설정 저장",
  cancel: "취소",
  close: "닫기",
  reset: "기본값",
  moveUp: "위로",
  moveDown: "아래로",
  showMenu: "메뉴 표시",
  hideMenu: "메뉴 숨기기",
  hiddenBadge: "숨김",
  dragHint: "드래그하거나 화살표로 순서를 바꿀 수 있습니다. 눈 아이콘으로 표시 여부를 바꿀 수 있습니다.",
  saved: "메뉴 설정이 저장되었습니다.",
  saveError: "메뉴 설정 저장에 실패했습니다.",
  needVisible: "최소 1개 이상의 메뉴는 표시해야 합니다.",
  saving: "저장 중...",
};

export type SidebarMenuSettings = {
  order: ErpPageKey[];
  hidden: ErpPageKey[];
};

type SidebarMenuOrderModalProps = {
  open: boolean;
  pages: ErpPageDef[];
  savedOrder: ErpPageKey[] | null;
  savedHidden?: ErpPageKey[] | null;
  apiMode?: boolean;
  onClose: () => void;
  onSave: (settings: SidebarMenuSettings) => void | Promise<void>;
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

export function SidebarMenuOrderModal({
  open,
  pages,
  savedOrder,
  savedHidden = null,
  onClose,
  onSave,
}: SidebarMenuOrderModalProps) {
  const defaultDraft = useMemo(() => buildSidebarOrderDraft(pages, savedOrder), [pages, savedOrder]);
  const defaultHidden = useMemo(() => buildSidebarHiddenDraft(pages, savedHidden), [pages, savedHidden]);
  const [draft, setDraft] = useState<ErpPageKey[]>(defaultDraft);
  const [hiddenDraft, setHiddenDraft] = useState<ErpPageKey[]>(defaultHidden);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const hiddenSet = useMemo(() => new Set(hiddenDraft), [hiddenDraft]);

  useEffect(() => {
    if (!open) return;
    setDraft(buildSidebarOrderDraft(pages, savedOrder));
    setHiddenDraft(buildSidebarHiddenDraft(pages, savedHidden));
    setDragIndex(null);
    setMessage("");
    setError("");
    setSubmitting(false);
  }, [open, pages, savedOrder, savedHidden]);

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

  const toggleHidden = (key: ErpPageKey) => {
    setHiddenDraft((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        return [...next];
      }
      const visibleCount = draft.filter((item) => !next.has(item)).length;
      if (visibleCount <= 1) {
        setError(L.needVisible);
        return prev;
      }
      next.add(key);
      setError("");
      return [...next];
    });
  };

  const handleReset = () => {
    setDraft(pages.map((page) => page.key));
    setHiddenDraft([]);
    setError("");
  };

  const handleSave = async () => {
    const visibleCount = draft.filter((key) => !hiddenSet.has(key)).length;
    if (visibleCount <= 0) {
      setError(L.needVisible);
      return;
    }
    setSubmitting(true);
    setError("");
    setMessage("");
    try {
      await onSave({ order: draft, hidden: hiddenDraft });
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
          {draft.map((key, index) => {
            const isHidden = hiddenSet.has(key);
            return (
              <li
                key={key}
                className={`erp-sidebar-order-item ${dragIndex === index ? "is-dragging" : ""} ${isHidden ? "is-hidden" : ""}`}
                draggable
                onDragStart={() => setDragIndex(index)}
                onDragEnd={() => setDragIndex(null)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => handleDrop(index)}
              >
                <span className="erp-sidebar-order-grip" aria-hidden="true">
                  <GripVertical size={16} />
                </span>
                <span className="erp-sidebar-order-label">
                  {getPageLabel(key)}
                  {isHidden ? <span className="erp-sidebar-order-hidden-badge">{L.hiddenBadge}</span> : null}
                </span>
                <div className="erp-sidebar-order-actions">
                  <button
                    type="button"
                    className="erp-sidebar-order-move-btn"
                    onClick={() => toggleHidden(key)}
                    aria-label={`${getPageLabel(key)} ${isHidden ? L.showMenu : L.hideMenu}`}
                    title={isHidden ? L.showMenu : L.hideMenu}
                  >
                    {isHidden ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
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
            );
          })}
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
