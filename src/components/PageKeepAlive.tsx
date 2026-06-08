import React, { useRef } from "react";

type PageKeepAliveProps = {
  pageKey: string;
  active: string;
  children: React.ReactNode;
};

/** Hub/tab panels: cache last active tree while hidden to skip parent re-renders. */
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

/** Mount only the active sidebar route — prevents visited menus from piling up in the DOM. */
export function PageKeepAlive({ pageKey, active, children }: PageKeepAliveProps) {
  if (active !== pageKey) return null;
  return <div className="min-w-0">{children}</div>;
}
