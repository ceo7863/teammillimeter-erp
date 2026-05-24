import React from "react";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: string;
  size?: string;
};

export function Button({ className = "", variant, size, children, ...props }: ButtonProps) {
  const variantClass =
    variant === "outline"
      ? "border border-slate-300 bg-white text-slate-900 hover:bg-slate-50"
      : "bg-slate-900 text-white hover:bg-slate-800";

  const sizeClass = size === "sm" ? "px-3 py-1.5 erp-text-caption" : "px-4 py-2 erp-text-body";

  return (
    <button
      className={`inline-flex items-center justify-center gap-2 font-semibold transition ${variantClass} ${sizeClass} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
