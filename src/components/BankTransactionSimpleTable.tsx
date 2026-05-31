import React, { memo } from "react";
import { DesktopTableWrap } from "@/components/MobileRecordCard";
import {
  BankTransactionCompactRow,
  type BankTransactionCompactRowModel,
} from "@/components/BankTransactionCompactRow";

export type BankTransactionSimpleTableLabels = {
  transactionAt: string;
  deposit: string;
  withdrawal: string;
  balance: string;
  description: string;
  memo: string;
  counterpartyName: string;
  ledgerCategoryColumn: string;
  classification: string;
  counterpartyBank: string;
  matchStatus: string;
  transactionType: string;
  empty: string;
};

type BankTransactionSimpleTableProps = {
  rowIds: string[];
  rowModels: Map<string, BankTransactionCompactRowModel>;
  labels: BankTransactionSimpleTableLabels;
  selectedTxId: string | null;
  onSelect: (id: string) => void;
};

function BankTransactionSimpleTableComponent({
  rowIds,
  rowModels,
  labels,
  selectedTxId,
  onSelect,
}: BankTransactionSimpleTableProps) {
  return (
    <DesktopTableWrap>
      <table id="bank-transactions-table" className="erp-table erp-bank-table w-full min-w-[960px]">
        <thead>
          <tr className="bg-slate-100 text-left text-slate-600">
              <th>{labels.transactionAt}</th>
              <th className="text-right">{labels.deposit}</th>
              <th className="text-right">{labels.withdrawal}</th>
              <th className="text-right">{labels.balance}</th>
              <th>{labels.description}</th>
              <th>{labels.memo}</th>
              <th>{labels.counterpartyName}</th>
              <th>{labels.ledgerCategoryColumn}</th>
              <th>{labels.classification}</th>
              <th>{labels.counterpartyBank}</th>
              <th>{labels.matchStatus}</th>
              <th>{labels.transactionType}</th>
            </tr>
          </thead>
          <tbody>
            {!rowIds.length ? (
              <tr>
                <td colSpan={12} className="py-12 text-center text-slate-500">
                  {labels.empty}
                </td>
              </tr>
            ) : (
              rowIds.map((id) => {
                const model = rowModels.get(id);
                if (!model) return null;
                return (
                  <BankTransactionCompactRow
                    key={id}
                    {...model}
                    isSelected={selectedTxId === id}
                    onSelect={onSelect}
                  />
                );
              })
            )}
          </tbody>
      </table>
    </DesktopTableWrap>
  );
}

export const BankTransactionSimpleTable = memo(BankTransactionSimpleTableComponent);
