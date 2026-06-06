import React, { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DesktopTableWrap } from "@/components/MobileRecordCard";
import {
  buildAccountDisplayRows,
  filterAccountCodesForManageView,
  isSecondaryAccountCode,
} from "@/utils/accountCodeTree";
import {
  DEFAULT_ACCOUNT_PARENT_GROUPS,
  type AccountCode,
  type AccountCodeFlow,
  type AccountCodeType,
} from "@/utils/ledgerSystem";
import { mergeStandardAccountCodes } from "@/utils/standardAccountCodes";

const L = {
  title: "\uBD84\uB958 \uACC4\uC815 \uAD00\uB9AC",
  guide: "\uAC00\uC774\uB4DC",
  account: "\uACC4\uC815",
  dept: "\uBD80\uC11C / \uADF8\uB8F9",
  client: "\uAC70\uB798\uCC98",
  all: "\uC804\uCCB4",
  deposit: "\uC785\uAE08",
  withdrawal: "\uCD9C\uAE08",
  search: "\uACC4\uC815 \uC774\uB984 \uAC80\uC0C9",
  primary: "1\uCC28",
  secondary: "2\uCC28",
  tertiary: "3\uCC28",
  addSub: "+\uD558\uC704 \uACC4\uC815",
  addAccount: "\uACC4\uC815 \uCD94\uAC00",
  addSubAccount: "\uD558\uC704 \uACC4\uC815 \uCD94\uAC00",
  loadStandard: "\uD45C\uC900 \uACC4\uC815 \uBD88\uB7EC\uC624\uAE30",
  loadStandardDone: (n: number) => `\uD45C\uC900 \uACC4\uC815 ${n}\uAC74\uC774 \uCD94\uAC00\uB418\uC5C8\uC2B5\uB2C8\uB2E4.`,
  loadStandardNone: "\uCD94\uAC00\uD560 \uD45C\uC900 \uACC4\uC815\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  name: "\uACC4\uC815\uBA85",
  code: "\uCF54\uB4DC",
  group: "1\uCC28 \uADF8\uB8F9",
  flow: "\uC785\uCD9C\uAE08",
  parentAccount: "2\uCC28 \uACC4\uC815",
  save: "\uC800\uC7A5",
  cancel: "\uCDE8\uC18C",
  active: "\uC0AC\uC6A9",
  inactive: "\uBE44\uD65C\uC131",
  rename: "\uC774\uB984 \uBCC0\uACBD",
  renameAccount: "\uACC4\uC815\uBA85 \uBCC0\uACBD",
  stubDept: "\uBD80\uC11C/\uADF8\uB8F9 \uAD00\uB9AC\uB294 \uCD94\uD6C4 \uC9C0\uC6D0 \uC608\uC815\uC785\uB2C8\uB2E4.",
  stubClient: "\uAC70\uB798\uCC98 \uB9C8\uC2A4\uD130\uB294 \uAE30\uBCF8\uC815\uBCF4 \uBA54\uB274\uC5D0\uC11C \uAD00\uB9AC\uD569\uB2C8\uB2E4.",
};

function AccountNameButton({
  account,
  className = "",
  onEdit,
}: {
  account: AccountCode;
  className?: string;
  onEdit: (account: AccountCode) => void;
}) {
  return (
    <button
      type="button"
      className={`text-left hover:text-blue-700 hover:underline ${className}`}
      onClick={() => onEdit(account)}
      title={L.rename}
    >
      {account.name}
    </button>
  );
}
type SidebarKey = "account" | "dept" | "client";
type FlowFilter = "all" | "income" | "expense";
type ModalMode = "secondary" | "tertiary" | "edit";

type LedgerClassificationManagePageProps = {
  accountCodes: AccountCode[];
  setAccountCodes: React.Dispatch<React.SetStateAction<AccountCode[]>>;
  onRequestImmediateSave?: (patch?: { accountCodes?: AccountCode[] }) => void | Promise<void>;
};

function nextAccountCode(rows: AccountCode[]) {
  const nums = rows
    .map((row) => Number(row.code))
    .filter((n) => Number.isFinite(n) && n > 0);
  const max = nums.length ? Math.max(...nums) : 500;
  return String(max + 1);
}

export function LedgerClassificationManagePage({
  accountCodes,
  setAccountCodes,
  onRequestImmediateSave,
}: LedgerClassificationManagePageProps) {
  const [sidebar, setSidebar] = useState<SidebarKey>("account");
  const [flowFilter, setFlowFilter] = useState<FlowFilter>("all");
  const [search, setSearch] = useState("");
  const [loadMessage, setLoadMessage] = useState("");
  const [modalMode, setModalMode] = useState<ModalMode | null>(null);
  const [parentForSub, setParentForSub] = useState<AccountCode | null>(null);
  const [editingAccount, setEditingAccount] = useState<AccountCode | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftGroup, setDraftGroup] = useState<string>(DEFAULT_ACCOUNT_PARENT_GROUPS[3]);
  const [draftFlow, setDraftFlow] = useState<AccountCodeFlow>("expense");

  const filteredCodes = useMemo(
    () => filterAccountCodesForManageView(accountCodes, flowFilter, search),
    [accountCodes, flowFilter, search],
  );

  const displayRows = useMemo(() => {
    const visible = new Set(filteredCodes.map((row) => row.code));
    return buildAccountDisplayRows(accountCodes).filter((row) => visible.has(row.account.code));
  }, [accountCodes, filteredCodes]);

  const parentGroups = useMemo(() => {
    const set = new Set<string>([...DEFAULT_ACCOUNT_PARENT_GROUPS]);
    for (const row of accountCodes) {
      if (row.parentGroup && isSecondaryAccountCode(row)) set.add(row.parentGroup);
    }
    return [...set];
  }, [accountCodes]);

  const openSecondaryModal = () => {
    setModalMode("secondary");
    setParentForSub(null);
    setEditingAccount(null);
    setDraftName("");
    setDraftGroup(DEFAULT_ACCOUNT_PARENT_GROUPS[3]);
    setDraftFlow("expense");
  };

  const openTertiaryModal = (parent: AccountCode) => {
    setModalMode("tertiary");
    setParentForSub(parent);
    setEditingAccount(null);
    setDraftName("");
  };

  const openEditModal = (account: AccountCode) => {
    setModalMode("edit");
    setParentForSub(null);
    setEditingAccount(account);
    setDraftName(account.name);
  };

  const closeModal = () => {
    setModalMode(null);
    setParentForSub(null);
    setEditingAccount(null);
    setDraftName("");
  };

  const loadStandardAccounts = () => {
    const updated = mergeStandardAccountCodes(accountCodes) as AccountCode[];
    const added = updated.length - accountCodes.length;
    if (added <= 0) {
      setLoadMessage(L.loadStandardNone);
      return;
    }
    setAccountCodes(updated);
    setLoadMessage(L.loadStandardDone(added));
    void onRequestImmediateSave?.({ accountCodes: updated });
  };

  const saveRenameAccount = () => {
    const name = draftName.trim();
    if (!name || !editingAccount) return;
    if (name === editingAccount.name) {
      closeModal();
      return;
    }

    const updated = accountCodes.map((row) =>
      row.code === editingAccount.code ? { ...row, name } : row,
    );
    setAccountCodes(updated);
    closeModal();
    void onRequestImmediateSave?.({ accountCodes: updated });
  };

  const saveNewAccount = () => {
    const name = draftName.trim();
    if (!name) return;

    const code = nextAccountCode(accountCodes);
    let next: AccountCode;

    if (modalMode === "tertiary" && parentForSub) {
      next = {
        code,
        name,
        type: parentForSub.type,
        isActive: true,
        parentGroup: parentForSub.parentGroup,
        parentAccountCode: parentForSub.code,
        flow: parentForSub.flow,
      };
    } else {
      const type: AccountCodeType = draftFlow === "income" ? "income" : "expense";
      next = {
        code,
        name,
        type,
        isActive: true,
        parentGroup: draftGroup,
        flow: draftFlow,
      };
    }

    const updated = [...accountCodes, next];
    setAccountCodes(updated);
    closeModal();
    void onRequestImmediateSave?.({ accountCodes: updated });
  };

  const toggleActive = (code: string) => {
    const updated = accountCodes.map((row) =>
      row.code === code ? { ...row, isActive: !row.isActive } : row,
    );
    setAccountCodes(updated);
    void onRequestImmediateSave?.({ accountCodes: updated });
  };

  return (
    <div className="erp-ledger-classify-page space-y-4">
      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-4 md:p-5">
          <div className="flex items-center gap-2">
            <h2 className="erp-text-page-title text-slate-900">{L.title}</h2>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">{L.guide}</span>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[12rem_1fr]">
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="space-y-1 p-3">
            {(
              [
                ["account", L.account],
                ["dept", L.dept],
                ["client", L.client],
              ] as Array<[SidebarKey, string]>
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`w-full rounded-xl px-3 py-2 text-left text-sm font-bold ${
                  sidebar === key ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
                }`}
                onClick={() => setSidebar(key)}
              >
                {label}
              </button>
            ))}
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-4">
            {sidebar === "account" ? (
              <>
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  {(["all", "income", "expense"] as FlowFilter[]).map((key) => (
                    <Button
                      key={key}
                      type="button"
                      size="sm"
                      variant={flowFilter === key ? "default" : "outline"}
                      className="rounded-xl"
                      onClick={() => setFlowFilter(key)}
                    >
                      {key === "all" ? L.all : key === "income" ? L.deposit : L.withdrawal}
                    </Button>
                  ))}
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={L.search}
                    className="erp-input ml-auto min-w-[12rem] flex-1 rounded-xl border border-slate-200 px-3 py-2"
                  />
                  <Button type="button" size="sm" variant="outline" className="rounded-xl" onClick={loadStandardAccounts}>
                    {L.loadStandard}
                  </Button>
                  <Button type="button" size="sm" className="rounded-xl" onClick={openSecondaryModal}>
                    <Plus size={14} className="mr-1" />
                    {L.addAccount}
                  </Button>
                </div>
                {loadMessage ? <p className="mb-3 text-xs font-semibold text-emerald-700">{loadMessage}</p> : null}

                <DesktopTableWrap>
                  <table className="erp-table w-full">
                    <thead>
                      <tr>
                        <th>{L.primary}</th>
                        <th>{L.secondary}</th>
                        <th>{L.tertiary}</th>
                        <th>{L.code}</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {displayRows.map((row) => {
                        const account = row.account;
                        const isSecondary = row.kind === "secondary";
                        return (
                          <tr key={account.code} className={account.isActive ? "" : "opacity-50"}>
                            <td className="font-medium text-slate-700">
                              {isSecondary ? account.parentGroup || "-" : ""}
                            </td>
                            <td className="font-semibold text-slate-900">
                              {isSecondary ? (
                                <AccountNameButton account={account} onEdit={openEditModal} />
                              ) : row.parentAccount ? (
                                <AccountNameButton
                                  account={row.parentAccount}
                                  className="text-slate-500"
                                  onEdit={openEditModal}
                                />
                              ) : (
                                "-"
                              )}
                            </td>
                            <td className={isSecondary ? "text-slate-400" : "font-semibold text-slate-800 pl-4"}>
                              {isSecondary ? (
                                <button
                                  type="button"
                                  className="text-xs font-semibold text-blue-600 hover:text-blue-800"
                                  onClick={() => openTertiaryModal(account)}
                                >
                                  {L.addSub}
                                </button>
                              ) : (
                                <AccountNameButton account={account} onEdit={openEditModal} />
                              )}
                            </td>
                            <td className="font-mono text-xs text-slate-500">{account.code}</td>
                            <td className="text-right">
                              <button
                                type="button"
                                className="text-xs font-semibold text-slate-500 hover:text-slate-800"
                                onClick={() => toggleActive(account.code)}
                              >
                                {account.isActive ? L.inactive : L.active}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </DesktopTableWrap>
              </>
            ) : sidebar === "dept" ? (
              <p className="py-10 text-center text-sm text-slate-500">{L.stubDept}</p>
            ) : (
              <p className="py-10 text-center text-sm text-slate-500">{L.stubClient}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {modalMode ? (
        <div className="erp-ledger-modal-backdrop" onClick={closeModal}>
          <div
            className="erp-ledger-modal max-w-md"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <h3 className="erp-text-section mb-4 font-bold">
              {modalMode === "edit"
                ? L.renameAccount
                : modalMode === "tertiary"
                  ? L.addSubAccount
                  : L.addAccount}
            </h3>
            <div className="space-y-3">
              {modalMode === "edit" && editingAccount ? (
                <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  {L.code}: <span className="font-mono font-semibold text-slate-900">{editingAccount.code}</span>
                  {editingAccount.parentGroup ? (
                    <span className="text-slate-500"> · {editingAccount.parentGroup}</span>
                  ) : null}
                </p>
              ) : null}
              {modalMode === "tertiary" && parentForSub ? (
                <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  {L.parentAccount}: <span className="font-semibold text-slate-900">{parentForSub.name}</span>
                  {parentForSub.parentGroup ? (
                    <span className="text-slate-500"> ({parentForSub.parentGroup})</span>
                  ) : null}
                </p>
              ) : null}
              <label className="block text-sm font-semibold text-slate-600">
                {L.name}
                <input
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  className="erp-input mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                  autoFocus
                />
              </label>
              {modalMode === "secondary" ? (
                <>
                  <label className="block text-sm font-semibold text-slate-600">
                    {L.group}
                    <select
                      value={draftGroup}
                      onChange={(e) => setDraftGroup(e.target.value)}
                      className="erp-input mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                    >
                      {parentGroups.map((group) => (
                        <option key={group} value={group}>
                          {group}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm font-semibold text-slate-600">
                    {L.flow}
                    <select
                      value={draftFlow}
                      onChange={(e) => setDraftFlow(e.target.value as AccountCodeFlow)}
                      className="erp-input mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                    >
                      <option value="income">{L.deposit}</option>
                      <option value="expense">{L.withdrawal}</option>
                      <option value="both">{L.all}</option>
                    </select>
                  </label>
                </>
              ) : null}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="outline" className="rounded-xl" onClick={closeModal}>
                {L.cancel}
              </Button>
              <Button
                type="button"
                className="rounded-xl"
                onClick={modalMode === "edit" ? saveRenameAccount : saveNewAccount}
                disabled={!draftName.trim()}
              >
                {L.save}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
