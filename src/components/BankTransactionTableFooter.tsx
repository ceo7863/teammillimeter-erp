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
        ?? ?? <strong>{count.toLocaleString("ko-KR")}</strong>?
      </div>
      <div className="erp-bank-wehago-footer__right">
        <span>
          ??? ??: <strong className="text-emerald-700">{formatKRW(deposits)}</strong>
        </span>
        <span>
          ??? ??: <strong>{formatKRW(withdrawals)}</strong>
        </span>
        <span>
          ?? ??: <strong className={net >= 0 ? "text-emerald-700" : "text-red-600"}>{formatKRW(net)}</strong>
        </span>
      </div>
    </div>
  );
}
