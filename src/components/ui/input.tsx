import React from "react";

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export function Input({ className = "", ...props }: InputProps) {
  return (
    <input
      {...props}
      className={`erp-input w-full rounded-lg px-2.5 py-1.5 text-sm font-semibold ${className}`.trim()}
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
    />
  );
}
