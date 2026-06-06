import React, { memo } from "react";
import { AutoLinkBadge, ManualLinkBadge, PartialPaymentBadge } from "@/components/AutoLinkBadge";
import { MobileRecordCard, MobileRecordList } from "@/components/MobileRecordCard";
import { BANK_TX_ACCOUNT_TRIGGER_ATTR } from "@/utils/floatingPosition";
import type { BankTransactionCompactRowLabels, BankTransactionCompactRowModel } from "@/components/BankTransactionCompactRow";
import type { BankTransactionSimpleTableLabels } from "@/components/BankTransactionSimpleTable";

type BankTransactionMobileListProps = {
  rowIds: string[];
  rowModels: Map<string, BankTransactionCompactRowModel>;
  labels: BankTransactionSimpleTableLabels;
  badgeLabels: BankTransactionCompactRowLabels;
  onEditAccountContent: (id: string) => void;
  onEditCategory: (id: string) => void;
  onEditFixedExpense: (id: string) => void;
};

function preauthNetBadgeLabel(
  netGroupRole: BankTransactionCompactRowModel["netGroupRole"],
  badgeLabels: BankTransactionCompactRowLabels,
) {
  if (!netGroupRole) return null;
  if (netGroupRole === "settlement") return badgeLabels.preauthNetSettlementBadge;
  if (netGroupRole === "preauth_refund") return badgeLabels.preauthNetRefundBadge;
  return badgeLabels.preauthNetSuppressedBadge;
}

function BankTransactionMobileListComponent({
  rowIds,
  rowModels,
  labels,
  badgeLabels,
  onEditAccountContent,
  onEditCategory,
  onEditFixedExpense,
}: BankTransactionMobileListProps) {
  return (
    <MobileRecordList className="erp-bank-mobile-list">
      {rowIds.length ? (
        rowIds.map((id) => {
          const model = rowModels.get(id);
          if (!model) return null;

          const isDeposit = model.depositLabel !== "-";
          const classificationLabel =
            model.folderName && model.folderType ? model.folderName : model.classificationLabel;

          const badges: { label: string; tone?: "default" | "success" | "muted" }[] = [];
          if (classificationLabel) {
            badges.push({
              label: classificationLabel,
              tone: model.folderType ? "default" : "muted",
            });
          }
          const preauthLabel = preauthNetBadgeLabel(model.netGroupRole, badgeLabels);
          if (preauthLabel) badges.push({ label: preauthLabel, tone: "muted" });
          if (model.matchLinked) {
            badges.push({ label: model.matchStatusLabel, tone: "success" });
          } else if (model.matchStatusLabel !== "-") {
            badges.push({ label: model.matchStatusLabel, tone: "muted" });
          }
          if (model.categoryLabel) {
            badges.push({ label: model.categoryLabel, tone: "default" });
          }
          if (model.fixedExpenseLabel) {
            badges.push({ label: model.fixedExpenseLabel, tone: "default" });
          }

          return (
            <MobileRecordCard
              key={id}
              title={model.description}
              subtitle={model.dateLabel}
              badges={badges}
              amount={{
                label: isDeposit ? labels.deposit : labels.withdrawal,
                value: isDeposit ? model.depositLabel : model.withdrawalLabel,
                tone: isDeposit ? "success" : "danger",
              }}
              fields={[
                { label: labels.balance, value: model.balanceLabel },
                {
                  label: labels.accountContent,
                  value: model.accountContentEmpty ? labels.accountContentPlaceholder : model.accountContentLabel,
                  tone: "muted",
                },
                {
                  label: labels.category,
                  value: model.accountSubjectLabel || labels.categoryPlaceholder,
                  tone: "muted",
                },
                {
                  label: labels.fixedExpense,
                  value: model.fixedExpenseLabel || labels.fixedExpensePlaceholder,
                  tone: "muted",
                },
              ]}
              actions={
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700"
                    onClick={() => onEditAccountContent(id)}
                  >
                    {labels.accountContent}
                  </button>
                  <button
                    type="button"
                    {...{ [BANK_TX_ACCOUNT_TRIGGER_ATTR]: id }}
                    className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700"
                    onClick={() => onEditCategory(id)}
                  >
                    {labels.category}
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700"
                    onClick={() => onEditFixedExpense(id)}
                  >
                    {labels.fixedExpense}
                  </button>
                  {model.matchLinked ? (
                    <>
                      {model.showAutoLinkBadge ? <AutoLinkBadge title={badgeLabels.autoLinkBadgeTitle} /> : null}
                      {model.showManualLinkBadge ? <ManualLinkBadge title={badgeLabels.manualLinkBadgeTitle} /> : null}
                      {model.showPartialPaymentBadge ? (
                        <PartialPaymentBadge title={badgeLabels.partialPaymentBadgeTitle} />
                      ) : null}
                    </>
                  ) : null}
                </div>
              }
            />
          );
        })
      ) : (
        <MobileRecordCard empty emptyLabel={labels.empty} />
      )}
    </MobileRecordList>
  );
}

export const BankTransactionMobileList = memo(BankTransactionMobileListComponent);
