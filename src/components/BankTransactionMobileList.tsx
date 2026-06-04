import React, { memo } from "react";
import { AutoLinkBadge, ManualLinkBadge, PartialPaymentBadge } from "@/components/AutoLinkBadge";
import { MobileRecordCard, MobileRecordList } from "@/components/MobileRecordCard";
import type { BankTransactionCompactRowLabels, BankTransactionCompactRowModel } from "@/components/BankTransactionCompactRow";
import type { BankTransactionSimpleTableLabels } from "@/components/BankTransactionSimpleTable";

type BankTransactionMobileListProps = {
  rowIds: string[];
  rowModels: Map<string, BankTransactionCompactRowModel>;
  labels: BankTransactionSimpleTableLabels;
  badgeLabels: BankTransactionCompactRowLabels;
  selectedTxId: string | null;
  onSelect: (id: string) => void;
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
  selectedTxId,
  onSelect,
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
          if (model.ledgerCategory) {
            badges.push({ label: model.ledgerCategory, tone: "default" });
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
                { label: labels.counterpartyName, value: model.counterpartyLabel },
                { label: labels.memo, value: model.memoLabel, tone: "muted" },
                ...(model.counterpartyBank !== "-"
                  ? [{ label: labels.counterpartyBank, value: model.counterpartyBank, tone: "muted" as const }]
                  : []),
                ...(model.transactionType !== "-"
                  ? [{ label: labels.transactionType, value: model.transactionType, tone: "muted" as const }]
                  : []),
              ]}
              selected={selectedTxId === id}
              onClick={() => onSelect(id)}
              actions={
                model.matchLinked ? (
                  <div className="flex flex-wrap items-center gap-1">
                    {model.showAutoLinkBadge ? <AutoLinkBadge title={badgeLabels.autoLinkBadgeTitle} /> : null}
                    {model.showManualLinkBadge ? <ManualLinkBadge title={badgeLabels.manualLinkBadgeTitle} /> : null}
                    {model.showPartialPaymentBadge ? (
                      <PartialPaymentBadge title={badgeLabels.partialPaymentBadgeTitle} />
                    ) : null}
                  </div>
                ) : undefined
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
