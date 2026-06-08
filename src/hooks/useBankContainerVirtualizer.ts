import { useLayoutEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

type BankContainerVirtualizerOptions = {
  count: number;
  enabled: boolean;
  estimateSize: () => number;
  overscan: number;
  getItemKey: (index: number) => string | number;
};

export function useBankContainerVirtualizer({
  count,
  enabled,
  estimateSize,
  overscan,
  getItemKey,
}: BankContainerVirtualizerOptions) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: enabled ? count : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize,
    overscan,
    getItemKey,
  });

  useLayoutEffect(() => {
    if (!enabled) return;
    virtualizer.scrollToOffset(0);
    virtualizer.measure();
  }, [count, enabled, virtualizer]);

  return { scrollRef, virtualizer };
}
