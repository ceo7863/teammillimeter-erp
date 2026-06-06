import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Plus } from "lucide-react";
import type { AccountCode } from "@/utils/ledgerSystem";
import {
  buildAccountCodePickerOptions,
  filterAccountCodesForManageView,
  groupAccountCodePickerOptions,
} from "@/utils/accountCodeTree";
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

type FlatPickerItem = {
  code: string;
  label: string;
  groupName: string;
};

const EXCEL_LIST_MAX_HEIGHT = 360;
const EXCEL_POPOVER_MIN_WIDTH = 280;
const EXCEL_WHEEL_SCROLL_GAIN = 1.35;

function computeExcelPopoverStyle(anchorRect: DOMRect | null): React.CSSProperties | null {
  if (!anchorRect) return null;

  const margin = 4;
  const width = Math.max(anchorRect.width, EXCEL_POPOVER_MIN_WIDTH);
  let top = anchorRect.bottom - 1;
  let left = anchorRect.left;

  if (left + width > window.innerWidth - margin) {
    left = Math.max(margin, window.innerWidth - width - margin);
  }

  const spaceBelow = window.innerHeight - margin - top;
  const spaceAbove = anchorRect.top - margin;
  let maxHeight = EXCEL_LIST_MAX_HEIGHT;
  if (spaceBelow < 120 && spaceAbove > spaceBelow) {
    maxHeight = Math.min(EXCEL_LIST_MAX_HEIGHT, spaceAbove - 2);
    top = Math.max(margin, anchorRect.top - maxHeight);
  } else {
    maxHeight = Math.min(EXCEL_LIST_MAX_HEIGHT, Math.max(96, spaceBelow));
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
  const listRef = useRef<HTMLDivElement>(null);
  const typeaheadRef = useRef("");
  const typeaheadTimerRef = useRef<number | null>(null);
  const keyboardNavRef = useRef(false);
  const [typeahead, setTypeahead] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties | null>(() =>
    computeExcelPopoverStyle(readBankTxAccountTriggerRect(triggerId)),
  );

  const applyMenuStyle = useCallback((style: React.CSSProperties | null) => {
    const el = menuRef.current;
    if (!el || style == null) return;
    if (typeof style.top === "number") el.style.top = `${style.top}px`;
    if (typeof style.left === "number") el.style.left = `${style.left}px`;
    if (typeof style.width === "number") el.style.width = `${style.width}px`;
    if (typeof style.maxHeight === "number") el.style.maxHeight = `${style.maxHeight}px`;
  }, []);

  const readMenuStyle = useCallback(() => {
    return computeExcelPopoverStyle(readBankTxAccountTriggerRect(triggerId));
  }, [triggerId]);

  const updatePosition = useCallback(
    (syncState = false) => {
      const style = readMenuStyle();
      applyMenuStyle(style);
      if (syncState) setMenuStyle(style);
      return style;
    },
    [applyMenuStyle, readMenuStyle],
  );

  const filteredRows = useMemo(
    () => filterAccountCodesForManageView(accountCodes, flow, typeahead),
    [accountCodes, flow, typeahead],
  );

  const groups = useMemo(() => {
    const options = buildAccountCodePickerOptions(filteredRows, flow);
    return groupAccountCodePickerOptions(options);
  }, [filteredRows, flow]);

  const updatePositionRef = useRef(updatePosition);
  updatePositionRef.current = updatePosition;

  const flatItems = useMemo(() => {
    const items: FlatPickerItem[] = [];
    for (const [groupName, groupItems] of groups) {
      for (const item of groupItems) {
        items.push({ code: item.code, label: item.label, groupName });
      }
    }
    return items;
  }, [groups]);

  useLayoutEffect(() => {
    updatePosition(true);
  }, [updatePosition]);

  useEffect(() => {
    const selectedIndex = flatItems.findIndex((item) => item.code === selectedCode);
    setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [flatItems, selectedCode, triggerId]);

  useEffect(() => {
    let rafId = 0;
    const scheduleUpdate = (event?: Event) => {
      if (event?.target instanceof Node && menuRef.current?.contains(event.target)) return;
      if (rafId) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        updatePositionRef.current(false);
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
  }, [triggerId]);

  useEffect(() => {
    if (!keyboardNavRef.current) return;
    keyboardNavRef.current = false;
    const list = listRef.current;
    if (!list) return;
    const active = list.querySelector<HTMLElement>("[data-active='true']");
    active?.scrollIntoView({ block: "nearest" });
  }, [highlightedIndex]);

  const pickItem = useCallback(
    (item: FlatPickerItem | undefined) => {
      if (!item) return;
      onSelect(item.code);
      onClose();
    },
    [onClose, onSelect],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (!flatItems.length) return;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        keyboardNavRef.current = true;
        setHighlightedIndex((prev) => (prev + 1) % flatItems.length);
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        keyboardNavRef.current = true;
        setHighlightedIndex((prev) => (prev - 1 + flatItems.length) % flatItems.length);
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        pickItem(flatItems[highlightedIndex]);
        return;
      }

      if (event.isComposing) return;

      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        const nextQuery = `${typeaheadRef.current}${event.key}`;
        typeaheadRef.current = nextQuery;
        setTypeahead(nextQuery);
        if (typeaheadTimerRef.current) window.clearTimeout(typeaheadTimerRef.current);
        typeaheadTimerRef.current = window.setTimeout(() => {
          typeaheadRef.current = "";
          setTypeahead("");
          typeaheadTimerRef.current = null;
        }, 700);

        const matchIndex = flatItems.findIndex((item) =>
          item.label.toLowerCase().includes(nextQuery.toLowerCase()),
        );
        if (matchIndex >= 0) {
          keyboardNavRef.current = true;
          setHighlightedIndex(matchIndex);
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (typeaheadTimerRef.current) window.clearTimeout(typeaheadTimerRef.current);
    };
  }, [flatItems, highlightedIndex, onClose, pickItem, typeahead]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const handleListWheel = (event: WheelEvent) => {
      event.stopPropagation();
      if (list.scrollHeight <= list.clientHeight) return;
      event.preventDefault();
      list.scrollTop += event.deltaY * EXCEL_WHEEL_SCROLL_GAIN;
    };

    list.addEventListener("wheel", handleListWheel, { passive: false });
    return () => list.removeEventListener("wheel", handleListWheel);
  }, [flatItems.length]);

  useEffect(() => {
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    return () => {
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
    };
  }, []);

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

  if (!menuStyle) return null;

  let lastGroup = "";

  return createPortal(
    <div
      ref={menuRef}
      style={menuStyle}
      className="erp-account-picker-popover erp-account-picker-popover--excel"
      role="listbox"
      aria-label={labels.searchPlaceholder}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div ref={listRef} className="erp-account-picker-popover__list erp-account-picker-popover__list--excel">
        {!flatItems.length ? (
          <p className="erp-account-picker-popover__empty">{labels.empty}</p>
        ) : (
          flatItems.map((item, index) => {
            const showGroup = item.groupName !== lastGroup;
            lastGroup = item.groupName;
            const isSelected = item.code === selectedCode;
            const isActive = index === highlightedIndex;
            return (
              <React.Fragment key={item.code}>
                {showGroup ? (
                  <div className="erp-account-picker-popover__excel-group">{item.groupName}</div>
                ) : null}
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  data-active={isActive ? "true" : undefined}
                  className={`erp-account-picker-popover__item erp-account-picker-popover__item--excel${
                    isSelected ? " is-selected" : ""
                  }${isActive ? " is-active" : ""}`}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    pickItem(item);
                  }}
                >
                  <span className="erp-account-picker-popover__item-label" title={item.label}>
                    {item.label}
                  </span>
                </button>
              </React.Fragment>
            );
          })
        )}
      </div>

      {onAddAccount ? (
        <div className="erp-account-picker-popover__footer erp-account-picker-popover__footer--excel">
          <button type="button" className="erp-account-picker-popover__footer-btn" onClick={onAddAccount}>
            <Plus size={12} aria-hidden="true" />
            {labels.addAccount}
          </button>
        </div>
      ) : null}
    </div>,
    document.body,
  );
});
