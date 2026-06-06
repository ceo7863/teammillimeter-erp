import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, Search } from "lucide-react";
import type { AccountCode } from "@/utils/ledgerSystem";
import {
  buildAccountCodePickerOptions,
  filterAccountCodesForManageView,
  groupAccountCodePickerOptions,
} from "@/utils/accountCodeTree";
import { focusKoreanTextInput, prepareKoreanTextInput } from "@/utils/koreanIme";

export type AccountSubjectPickerPopoverLabels = {
  searchPlaceholder: string;
  empty: string;
  addAccount: string;
};

type AccountSubjectPickerPopoverProps = {
  anchorRect?: DOMRect | null;
  selectedCode: string;
  accountCodes: AccountCode[];
  flow: "income" | "expense";
  labels: AccountSubjectPickerPopoverLabels;
  onSelect: (accountCode: string) => void;
  onClose: () => void;
  onAddAccount?: () => void;
};

const POPOVER_WIDTH = 320;
const POPOVER_MAX_HEIGHT = 420;

function computePopoverStyle(anchorRect?: DOMRect | null): React.CSSProperties {
  if (!anchorRect) {
    return {
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      width: POPOVER_WIDTH,
      maxHeight: POPOVER_MAX_HEIGHT,
      zIndex: 10000,
    };
  }

  const margin = 8;
  let top = anchorRect.bottom + 4;
  let left = anchorRect.left;

  if (left + POPOVER_WIDTH > window.innerWidth - margin) {
    left = window.innerWidth - POPOVER_WIDTH - margin;
  }
  left = Math.max(margin, left);

  if (top + POPOVER_MAX_HEIGHT > window.innerHeight - margin) {
    top = Math.max(margin, anchorRect.top - POPOVER_MAX_HEIGHT - 4);
  }

  return {
    position: "fixed",
    top,
    left,
    width: POPOVER_WIDTH,
    maxHeight: POPOVER_MAX_HEIGHT,
    zIndex: 10000,
  };
}

export const AccountSubjectPickerPopover = memo(function AccountSubjectPickerPopover({
  anchorRect,
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
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>(() => computePopoverStyle(anchorRect));

  const filteredRows = useMemo(
    () => filterAccountCodesForManageView(accountCodes, flow, search),
    [accountCodes, flow, search],
  );

  const groups = useMemo(() => {
    const options = buildAccountCodePickerOptions(filteredRows, flow);
    return groupAccountCodePickerOptions(options);
  }, [filteredRows, flow]);

  const updatePosition = useCallback(() => {
    setMenuStyle(computePopoverStyle(anchorRect));
  }, [anchorRect]);

  useEffect(() => {
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [updatePosition]);

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
      onClose();
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [onClose]);

  const hasItems = groups.some(([, items]) => items.length > 0);

  return createPortal(
    <>
      <div className="erp-account-picker-backdrop" aria-hidden="true" />
      <div
        ref={menuRef}
        style={menuStyle}
        className="erp-account-picker-popover"
        role="dialog"
        aria-modal="true"
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
                        className={`erp-account-picker-popover__item${isSelected ? " is-selected" : ""}`}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          onSelect(item.code);
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
      </div>
    </>,
    document.body,
  );
});
