import React, { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SlidersHorizontal } from "lucide-react";
import {
  BANK_TRANSACTION_DISPLAY_COLUMN_ORDER,
  type BankTransactionColumnVisibility,
  type BankTransactionDisplayColumnKey,
} from "@/utils/bankTransactionColumnVisibility";

export type BankTransactionDisplaySettingsLabels = Record<BankTransactionDisplayColumnKey, string> & {
  title: string;
};

type BankTransactionDisplaySettingsProps = {
  visibility: BankTransactionColumnVisibility;
  labels: BankTransactionDisplaySettingsLabels;
  onChange: (key: BankTransactionDisplayColumnKey, visible: boolean) => void;
};

function DisplayToggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <label className="erp-bank-display-settings__row">
      <span className="erp-bank-display-settings__label">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className={`erp-bank-display-toggle${checked ? " is-on" : ""}`}
        onClick={() => onChange(!checked)}
      >
        <span className="erp-bank-display-toggle__thumb" aria-hidden="true" />
      </button>
    </label>
  );
}

function BankTransactionDisplaySettingsComponent({
  visibility,
  labels,
  onChange,
}: BankTransactionDisplaySettingsProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const gap = 6;
    const menuHeight = menuRef.current?.offsetHeight ?? 320;
    let top = rect.bottom + gap;
    if (top + menuHeight > window.innerHeight - 8) {
      top = Math.max(8, rect.top - menuHeight - gap);
    }
    setMenuStyle({
      position: "fixed",
      top,
      right: window.innerWidth - rect.right,
      zIndex: 10000,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updateMenuPosition();
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) return;

    let rafId = 0;
    const scheduleUpdate = (event?: Event) => {
      if (event?.target instanceof Node && menuRef.current?.contains(event.target)) return;
      if (rafId) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        updateMenuPosition();
      });
    };

    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("scroll", scheduleUpdate, true);
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("scroll", scheduleUpdate, true);
    };
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const menu =
    open && typeof document !== "undefined" ? (
      <div
        ref={menuRef}
        style={menuStyle}
        className="erp-bank-display-settings__menu erp-bank-display-settings__menu--portal"
        role="menu"
        onMouseDown={(event) => event.stopPropagation()}
      >
        {BANK_TRANSACTION_DISPLAY_COLUMN_ORDER.map((columnKey) => (
          <React.Fragment key={columnKey}>
            <DisplayToggle
              label={labels[columnKey]}
              checked={visibility[columnKey]}
              onChange={(next) => onChange(columnKey, next)}
            />
          </React.Fragment>
        ))}
      </div>
    ) : null;

  return (
    <div className="erp-bank-display-settings">
      <button
        ref={triggerRef}
        type="button"
        className="erp-bank-wehago-action-btn erp-bank-display-settings__trigger"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((prev) => !prev)}
      >
        <SlidersHorizontal size={14} className="mr-1" />
        {labels.title}
      </button>
      {menu ? createPortal(menu, document.body) : null}
    </div>
  );
}

export const BankTransactionDisplaySettings = memo(BankTransactionDisplaySettingsComponent);
