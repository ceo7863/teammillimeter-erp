import React, { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DesktopTableWrap } from "@/components/MobileRecordCard";
import {
  DEFAULT_ACCOUNT_PARENT_GROUPS,
  filterAccountCodesByFlow,
  type AccountCode,
  type AccountCodeFlow,
  type AccountCodeType,
} from "@/utils/ledgerSystem";

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
  addSub: "+\uD558\uC704 \uACC4\uC815",
  addAccount: "\uACC4\uC815 \uCD94\uAC00",
  name: "\uACC4\uC815\uBA85",
  code: "\uCF54\uB4DC",
  group: "1\uCC28 \uADF8\uB8F9",
  flow: "\uC785\uCD9C\uAE08",
  save: "\uC800\uC7A5",
  cancel: "\uCDE8\uC18C",
  active: "\uC0AC\uC6A9",
  inactive: "\uBE44\uD65C\uC131",
  stubDept: "\uBD80\uC11C/\uADF8\uB8F9 \uAD00\uB9AC\uB294 \uCD94\uD6C4 \uC9C0\uC6D0 \uC608\uC815\uC785\uB2C8\uB2E4.",
  stubClient: "\uAC70\uB798\uCC98 \uB9C8\uC2A4\uD130\uB294 \uAE30\uBCF8\uC815\uBCF4 \uBA54\uB274\uC5D0\uC11C \uAD00\uB9AC\uD569\uB2C8\uB2E4.",
};

type SidebarKey = "account" | "dept" | "client";
type FlowFilter = "all" | "income" | "expense";

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
  const [addOpen, setAddOpen] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftGroup, setDraftGroup] = useState<string>(DEFAULT_ACCOUNT_PARENT_GROUPS[3]);
  const [draftFlow, setDraftFlow] = useState<AccountCodeFlow>("expense");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return filterAccountCodesByFlow(accountCodes, flowFilter)
      .filter((row) => {
        if (!q) return true;
        return [row.name, row.code, row.parentGroup].filter(Boolean).join(" ").toLowerCase().includes(q);
      })
      .sort(
        (a, b) =>
          String(a.parentGroup || "").localeCompare(String(b.parentGroup || ""), "ko") ||
          a.name.localeCompare(b.name, "ko"),
      );
  }, [accountCodes, flowFilter, search]);

  const parentGroups = useMemo(() => {
    const set = new Set<string>([...DEFAULT_ACCOUNT_PARENT_GROUPS]);
    for (const row of accountCodes) {
      if (row.parentGroup) set.add(row.parentGroup);
    }
    return [...set];
  }, [accountCodes]);

  const saveNewAccount = () => {
    const name = draftName.trim();
    if (!name) return;
    const code = nextAccountCode(accountCodes);
    const type: AccountCodeType = draftFlow === "income" ? "income" : "expense";
    const next: AccountCode = {
      code,
      name,
      type,
      isActive: true,
      parentGroup: draftGroup,
      flow: draftFlow,
    };
    const updated = [...accountCodes, next];
    setAccountCodes(updated);
    setAddOpen(false);
    setDraftName("");
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
                  <Button type="button" size="sm" className="rounded-xl" onClick={() => setAddOpen(true)}>
                    <Plus size={14} className="mr-1" />
                    {L.addAccount}
                  </Button>
                </div>

                <DesktopTableWrap>
                  <table className="erp-table w-full">
                    <thead>
                      <tr>
                        <th>{L.primary}</th>
                        <th>{L.secondary}</th>
                        <th>{L.code}</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((row) => (
                        <tr key={row.code} className={row.isActive ? "" : "opacity-50"}>
                          <td className="font-medium text-slate-700">{row.parentGroup || "-"}</td>
                          <td className="font-semibold text-slate-900">{row.name}</td>
                          <td className="font-mono text-xs text-slate-500">{row.code}</td>
                          <td className="text-right">
                            <button
                              type="button"
                              className="text-xs font-semibold text-slate-500 hover:text-slate-800"
                              onClick={() => toggleActive(row.code)}
                            >
                              {row.isActive ? L.inactive : L.active}
                            </button>
                          </td>
                        </tr>
                      ))}
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

      {addOpen ? (
        <div className="erp-ledger-modal-backdrop" onClick={() => setAddOpen(false)}>
          <div
            className="erp-ledger-modal max-w-md"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <h3 className="erp-text-section mb-4 font-bold">{L.addAccount}</h3>
            <div className="space-y-3">
              <label className="block text-sm font-semibold text-slate-600">
                {L.name}
                <input
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  className="erp-input mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                />
              </label>
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
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setAddOpen(false)}>
                {L.cancel}
              </Button>
              <Button type="button" className="rounded-xl" onClick={saveNewAccount}>
                {L.save}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
