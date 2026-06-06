import React, { memo } from "react";
import { DesktopTableWrap } from "@/components/MobileRecordCard";
import {
  BankTransactionCompactRow,
  type BankTransactionCompactRowLabels,
  type BankTransactionCompactRowModel,
} from "@/components/BankTransactionCompactRow";

export type BankTransactionSimpleTableLabels = {
  transactionAt: string;
  deposit: string;
  withdrawal: string;
  balance: string;
  description: string;
  accountContent: string;
  category: string;
  fixedExpense: string;
  classification: string;
  matchStatus: string;
  empty: string;
  accountContentPlaceholder: string;
  categoryPlaceholder: string;
  fixedExpensePlaceholder: string;
};

type BankTransactionSimpleTableProps = {
  rowIds: string[];
  rowModels: Map<string, BankTransactionCompactRowModel>;
  labels: BankTransactionSimpleTableLabels;
  badgeLabels: BankTransactionCompactRowLabels;
  onEditAccountContent: (id: string) => void;
  onEditAccountSubject: (id: string) => void;
  onEditFixedExpense: (id: string) => void;
};

function BankTransactionSimpleTableComponent({
  rowIds,
  rowModels,
  labels,
  badgeLabels,
  onEditAccountContent,
  onEditAccountSubject,
  onEditFixedExpense,
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
            <th>{labels.accountContent}</th>
            <th>{labels.category}</th>
            <th>{labels.fixedExpense}</th>
            <th>{labels.classification}</th>
            <th>{labels.matchStatus}</th>
          </tr>
        </thead>
        <tbody>
          {!rowIds.length ? (
            <tr>
              <td colSpan={10} className="py-12 text-center text-slate-500">
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
                  labels={badgeLabels}
                  tableLabels={labels}
                  onEditAccountContent={onEditAccountContent}
                  onEditAccountSubject={onEditAccountSubject}
                  onEditFixedExpense={onEditFixedExpense}
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
