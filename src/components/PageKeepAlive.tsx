import React, { useRef } from "react";

type PageKeepAliveProps = {
  pageKey: string;
  active: string;
  children: React.ReactNode;
};

/** Renders a cached element tree while hidden so App state updates skip inactive routes. */
export function KeepAlivePanel({
  active,
  children,
  className = "min-w-0",
}: {
  active: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const cachedChildrenRef = useRef<React.ReactNode>(null);

  if (active) {
    cachedChildrenRef.current = children;
  }

  if (cachedChildrenRef.current == null) return null;

  return (
    <div hidden={!active} className={className} aria-hidden={!active}>
      {cachedChildrenRef.current}
    </div>
  );
}

/** Hide inactive routes instead of unmounting so form/filter state survives tab switches. */
export function PageKeepAlive({ pageKey, active, children }: PageKeepAliveProps) {
  const everMountedRef = useRef(active === pageKey);
  const isActive = active === pageKey;

  if (isActive) {
    everMountedRef.current = true;
  }

  if (!everMountedRef.current) return null;

  return <KeepAlivePanel active={isActive}>{children}</KeepAlivePanel>;
}
