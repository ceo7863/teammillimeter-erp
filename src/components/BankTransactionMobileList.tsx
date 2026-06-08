import React, { memo, useLayoutEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { AutoLinkBadge, ManualLinkBadge, PartialPaymentBadge } from "@/components/AutoLinkBadge";
import { MobileRecordCard, MobileRecordList } from "@/components/MobileRecordCard";
import { BANK_TX_ACCOUNT_TRIGGER_ATTR } from "@/utils/floatingPosition";
import type { BankTransactionCompactRowLabels, BankTransactionCompactRowModel } from "@/components/BankTransactionCompactRow";
import type { BankTransactionSimpleTableLabels } from "@/components/BankTransactionSimpleTable";

const BANK_MOBILE_CARD_ESTIMATE_PX = 132;
const BANK_MOBILE_OVERSCAN = 3;
const BANK_MOBILE_VIRTUAL_MIN = 18;
const BANK_MOBILE_SCROLL_HEIGHT_CLASS = "h-[min(72vh,960px)]";

type BankTransactionMobileListProps = {
  rowIds: string[];
  rowModels: Map<string, BankTransactionCompactRowModel>;
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
  rowModels,
  labels,
  badgeLabels,
  onEditAccountContent,
  onEditAccountSubject,
  onEditFixedExpense,
}: BankTransactionMobileListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const useVirtualRows = rowIds.length >= BANK_MOBILE_VIRTUAL_MIN;

  const rowVirtualizer = useVirtualizer({
    count: useVirtualRows ? rowIds.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => BANK_MOBILE_CARD_ESTIMATE_PX,
    overscan: BANK_MOBILE_OVERSCAN,
    getItemKey: (index) => rowIds[index] ?? index,
  });

  useLayoutEffect(() => {
    if (!useVirtualRows) return;
    rowVirtualizer.measure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowIds.length, useVirtualRows]);

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
          const model = rowModels.get(id);
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

  const virtualRows = rowVirtualizer.getVirtualItems();
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0;
  const paddingBottom =
    virtualRows.length > 0 ? rowVirtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end : 0;

  return (
    <div
      ref={scrollRef}
      className={`erp-bank-mobile-list erp-bank-mobile-scroll ${BANK_MOBILE_SCROLL_HEIGHT_CLASS} space-y-3 overflow-auto overscroll-contain md:hidden`}
    >
      {paddingTop > 0 ? <div aria-hidden="true" style={{ height: paddingTop }} /> : null}
      {virtualRows.map((virtualRow) => {
        const id = rowIds[virtualRow.index]!;
        const model = rowModels.get(id);
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
