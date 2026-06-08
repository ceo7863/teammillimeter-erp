import React, { memo } from "react";
import { AutoLinkBadge, ManualLinkBadge, PartialPaymentBadge } from "@/components/AutoLinkBadge";
import { MobileRecordCard, MobileRecordList } from "@/components/MobileRecordCard";
import {
  fallbackBankVirtualWindow,
  useBankContainerVirtualizer,
} from "@/hooks/useBankContainerVirtualizer";
import { BANK_TX_ACCOUNT_TRIGGER_ATTR } from "@/utils/floatingPosition";
import type { BankTransactionCompactRowLabels, BankTransactionCompactRowModel } from "@/components/BankTransactionCompactRow";
import type { BankTransactionSimpleTableLabels } from "@/components/BankTransactionSimpleTable";

const BANK_MOBILE_CARD_ESTIMATE_PX = 132;
const BANK_MOBILE_OVERSCAN = 8;
const BANK_MOBILE_VIRTUAL_MIN = 30;
const BANK_MOBILE_SCROLL_CLASS = "max-h-[calc(100vh-12rem)] overflow-auto overscroll-contain";

type BankTransactionMobileListProps = {
  rowIds: string[];
  getRowModel: (id: string) => BankTransactionCompactRowModel | undefined;
  labels: BankTransactionSimpleTableLabels;
  badgeLabels: BankTransactionCompactRowLabels;
  onEditAccountContent: (id: string) => void;
  onEditAccountSubject: (id: string) => void;
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

function renderMobileCard(
  id: string,
  model: BankTransactionCompactRowModel,
  labels: BankTransactionSimpleTableLabels,
  badgeLabels: BankTransactionCompactRowLabels,
  onEditAccountContent: (id: string) => void,
  onEditAccountSubject: (id: string) => void,
  onEditFixedExpense: (id: string) => void,
) {
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
            onClick={() => onEditAccountSubject(id)}
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
}

function BankTransactionMobileListComponent({
  rowIds,
  getRowModel,
  labels,
  badgeLabels,
  onEditAccountContent,
  onEditAccountSubject,
  onEditFixedExpense,
}: BankTransactionMobileListProps) {
  const useVirtualRows = rowIds.length >= BANK_MOBILE_VIRTUAL_MIN;

  const { scrollRef, virtualizer: rowVirtualizer } = useBankContainerVirtualizer({
    count: rowIds.length,
    enabled: useVirtualRows,
    estimateSize: () => BANK_MOBILE_CARD_ESTIMATE_PX,
    overscan: BANK_MOBILE_OVERSCAN,
    getItemKey: (index) => rowIds[index] ?? index,
  });

  if (!rowIds.length) {
    return (
      <MobileRecordList className="erp-bank-mobile-list">
        <MobileRecordCard empty emptyLabel={labels.empty} />
      </MobileRecordList>
    );
  }

  if (!useVirtualRows) {
    return (
      <MobileRecordList className="erp-bank-mobile-list">
        {rowIds.map((id) => {
          const model = getRowModel(id);
          if (!model) return null;
          return renderMobileCard(
            id,
            model,
            labels,
            badgeLabels,
            onEditAccountContent,
            onEditAccountSubject,
            onEditFixedExpense,
          );
        })}
      </MobileRecordList>
    );
  }

  const rawVirtualRows = rowVirtualizer.getVirtualItems();
  const virtualRows =
    rawVirtualRows.length === 0 && rowIds.length > 0
      ? fallbackBankVirtualWindow(
          rowIds.length,
          rowVirtualizer.scrollOffset,
          BANK_MOBILE_CARD_ESTIMATE_PX,
          BANK_MOBILE_OVERSCAN,
          scrollRef.current?.clientHeight ?? 720,
        )
      : rawVirtualRows;
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0;
  const paddingBottom =
    virtualRows.length > 0 ? rowVirtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end : 0;

  return (
    <div
      ref={scrollRef}
      className={`erp-bank-mobile-list erp-bank-mobile-scroll space-y-3 md:hidden ${useVirtualRows ? BANK_MOBILE_SCROLL_CLASS : "erp-bank-mobile-scroll--page"}`}
    >
      {paddingTop > 0 ? <div aria-hidden="true" style={{ height: paddingTop }} /> : null}
      {virtualRows.map((virtualRow) => {
        const id = rowIds[virtualRow.index]!;
        const model = getRowModel(id);
        if (!model) return null;
        return renderMobileCard(
          id,
          model,
          labels,
          badgeLabels,
          onEditAccountContent,
          onEditAccountSubject,
          onEditFixedExpense,
        );
      })}
      {paddingBottom > 0 ? <div aria-hidden="true" style={{ height: paddingBottom }} /> : null}
    </div>
  );
}

export const BankTransactionMobileList = memo(BankTransactionMobileListComponent);
