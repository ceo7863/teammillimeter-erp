import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, Search } from "lucide-react";
import type { AccountCode } from "@/utils/ledgerSystem";
import {
  buildAccountCodePickerOptions,
  filterAccountCodesForManageView,
  groupAccountCodePickerOptions,
} from "@/utils/accountCodeTree";
import { focusKoreanTextInput, prepareKoreanTextInput } from "@/utils/koreanIme";
import {
  getScrollParents,
  readBankTxAccountTriggerElement,
  readBankTxAccountTriggerRect,
} from "@/utils/floatingPosition";

export type AccountSubjectPickerPopoverLabels = {
  searchPlaceholder: string;
  empty: string;
  addAccount: string;
};

type AccountSubjectPickerPopoverProps = {
  triggerId: string;
  selectedCode: string;
  accountCodes: AccountCode[];
  flow: "income" | "expense";
  labels: AccountSubjectPickerPopoverLabels;
  onSelect: (accountCode: string) => void;
  onClose: () => void;
  onAddAccount?: () => void;
};

const POPOVER_MIN_WIDTH = 220;
const POPOVER_MAX_WIDTH = 320;
const POPOVER_MAX_HEIGHT = 320;

function computePopoverStyle(anchorRect: DOMRect | null): React.CSSProperties | null {
  if (!anchorRect) return null;

  const margin = 8;
  const width = Math.min(POPOVER_MAX_WIDTH, Math.max(POPOVER_MIN_WIDTH, anchorRect.width));
  let top = anchorRect.bottom + 2;
  let left = anchorRect.left;

  if (left + width > window.innerWidth - margin) {
    left = window.innerWidth - width - margin;
  }
  left = Math.max(margin, left);

  const spaceBelow = window.innerHeight - margin - top;
  const spaceAbove = anchorRect.top - margin;
  let maxHeight = POPOVER_MAX_HEIGHT;
  if (spaceBelow < maxHeight && spaceAbove > spaceBelow) {
    maxHeight = Math.min(POPOVER_MAX_HEIGHT, spaceAbove - 4);
    top = Math.max(margin, anchorRect.top - maxHeight - 2);
  } else {
    maxHeight = Math.min(POPOVER_MAX_HEIGHT, Math.max(120, spaceBelow));
  }

  return {
    position: "fixed",
    top,
    left,
    width,
    maxHeight,
    zIndex: 10000,
  };
}

export const AccountSubjectPickerPopover = memo(function AccountSubjectPickerPopover({
  triggerId,
  selectedCode,
  accountCodes,
  flow,
  labels,
  onSelect,
  onClose,
  onAddAccount,
}: AccountSubjectPickerPopoverProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties | null>(() =>
    computePopoverStyle(readBankTxAccountTriggerRect(triggerId)),
  );

  const filteredRows = useMemo(
    () => filterAccountCodesForManageView(accountCodes, flow, search),
    [accountCodes, flow, search],
  );

  const groups = useMemo(() => {
    const options = buildAccountCodePickerOptions(filteredRows, flow);
    return groupAccountCodePickerOptions(options);
  }, [filteredRows, flow]);

  const updatePosition = useCallback(() => {
    setMenuStyle(computePopoverStyle(readBankTxAccountTriggerRect(triggerId)));
  }, [triggerId]);

  useLayoutEffect(() => {
    updatePosition();
  }, [updatePosition]);

  useEffect(() => {
    let rafId = 0;
    const scheduleUpdate = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        updatePosition();
      });
    };

    const triggerEl = readBankTxAccountTriggerElement(triggerId);
    const scrollTargets = getScrollParents(triggerEl);
    scrollTargets.forEach((target) => {
      target.addEventListener("scroll", scheduleUpdate, { passive: true });
    });
    window.addEventListener("resize", scheduleUpdate);

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      scrollTargets.forEach((target) => {
        target.removeEventListener("scroll", scheduleUpdate);
      });
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [triggerId, updatePosition]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const input = searchRef.current;
      if (!input) return;
      focusKoreanTextInput(input);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target)) return;
      const triggerEl = readBankTxAccountTriggerElement(triggerId);
      if (triggerEl?.contains(target)) return;
      onClose();
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [onClose, triggerId]);

  const hasItems = groups.some(([, items]) => items.length > 0);

  if (!menuStyle) return null;

  return createPortal(
    <div
      ref={menuRef}
      style={menuStyle}
      className="erp-account-picker-popover erp-account-picker-popover--dropdown"
      role="listbox"
      aria-label={labels.searchPlaceholder}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="erp-account-picker-popover__search">
        <Search size={16} className="shrink-0 text-slate-400" aria-hidden="true" />
        <input
          ref={searchRef}
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={labels.searchPlaceholder}
          className="erp-account-picker-popover__search-input"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          lang="ko"
          onPointerDown={(event) => prepareKoreanTextInput(event.currentTarget)}
          onFocus={(event) => focusKoreanTextInput(event.currentTarget)}
        />
      </div>

      <div className="erp-account-picker-popover__list">
        {!hasItems ? (
          <p className="erp-account-picker-popover__empty">{labels.empty}</p>
        ) : (
          groups.map(([groupName, items]) =>
            items.length ? (
              <section key={groupName} className="erp-account-picker-popover__group">
                <div className="erp-account-picker-popover__group-title">{groupName}</div>
                {items.map((item) => {
                  const isSelected = item.code === selectedCode;
                  return (
                    <button
                      key={item.code}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      className={`erp-account-picker-popover__item${isSelected ? " is-selected" : ""}`}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onSelect(item.code);
                        onClose();
                      }}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </section>
            ) : null,
          )
        )}
      </div>

      {onAddAccount ? (
        <div className="erp-account-picker-popover__footer">
          <button type="button" className="erp-account-picker-popover__footer-btn" onClick={onAddAccount}>
            <Plus size={14} aria-hidden="true" />
            {labels.addAccount}
          </button>
        </div>
      ) : null}
    </div>,
    document.body,
  );
});
