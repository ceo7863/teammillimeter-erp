import React, { useRef } from "react";

type PageKeepAliveProps = {
  pageKey: string;
  active: string;
  children: React.ReactNode;
};

/** Hide inactive routes instead of unmounting so form/filter state survives tab switches. */
export function PageKeepAlive({ pageKey, active, children }: PageKeepAliveProps) {
  const everMountedRef = useRef(active === pageKey);
  if (active === pageKey) everMountedRef.current = true;

  if (!everMountedRef.current) return null;

  return (
    <div hidden={active !== pageKey} className="min-w-0" aria-hidden={active !== pageKey}>
      {children}
    </div>
  );
}
