import React from "react";

export type MobileRecordField = {
  label: string;
  value: React.ReactNode;
  tone?: "default" | "danger" | "success" | "muted";
};

type MobileRecordCardProps = {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  badge?: React.ReactNode;
  fields?: MobileRecordField[];
  actions?: React.ReactNode;
  onClick?: () => void;
  selected?: boolean;
  empty?: boolean;
  emptyLabel?: string;
};

function fieldToneClass(tone: MobileRecordField["tone"] = "default") {
  if (tone === "danger") return "text-rose-600";
  if (tone === "success") return "text-emerald-600";
  if (tone === "muted") return "text-slate-500";
  return "text-slate-900";
}

export function MobileRecordCard({
  title,
  subtitle,
  badge,
  fields = [],
  actions,
  onClick,
  selected = false,
  empty = false,
  emptyLabel = "",
}: MobileRecordCardProps) {
  if (empty) {
    return (
      <div className="erp-mobile-card erp-mobile-card--empty rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-slate-500">
        {emptyLabel}
      </div>
    );
  }

  const clickable = Boolean(onClick);
  const Tag = clickable ? "button" : "div";

  return (
    <Tag
      type={clickable ? "button" : undefined}
      onClick={onClick}
      className={`erp-mobile-card w-full rounded-2xl border bg-white p-4 text-left shadow-sm transition ${
        selected ? "border-sky-300 bg-sky-50 ring-1 ring-sky-200" : "border-slate-200"
      } ${clickable ? "cursor-pointer active:scale-[0.99]" : ""}`}
    >
      {(title || subtitle || badge) && (
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {title ? <div className="truncate font-bold text-slate-900">{title}</div> : null}
            {subtitle ? <div className="mt-0.5 truncate text-slate-500">{subtitle}</div> : null}
          </div>
          {badge ? <div className="shrink-0">{badge}</div> : null}
        </div>
      )}

      {fields.length > 0 ? (
        <dl className="erp-mobile-card-fields space-y-2">
          {fields.map((field) => (
            <div key={field.label} className="flex items-start justify-between gap-3">
              <dt className="shrink-0 text-slate-500">{field.label}</dt>
              <dd className={`min-w-0 text-right font-semibold ${fieldToneClass(field.tone)}`}>{field.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {actions ? <div className="erp-mobile-card-actions mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">{actions}</div> : null}
    </Tag>
  );
}

export function MobileRecordList({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`erp-mobile-card-list space-y-3 md:hidden ${className}`}>{children}</div>;
}

export function DesktopTableWrap({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`erp-desktop-table-wrap hidden md:block ${className}`}>
      <div className="erp-table-scroll-hint overflow-x-auto rounded-2xl border border-slate-200">{children}</div>
    </div>
  );
}
