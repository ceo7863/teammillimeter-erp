import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
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
  onSelect: (accountCode: string) => boolean | void;
  onClose: () => void;
  onAddAccount?: () => void;
};

type FlatPickerItem = {
  code: string;
  label: string;
  groupName: string;
  depth: 0 | 1;
};

type VirtualPickerRow =
  | { kind: "group"; groupName: string; key: string }
  | { kind: "item"; item: FlatPickerItem; itemIndex: number; key: string };

const EXCEL_LIST_MAX_HEIGHT = 360;
const EXCEL_POPOVER_MIN_WIDTH = 280;
const PICKER_GROUP_ROW_PX = 20;
const PICKER_ITEM_ROW_PX = 21;
const PICKER_LIST_OVERSCAN = 10;

function buildVirtualPickerRows(flatItems: FlatPickerItem[]): VirtualPickerRow[] {
  const rows: VirtualPickerRow[] = [];
  let lastGroup = "";
  for (let itemIndex = 0; itemIndex < flatItems.length; itemIndex += 1) {
    const item = flatItems[itemIndex];
    if (item.groupName !== lastGroup) {
      rows.push({ kind: "group", groupName: item.groupName, key: `group:${item.groupName}` });
      lastGroup = item.groupName;
    }
    rows.push({ kind: "item", item, itemIndex, key: item.code });
  }
  return rows;
}

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
        items.push({ code: item.code, label: item.label, groupName, depth: item.depth });
      }
    }
    return items;
  }, [groups]);

  const virtualPickerRows = useMemo(() => buildVirtualPickerRows(flatItems), [flatItems]);

  const rowVirtualizer = useVirtualizer({
    count: virtualPickerRows.length,
    getScrollElement: () => listRef.current,
    estimateSize: (index) =>
      virtualPickerRows[index]?.kind === "group" ? PICKER_GROUP_ROW_PX : PICKER_ITEM_ROW_PX,
    overscan: PICKER_LIST_OVERSCAN,
    getItemKey: (index) => virtualPickerRows[index]?.key ?? index,
  });

  const rowVirtualizerRef = useRef(rowVirtualizer);
  rowVirtualizerRef.current = rowVirtualizer;

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
    const targetIndex = virtualPickerRows.findIndex(
      (row) => row.kind === "item" && row.itemIndex === highlightedIndex,
    );
    if (targetIndex >= 0) {
      rowVirtualizerRef.current.scrollToIndex(targetIndex, { align: "auto" });
    }
  }, [highlightedIndex, virtualPickerRows]);

  const pickItem = useCallback(
    (item: FlatPickerItem | undefined) => {
      if (!item) return;
      const saved = onSelect(item.code);
      if (saved === false) return;
      window.requestAnimationFrame(() => onClose());
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

  const virtualRows = rowVirtualizer.getVirtualItems();

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
          <div
            className="erp-account-picker-popover__virtual-list"
            style={{ height: rowVirtualizer.getTotalSize() }}
          >
            {virtualRows.map((virtualRow) => {
              const row = virtualPickerRows[virtualRow.index];
              if (!row) return null;
              if (row.kind === "group") {
                return (
                  <div
                    key={row.key}
                    data-index={virtualRow.index}
                    ref={rowVirtualizer.measureElement}
                    className="erp-account-picker-popover__excel-group erp-account-picker-popover__virtual-row"
                    style={{ transform: `translateY(${virtualRow.start}px)` }}
                  >
                    {row.groupName}
                  </div>
                );
              }

              const isSelected = row.item.code === selectedCode;
              const isActive = row.itemIndex === highlightedIndex;
              return (
                <button
                  key={row.key}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  data-index={virtualRow.index}
                  ref={rowVirtualizer.measureElement}
                  className={`erp-account-picker-popover__item erp-account-picker-popover__item--excel erp-account-picker-popover__virtual-row${
                    row.item.depth ? " is-child" : ""
                  }${isSelected ? " is-selected" : ""}${isActive ? " is-active" : ""}`}
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                  onPointerDown={(event) => {
                    if (event.button !== 0) return;
                    event.preventDefault();
                    event.stopPropagation();
                    pickItem(row.item);
                  }}
                >
                  <span className="erp-account-picker-popover__item-label" title={row.item.label}>
                    {row.item.label}
                  </span>
                </button>
              );
            })}
          </div>
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
