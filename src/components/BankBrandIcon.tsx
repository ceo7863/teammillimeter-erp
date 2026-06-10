import React, { memo } from "react";
import { resolveBankBrandIconSrc } from "@/utils/bankBrandIcon";

type BankBrandIconProps = {
  bankName?: string | null;
  className?: string;
};

function BankBrandIconComponent({ bankName, className = "" }: BankBrandIconProps) {
  const src = resolveBankBrandIconSrc(bankName);
  if (!src) return null;

  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      className={`erp-bank-brand-icon${className ? ` ${className}` : ""}`}
      loading="lazy"
      decoding="async"
    />
  );
}

export const BankBrandIcon = memo(BankBrandIconComponent);
