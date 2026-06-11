import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Building2, HardHat, X } from "lucide-react";
import { AutocompleteInput } from "@/components/AutocompleteInput";
import { Button } from "@/components/ui/button";
import type { BankTransaction } from "@/utils/bankTransactions";
import { resolveBankTxPartyKind } from "@/utils/bankTransactionListDisplay";
import type { BankTransactionFolder } from "@/utils/bankTransactionFolders";

type PartyKind = "client" | "worker";
type Step = "choose" | "search";

type PartyOption = {
  label: string;
  value: string;
  raw: Record<string, unknown> | null;
};

export type BankTxPartyEditModalProps = {
  tx: BankTransaction;
  draft: string;
  clients: Array<{ name?: string; manager?: string; depositNameAliases?: string }>;
  workers: Array<{ name?: string; businessNo?: string; depositNameAliases?: string }>;
  bankTransactionFolders: BankTransactionFolder[];
  error?: string;
  onClose: () => void;
  onDraftChange: (value: string) => void;
  onSave: () => void;
};

const L = {
  title: "\uAC70\uB798\uCC98 \u00B7 \uC2DC\uACF5\uC790",
  chooseDesc: "\uAD6C\uBD84\uC744 \uC120\uD0DD\uD55C \uB4A4 \uC774\uB984\uC744 \uAC80\uC0C9\uD558\uC138\uC694.",
  client: "\uAC70\uB798\uCC98",
  worker: "\uC2DC\uACF5\uC790",
  searchClient: "\uAC70\uB798\uCC98 \uAC80\uC0C9",
  searchWorker: "\uC2DC\uACF5\uC790 \uAC80\uC0C9",
  clientPlaceholder: "\uAC70\uB798\uCC98 \uC774\uB984 \uAC80\uC0C9",
  workerPlaceholder: "\uC2DC\uACF5\uC790 \uC774\uB984 \uAC80\uC0C9",
  clear: "\ube44\uc6b0\uae30",
  back: "\uC774\uC804",
  cancel: "\uCDE8\uC18C",
  save: "\uC800\uC7A5",
  current: (name: string) => `\uD604\uC7AC: ${name}`,
};

function buildClientOptions(
  clients: BankTxPartyEditModalProps["clients"],
): PartyOption[] {
  return [...clients]
    .filter((client) => String(client.name || "").trim())
    .sort((a, b) => String(a.name).localeCompare(String(b.name), "ko"))
    .map((client) => ({
      label: String(client.name),
      value: String(client.name),
      raw: client as Record<string, unknown>,
    }));
}

function buildWorkerOptions(
  workers: BankTxPartyEditModalProps["workers"],
): PartyOption[] {
  return [...workers]
    .filter((worker) => String(worker.name || "").trim())
    .sort((a, b) => String(a.name).localeCompare(String(b.name), "ko"))
    .map((worker) => ({
      label: String(worker.name),
      value: String(worker.name),
      raw: worker as Record<string, unknown>,
    }));
}

function inferPartyKind(
  tx: BankTransaction,
  draft: string,
  clients: BankTxPartyEditModalProps["clients"],
  workers: BankTxPartyEditModalProps["workers"],
  bankTransactionFolders: BankTransactionFolder[],
): PartyKind | null {
  const folder = tx.folderId
    ? bankTransactionFolders.find((row) => row.id === tx.folderId)
    : undefined;
  const kind = resolveBankTxPartyKind(tx, folder, draft || null, clients, workers);
  if (kind === "client" || kind === "worker") return kind;
  const name = draft.trim();
  if (!name) return null;
  if (workers.some((row) => String(row.name || "").trim() === name)) return "worker";
  if (clients.some((row) => String(row.name || "").trim() === name)) return "client";
  return null;
}

function PartyKindCard({
  kind,
  selected,
  onSelect,
}: {
  kind: PartyKind;
  selected: boolean;
  onSelect: () => void;
}) {
  const isClient = kind === "client";
  return (
    <button
      type="button"
      className={[
        "flex min-h-[7.5rem] flex-col items-center justify-center gap-2 rounded-2xl border-2 px-4 py-5 text-center transition",
        selected
          ? isClient
            ? "border-emerald-500 bg-emerald-50 text-emerald-900"
            : "border-orange-500 bg-orange-50 text-orange-900"
          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50",
      ].join(" ")}
      onClick={onSelect}
    >
      {isClient ? <Building2 size={28} /> : <HardHat size={28} />}
      <span className="text-base font-bold">{isClient ? L.client : L.worker}</span>
    </button>
  );
}

export function BankTxPartyEditModal({
  tx,
  draft,
  clients,
  workers,
  bankTransactionFolders,
  error,
  onClose,
  onDraftChange,
  onSave,
}: BankTxPartyEditModalProps) {
  const initialKind = useMemo(
    () => inferPartyKind(tx, draft, clients, workers, bankTransactionFolders),
    [tx, draft, clients, workers, bankTransactionFolders],
  );

  const [step, setStep] = useState<Step>("choose");
  const [partyKind, setPartyKind] = useState<PartyKind | null>(initialKind);

  useEffect(() => {
    setStep("choose");
    setPartyKind(inferPartyKind(tx, draft, clients, workers, bankTransactionFolders));
  }, [tx.id, draft, clients, workers, bankTransactionFolders, tx]);

  const clientOptions = useMemo(() => buildClientOptions(clients), [clients]);
  const workerOptions = useMemo(() => buildWorkerOptions(workers), [workers]);

  const searchOptions = useMemo(() => {
    const base = partyKind === "worker" ? workerOptions : clientOptions;
    return [{ label: L.clear, value: "", raw: null }, ...base];
  }, [partyKind, clientOptions, workerOptions]);

  const currentName = draft.trim();

  const goSearch = (kind: PartyKind) => {
    setPartyKind(kind);
    setStep("search");
  };

  const renderSub = (raw: Record<string, unknown> | null) => {
    if (!raw) return null;
    if (partyKind === "worker") {
      const businessNo = String(raw.businessNo || "").trim();
      const aliases = String(raw.depositNameAliases || "").trim();
      if (!businessNo && !aliases) return null;
      return (
        <span className="text-xs text-slate-500">
          {[businessNo, aliases].filter(Boolean).join(" \u00B7 ")}
        </span>
      );
    }
    const manager = String(raw.manager || "").trim();
    const aliases = String(raw.depositNameAliases || "").trim();
    if (!manager && !aliases) return null;
    return (
      <span className="text-xs text-slate-500">
        {[manager, aliases].filter(Boolean).join(" \u00B7 ")}
      </span>
    );
  };

  return (
    <div
      className="erp-ledger-modal-backdrop erp-ledger-modal-backdrop--elevated"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="erp-ledger-modal max-w-lg"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={L.title}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {step === "search" ? (
              <button
                type="button"
                className="mb-2 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-semibold text-slate-600 hover:bg-slate-100"
                onClick={() => setStep("choose")}
              >
                <ArrowLeft size={14} />
                {L.back}
              </button>
            ) : null}
            <h2 className="erp-text-section font-bold">{L.title}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {step === "choose"
                ? L.chooseDesc
                : partyKind === "worker"
                  ? L.searchWorker
                  : L.searchClient}
            </p>
            {currentName ? (
              <p className="mt-1 text-xs font-semibold text-slate-600">{L.current(currentName)}</p>
            ) : null}
          </div>
          <button type="button" className="rounded-xl p-2 text-slate-500 hover:bg-slate-100" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {step === "choose" ? (
          <div className="grid grid-cols-2 gap-3">
            <PartyKindCard
              kind="client"
              selected={partyKind === "client"}
              onSelect={() => goSearch("client")}
            />
            <PartyKindCard
              kind="worker"
              selected={partyKind === "worker"}
              onSelect={() => goSearch("worker")}
            />
          </div>
        ) : (
          <label className="block">
            <span className="erp-text-caption mb-1 block font-semibold text-slate-500">
              {partyKind === "worker" ? L.worker : L.client}
            </span>
            <AutocompleteInput
              value={draft}
              onChange={(value) => onDraftChange(String(value || ""))}
              options={searchOptions}
              placeholder={partyKind === "worker" ? L.workerPlaceholder : L.clientPlaceholder}
              freeSolo={false}
              showOptionsOnFocus
              compact={false}
              limit={20}
              renderSub={(raw) => renderSub(raw as Record<string, unknown> | null)}
            />
          </label>
        )}

        {error ? <p className="mt-3 text-sm font-semibold text-red-600">{error}</p> : null}

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" className="rounded-2xl" onClick={onClose}>
            {L.cancel}
          </Button>
          {step === "search" ? (
            <Button type="button" className="rounded-2xl" onClick={onSave}>
              {L.save}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
