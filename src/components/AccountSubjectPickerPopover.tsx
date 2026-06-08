import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Plus } from "lucide-react";
import type { AccountCodePickerFlatItem } from "@/utils/accountCodeTree";
import { filterAccountCodePickerFlatItems } from "@/utils/accountCodeTree";
import {
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
  items: AccountCodePickerFlatItem[];
  labels: AccountSubjectPickerPopoverLabels;
  onSelect: (accountCode: string) => boolean | void;
  onClose: () => void;
  onAddAccount?: () => void;
};

type VirtualPickerRow =
  | { kind: "group"; groupName: string; key: string }
  | { kind: "item"; item: AccountCodePickerFlatItem; itemIndex: number; key: string };

const EXCEL_LIST_MAX_HEIGHT = 360;
const EXCEL_POPOVER_MIN_WIDTH = 280;
const PICKER_VIRTUAL_THRESHOLD = 48;
const PICKER_GROUP_ROW_PX = 24;
const PICKER_ITEM_ROW_PX = 30;

function buildVirtualPickerRows(flatItems: AccountCodePickerFlatItem[]): VirtualPickerRow[] {
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

const FALLBACK_MENU_STYLE: React.CSSProperties = {
  position: "fixed",
  top: 0,
  left: 0,
  width: EXCEL_POPOVER_MIN_WIDTH,
  maxHeight: EXCEL_LIST_MAX_HEIGHT,
  zIndex: 10000,
  visibility: "hidden",
};

const PickerGroupRow = memo(function PickerGroupRow({ groupName }: { groupName: string }) {
  return <div className="erp-account-picker-popover__excel-group">{groupName}</div>;
});

const PickerItemRow = memo(function PickerItemRow({
  item,
  isSelected,
  isActive,
  itemRef,
  onPick,
}: {
  item: AccountCodePickerFlatItem;
  isSelected: boolean;
  isActive: boolean;
  itemRef?: React.RefObject<HTMLButtonElement | null>;
  onPick: (item: AccountCodePickerFlatItem) => void;
}) {
  return (
    <button
      ref={isActive ? itemRef : undefined}
      type="button"
      role="option"
      aria-selected={isSelected}
      className={`erp-account-picker-popover__item erp-account-picker-popover__item--excel${
        item.depth ? " is-child" : ""
      }${isSelected ? " is-selected" : ""}${isActive ? " is-active" : ""}`}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        onPick(item);
      }}
    >
      <span className="erp-account-picker-popover__item-label" title={item.label}>
        {item.label}
      </span>
    </button>
  );
});

export const AccountSubjectPickerPopover = memo(function AccountSubjectPickerPopover({
  triggerId,
  selectedCode,
  items,
  labels,
  onSelect,
  onClose,
  onAddAccount,
}: AccountSubjectPickerPopoverProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const activeItemRef = useRef<HTMLButtonElement>(null);
  const typeaheadRef = useRef("");
  const typeaheadTimerRef = useRef<number | null>(null);
  const keyboardNavRef = useRef(false);
  const [typeahead, setTypeahead] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>(FALLBACK_MENU_STYLE);
  const [positionReady, setPositionReady] = useState(false);

  const flatItems = useMemo(
    () => filterAccountCodePickerFlatItems(items, typeahead),
    [items, typeahead],
  );

  const pickerRows = useMemo(() => buildVirtualPickerRows(flatItems), [flatItems]);
  const useVirtualPicker = pickerRows.length > PICKER_VIRTUAL_THRESHOLD;

  const pickItem = useCallback(
    (item: AccountCodePickerFlatItem | undefined) => {
      if (!item) return;
      const saved = onSelect(item.code);
      if (saved === false) return;
      window.requestAnimationFrame(() => onClose());
    },
    [onClose, onSelect],
  );

  const rowVirtualizer = useVirtualizer({
    count: useVirtualPicker ? pickerRows.length : 0,
    getScrollElement: () => listRef.current,
    estimateSize: (index) =>
      pickerRows[index]?.kind === "group" ? PICKER_GROUP_ROW_PX : PICKER_ITEM_ROW_PX,
    overscan: 5,
    getItemKey: (index) => pickerRows[index]?.key ?? index,
  });

  const highlightedPickerRowIndex = useMemo(() => {
    const index = pickerRows.findIndex(
      (row) => row.kind === "item" && row.itemIndex === highlightedIndex,
    );
    return index >= 0 ? index : 0;
  }, [highlightedIndex, pickerRows]);

  const updatePosition = useCallback(() => {
    const style = computeExcelPopoverStyle(readBankTxAccountTriggerRect(triggerId));
    const el = menuRef.current;
    if (style) {
      if (el) {
        el.style.top = `${style.top}px`;
        el.style.left = `${style.left}px`;
        el.style.width = `${style.width}px`;
        el.style.maxHeight = `${style.maxHeight}px`;
        el.style.visibility = "visible";
      }
      setMenuStyle(style);
      setPositionReady(true);
    }
    return style;
  }, [triggerId]);

  useLayoutEffect(() => {
    let cancelled = false;
    let attempts = 0;

    const tryPosition = () => {
      if (cancelled) return;
      const style = updatePosition();
      if (style) {
        readBankTxAccountTriggerElement(triggerId)?.classList.add("is-open");
        return;
      }
      attempts += 1;
      if (attempts < 8) {
        window.requestAnimationFrame(tryPosition);
      }
    };

    tryPosition();
    return () => {
      cancelled = true;
      readBankTxAccountTriggerElement(triggerId)?.classList.remove("is-open");
    };
  }, [triggerId, updatePosition]);

  useEffect(() => {
    const selectedIndex = flatItems.findIndex((item) => item.code === selectedCode);
    setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [flatItems, selectedCode, triggerId]);

  useEffect(() => {
    let rafId = 0;
    const scheduleUpdate = (event: Event) => {
      if (event.target instanceof Node && menuRef.current?.contains(event.target)) return;
      if (rafId) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        updatePosition();
      });
    };

    window.addEventListener("scroll", scheduleUpdate, { capture: true, passive: true });
    window.addEventListener("resize", scheduleUpdate, { passive: true });

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", scheduleUpdate, true);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [updatePosition]);

  useEffect(() => {
    if (!keyboardNavRef.current) return;
    keyboardNavRef.current = false;
    if (useVirtualPicker) {
      rowVirtualizer.scrollToIndex(highlightedPickerRowIndex, { align: "auto", behavior: "auto" });
      return;
    }
    activeItemRef.current?.scrollIntoView({ block: "nearest", behavior: "auto" });
  }, [highlightedIndex, highlightedPickerRowIndex, rowVirtualizer, useVirtualPicker]);

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
  }, [flatItems, highlightedIndex, onClose, pickItem]);

  useEffect(() => {
    let armed = false;
    const armTimer = window.setTimeout(() => {
      armed = true;
    }, 0);

    const handlePointerDown = (event: MouseEvent) => {
      if (!armed) return;
      const target = event.target as Node;
      if (menuRef.current?.contains(target)) return;
      const triggerEl = readBankTxAccountTriggerElement(triggerId);
      if (triggerEl?.contains(target)) return;
      onClose();
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      window.clearTimeout(armTimer);
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [onClose, triggerId]);

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
    const blockBackgroundWheel = (event: WheelEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      event.preventDefault();
    };
    document.addEventListener("wheel", blockBackgroundWheel, { passive: false });
    return () => document.removeEventListener("wheel", blockBackgroundWheel);
  }, []);

  return createPortal(
    <div
      ref={menuRef}
      style={menuStyle}
      className={`erp-account-picker-popover erp-account-picker-popover--excel${positionReady ? "" : " is-positioning"}`}
      role="listbox"
      aria-label={labels.searchPlaceholder}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div
        ref={listRef}
        className="erp-account-picker-popover__list erp-account-picker-popover__list--excel"
        onWheel={(event) => event.stopPropagation()}
      >
        {!flatItems.length ? (
          <p className="erp-account-picker-popover__empty">{labels.empty}</p>
        ) : useVirtualPicker ? (
          <div
            className="erp-account-picker-popover__virtual-list"
            style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const row = pickerRows[virtualRow.index];
              if (!row) return null;
              if (row.kind === "group") {
                return (
                  <div
                    key={virtualRow.key}
                    className="erp-account-picker-popover__virtual-row"
                    style={{ transform: `translateY(${virtualRow.start}px)` }}
                  >
                    <PickerGroupRow groupName={row.groupName} />
                  </div>
                );
              }
              return (
                <div
                  key={virtualRow.key}
                  className="erp-account-picker-popover__virtual-row"
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                >
                  <PickerItemRow
                    item={row.item}
                    isSelected={row.item.code === selectedCode}
                    isActive={row.itemIndex === highlightedIndex}
                    itemRef={activeItemRef}
                    onPick={pickItem}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <div className="erp-account-picker-popover__static-list">
            {pickerRows.map((row) => {
              if (row.kind === "group") {
                return <PickerGroupRow key={row.key} groupName={row.groupName} />;
              }

              return (
                <PickerItemRow
                  key={row.key}
                  item={row.item}
                  isSelected={row.item.code === selectedCode}
                  isActive={row.itemIndex === highlightedIndex}
                  itemRef={activeItemRef}
                  onPick={pickItem}
                />
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
