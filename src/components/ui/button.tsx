import React from "react";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: string;
  size?: string;
  /** Toast message after click */
  feedback?: string;
  feedbackTone?: "success" | "info" | "error";
  /** Disable click flash + toast (navigation, cancel, etc.) */
  noFeedback?: boolean;
};

export function Button({
  className = "",
  variant,
  size,
  children,
  feedback,
  feedbackTone = "success",
  noFeedback = false,
  ...props
}: ButtonProps) {
  const variantClass =
    variant === "outline"
      ? "erp-ui-btn erp-ui-btn--outline"
      : variant === "ghost"
        ? "erp-ui-btn erp-ui-btn--ghost"
        : "erp-ui-btn erp-ui-btn--primary";

  const sizeClass =
    size === "sm" ? "erp-ui-btn--sm" : size === "lg" ? "erp-ui-btn--lg" : "erp-ui-btn--md";

  return (
    <button
      className={`erp-ui-btn ${variantClass} ${sizeClass} ${className}`}
      data-action-feedback={!noFeedback && feedback ? feedback : undefined}
      data-action-feedback-tone={feedbackTone}
      data-no-action-feedback={noFeedback ? "" : undefined}
      {...props}
    >
      {children}
    </button>
  );
}
