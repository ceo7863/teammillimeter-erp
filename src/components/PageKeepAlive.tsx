import React, { useEffect, useState } from "react";

type PageKeepAliveProps = {
  pageKey: string;
  active: string;
  children: React.ReactNode;
};

/** Hide inactive routes instead of unmounting so form/filter state survives tab switches. */
export function PageKeepAlive({ pageKey, active, children }: PageKeepAliveProps) {
  const [mounted, setMounted] = useState(active === pageKey);

  useEffect(() => {
    if (active === pageKey) setMounted(true);
  }, [active, pageKey]);

  if (!mounted) return null;

  return (
    <div hidden={active !== pageKey} className="min-w-0" aria-hidden={active !== pageKey}>
      {children}
    </div>
  );
}
