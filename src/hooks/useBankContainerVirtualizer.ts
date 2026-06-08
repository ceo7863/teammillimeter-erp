import { useLayoutEffect, useRef } from "react";
import { useVirtualizer, type VirtualItem } from "@tanstack/react-virtual";

type BankContainerVirtualizerOptions = {
  count: number;
  enabled: boolean;
  estimateSize: () => number;
  overscan: number;
  getItemKey: (index: number) => string | number;
};

export function fallbackBankVirtualWindow(
  count: number,
  scrollOffset: number,
  estimateSize: number,
  overscan: number,
  viewportHeight = 720,
): VirtualItem[] {
  if (count <= 0) return [];
  const startIndex = Math.max(0, Math.floor(scrollOffset / estimateSize) - overscan);
  const endIndex = Math.min(
    count - 1,
    Math.ceil((scrollOffset + viewportHeight) / estimateSize) + overscan,
  );
  const items: VirtualItem[] = [];
  for (let index = startIndex; index <= endIndex; index += 1) {
    const start = index * estimateSize;
    items.push({
      index,
      start,
      end: start + estimateSize,
      size: estimateSize,
      key: index,
      lane: 0,
    });
  }
  return items;
}

export function useBankContainerVirtualizer({
  count,
  enabled,
  estimateSize,
  overscan,
  getItemKey,
}: BankContainerVirtualizerOptions) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const countRef = useRef(count);

  const virtualizer = useVirtualizer({
    count: enabled ? count : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize,
    overscan,
    getItemKey,
  });

  useLayoutEffect(() => {
    if (!enabled) return;
    if (countRef.current !== count) {
      countRef.current = count;
      virtualizer.scrollToOffset(0);
      virtualizer.measure();
    }
  }, [count, enabled, virtualizer]);

  return { scrollRef, virtualizer };
}
