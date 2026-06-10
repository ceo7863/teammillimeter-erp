import React from "react";
import { formatKRW } from "@/utils/receivables";

type BankTransactionTableFooterProps = {
  count: number;
  deposits: number;
  withdrawals: number;
  net: number;
};

export function BankTransactionTableFooter({ count, deposits, withdrawals, net }: BankTransactionTableFooterProps) {
  return (
    <div className="erp-bank-wehago-footer">
      <div className="erp-bank-wehago-footer__left">
        {"\uCD1D \uD569\uACC4 "}
        <strong>{count.toLocaleString("ko-KR")}</strong>
        {"\uAC74"}
      </div>
      <div className="erp-bank-wehago-footer__right">
        <span className="erp-bank-wehago-footer__stat">
          {"\uC785\uAE08 \uD569\uACC4"}
          <strong className="text-emerald-700">{formatKRW(deposits)}</strong>
        </span>
        <span className="erp-bank-wehago-footer__stat">
          {"\uCD9C\uAE08 \uD569\uACC4"}
          <strong>{formatKRW(withdrawals)}</strong>
        </span>
        <span className="erp-bank-wehago-footer__stat">
          {"\uC21C \uD569\uACC4"}
          <strong className={net >= 0 ? "text-emerald-700" : "text-red-600"}>{formatKRW(net)}</strong>
        </span>
      </div>
    </div>
  );
}
