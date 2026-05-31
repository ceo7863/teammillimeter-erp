import React, { memo, useEffect, useRef, useState } from "react";

export type BankFolderSelectGroup = {
  label: string;
  options: Array<{ id: string; label: string }>;
};

type BankTransactionFolderAssignCellProps = {
  folderId: string;
  folderName?: string;
  groups: BankFolderSelectGroup[];
  unfiledLabel: string;
  onAssign: (folderId: string) => void;
};

function BankTransactionFolderAssignCellComponent({
  folderId,
  folderName,
  groups,
  unfiledLabel,
  onAssign,
}: BankTransactionFolderAssignCellProps) {
  const [open, setOpen] = useState(false);
  const selectRef = useRef<HTMLSelectElement>(null);
  const displayName = folderName || unfiledLabel;

  useEffect(() => {
    if (open) selectRef.current?.focus();
  }, [open]);

  if (!open) {
    return (
      <button
        type="button"
        className="erp-input max-w-[10rem] truncate rounded-lg py-1 text-left text-xs text-slate-700"
        title={displayName}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
      >
        {displayName} ?
      </button>
    );
  }

  return (
    <select
      ref={selectRef}
      className="erp-input max-w-[10rem] rounded-lg py-1 text-xs"
      value={folderId}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => {
        onAssign(event.target.value);
        setOpen(false);
      }}
      onBlur={() => setOpen(false)}
    >
      <option value="">{unfiledLabel}</option>
      {groups.map((group) => (
        <optgroup key={group.label} label={group.label}>
          {group.options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

export const BankTransactionFolderAssignCell = memo(BankTransactionFolderAssignCellComponent);
