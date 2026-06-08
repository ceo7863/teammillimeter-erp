import { useLayoutEffect, useRef, useState } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";

type BankWindowVirtualizerOptions = {
  count: number;
  enabled: boolean;
  estimateSize: () => number;
  overscan: number;
  getItemKey: (index: number) => string | number;
};

export function useBankWindowVirtualizer({
  count,
  enabled,
  estimateSize,
  overscan,
  getItemKey,
}: BankWindowVirtualizerOptions) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);

  useLayoutEffect(() => {
    const updateScrollMargin = () => {
      setScrollMargin(anchorRef.current?.offsetTop ?? 0);
    };
    updateScrollMargin();
    window.addEventListener("resize", updateScrollMargin);
    return () => window.removeEventListener("resize", updateScrollMargin);
  }, [count, enabled]);

  const virtualizer = useWindowVirtualizer({
    count: enabled ? count : 0,
    estimateSize,
    overscan,
    scrollMargin,
    getItemKey,
  });

  useLayoutEffect(() => {
    if (!enabled) return;
    virtualizer.measure();
  }, [count, enabled, virtualizer]);

  return { anchorRef, virtualizer };
}
