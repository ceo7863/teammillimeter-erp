import React, { useMemo, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { KoreanDateInput } from "@/components/KoreanDateInput";
import { AutocompleteInput } from "@/components/AutocompleteInput";
import { formatKRW } from "@/utils/companyLedger";
import type { ErpUser } from "@/utils/erpApi";
import type { BankTransaction } from "@/utils/bankTransactions";
import type { PdfArchiveMeta } from "@/utils/pdfArchive";
import { findClientByDepositSubject } from "@/utils/clientDepositAliases";
import {
  extractClientTaxFields,
  validateInvoiceePartyForIssue,
  type ClientMasterLike,
} from "@/utils/clientMaster";
import { issueBarobillTaxInvoice } from "@/utils/barobillTaxInvoiceIssue";
import {
  getBankTxClassifiedAmount,
  resolveBankTxClientName,
} from "@/utils/bankTaxInvoiceLink";
import {
  calculateTaxInvoiceAmounts,
  calculateTaxInvoiceAmountsFromTotal,
  makeTaxInvoiceId,
  normalizeTaxInvoiceDocumentType,
  normalizeTaxInvoices,
  parseTaxInvoiceAmount,
  resolveTaxInvoiceModalAmounts,
  TAX_INVOICE_DOCUMENT_OPTIONS,
  validateTaxInvoiceInput,
  type TaxInvoice,
  type TaxInvoiceDocumentType,
} from "@/utils/taxInvoices";

const L = {
  title: "\uC138\uAE08\uACC4\uC0B0\uC11C \uBC1C\uD589",
  issueDate: "\uC791\uC131\uC77C\uC790",
  documentType: "\uACC4\uC0B0\uC11C \uC885\uB958",
  client: "\uAC70\uB798\uCC98",
  clientPlaceholder: "\uAC70\uB798\uCC98 \uC120\uD0DD",
  businessNo: "\uC0AC\uC5C5\uC790\uBC88\uD638",
  invoiceeSection: "\uAC70\uB798\uCC98(\uACF5\uAE09\uBC1B\uB294\uC790) \uC815\uBCF4",
  invoiceeSectionHint:
    "\uC804\uC790 \uBC1C\uD589 \uC2DC \uD544\uC218\uC785\uB2C8\uB2E4. \uAC70\uB798\uCC98 \uB9C8\uC2A4\uD130\uC5D0 \uC800\uC7A5\uB418\uC5B4 \uC788\uC73C\uBA74 \uC790\uB3D9 \uC744\uC6B0\uAE30\uB429\uB2C8\uB2E4.",
  ceoName: "\uB300\uD45C\uC790\uBA85",
  email: "\uC774\uBA54\uC77C",
  bizType: "\uC5C5\uD0DC",
  bizClass: "\uC5C5\uC885",
  phone: "\uC804\uD654",
  itemName: "\uD488\uBAA9\uBA85",
  address: "\uC8FC\uC18C",
  supplyAmount: "\uACF5\uAE09\uAC00\uC561",
  totalAmountInclVat: "\uD569\uACC4(\uBD80\uAC00\uC138 \uD3EC\uD568)",
  vatAmount: "\uBD80\uAC00\uC138",
  amountHint: "\uACF5\uAE09\uAC00\uC561 \uB610\uB294 \uD569\uACC4 \uC911 \uD558\uB098\uB97C \uC785\uB825\uD558\uBA74 \uB098\uBA38\uC9C0 \uAE08\uC561\uC774 \uC790\uB3D9 \uACC4\uC0B0\uB429\uB2C8\uB2E4.",
  memo: "\uBA54\uBAA8",
  cancel: "\uCDE8\uC18C",
  barobillIssue: "\uC804\uC790 \uBC1C\uD589",
  barobillIssueHint: "\uC804\uC790 \uBC1C\uD589 \uC2DC \uBC14\uB85C\uBE4C\uC744 \uD1B5\uD574 \uAD6D\uC138\uCCAD\uC5D0 \uC804\uC1A1\uB429\uB2C8\uB2E4.",
  barobillIssueLoading: "\uBC14\uB85C\uBE4C\uC5D0 \uBC1C\uD589 \uC911\uC785\uB2C8\uB2E4...",
  barobillIssueDone: "\uBC14\uB85C\uBE4C \uC138\uAE08\uACC4\uC0B0\uC11C \uBC1C\uD589\uC774 \uC644\uB8CC\uB418\uC5C8\uC2B5\uB2C8\uB2E4.",
  barobillIssueFailed: "\uBC14\uB85C\uBE4C \uBC1C\uD589\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.",
  barobillIssueBusinessNo: "\uAC70\uB798\uCC98 \uC0AC\uC5C5\uC790\uBC88\uD638 10\uC790\uB9AC\uB97C \uC785\uB825\uD574 \uC8FC\uC138\uC694.",
  adminOnly: "\uC804\uC790 \uACC4\uC0B0\uC11C \uBC1C\uD589\uC740 \uAD00\uB9AC\uC790 \uACC4\uC815\uC5D0\uC11C\uB9CC \uAC00\uB2A5\uD569\uB2C8\uB2E4.",
  depositOnly: "\uC785\uAE08 \uAC70\uB798\uB9CC \uACC4\uC0B0\uC11C \uBC1C\uD589\uC774 \uAC00\uB2A5\uD569\uB2C8\uB2E4.",
  unavailable: "\uC138\uAE08\uACC4\uC0B0\uC11C \uBC1C\uD589 \uC815\uBCF4\uB97C \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.",
};

export type TaxInvoiceIssueDraft = {
  issueDate: string;
  client: string;
  businessNo: string;
  documentType: TaxInvoiceDocumentType;
  supplyAmount: string;
  totalAmount: string;
  amountInputSource: "supply" | "total";
  memo: string;
  itemName: string;
  invoiceeCeoName: string;
  invoiceeEmail: string;
  invoiceeAddr: string;
  invoiceePhone: string;
  invoiceeBizType: string;
  invoiceeBizClass: string;
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="erp-text-caption mb-1 block font-semibold text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function applyClientToInvoiceDraft(client: Record<string, unknown> | null | undefined) {
  const profile = extractClientTaxFields(client);
  return {
    businessNo: profile.businessNo || "",
    invoiceeCeoName: profile.ceoName || "",
    invoiceeEmail: profile.email || "",
    invoiceeAddr: profile.address || "",
    invoiceePhone: profile.phone || "",
    invoiceeBizType: profile.bizType || "",
    invoiceeBizClass: profile.bizClass || "",
    itemName: profile.name || "",
  };
}

function clientVatIncluded(client?: ClientMasterLike | null) {
  return String(client?.vat || "Y").trim().toUpperCase() !== "N";
}

function resolveArchiveClient(record: PdfArchiveMeta, clients: ClientMasterLike[]) {
  const subjectName = String(record.subjectName || "").trim();
  const matched =
    clients.find((client) => String(client.name || "").trim() === subjectName) ||
    findClientByDepositSubject(clients, subjectName);
  const clientName = matched ? String(matched.name || subjectName).trim() : subjectName;
  return { clientName, matched };
}

function buildStatementPeriodMemo(record: PdfArchiveMeta) {
  const start = String(record.periodStart || "").trim();
  const end = String(record.periodEnd || "").trim();
  if (start && end) return `\uB0B4\uC5ED\uC11C ${start} ~ ${end}`;
  if (start || end) return `\uB0B4\uC5ED\uC11C ${start || end}`;
  return "\uAC70\uB798\uCC98 \uB0B4\uC5ED\uC11C";
}

function buildTaxInvoiceAmountDraft(amount: number, matched: ClientMasterLike | null | undefined) {
  const vatIncluded = clientVatIncluded(matched);
  const documentType: TaxInvoiceDocumentType = "tax";
  const amounts = vatIncluded
    ? calculateTaxInvoiceAmountsFromTotal(amount, documentType)
    : calculateTaxInvoiceAmounts(amount, documentType);
  return {
    documentType,
    supplyAmount: String(amounts.supplyAmount),
    totalAmount: String(amounts.totalAmount),
    amountInputSource: vatIncluded ? ("total" as const) : ("supply" as const),
  };
}

function resolveMatchedClient(tx: BankTransaction, clients: ClientMasterLike[]) {
  const subjects = [
    resolveBankTxClientName(tx),
    tx.counterpartyName,
    tx.memo,
    tx.description,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  for (const subject of subjects) {
    const matched = findClientByDepositSubject(clients, subject);
    if (matched) {
      return { clientName: String(matched.name || subject).trim(), matched };
    }
  }

  const fallbackName =
    resolveBankTxClientName(tx) || String(tx.counterpartyName || "").trim();
  const matched = clients.find((client) => String(client.name || "").trim() === fallbackName);
  return { clientName: fallbackName, matched };
}

export function buildBankTaxInvoiceIssueDraft(
  tx: BankTransaction,
  clients: ClientMasterLike[],
): TaxInvoiceIssueDraft | null {
  if (tx.deposit <= 0) return null;

  const { clientName, matched } = resolveMatchedClient(tx, clients);
  const deposit = getBankTxClassifiedAmount(tx);
  const amountDraft = buildTaxInvoiceAmountDraft(deposit, matched);
  const issueDate = String(tx.transactionAt || "").slice(0, 10) || new Date().toISOString().slice(0, 10);
  const applied = applyClientToInvoiceDraft(matched);

  return {
    issueDate,
    client: clientName,
    memo: String(tx.description || tx.memo || "").trim(),
    ...amountDraft,
    ...applied,
  };
}

export function buildPdfArchiveTaxInvoiceIssueDraft(
  record: PdfArchiveMeta,
  clients: ClientMasterLike[],
): TaxInvoiceIssueDraft | null {
  if (record.category !== "statement-client") return null;

  const amount = Number(record.statementTotalAmount || 0);
  if (amount <= 0) return null;

  const { clientName, matched } = resolveArchiveClient(record, clients);
  const amountDraft = buildTaxInvoiceAmountDraft(amount, matched);
  const issueDate =
    String(record.periodEnd || record.createdAt || "").slice(0, 10) || new Date().toISOString().slice(0, 10);
  const memo = buildStatementPeriodMemo(record);
  const applied = applyClientToInvoiceDraft(matched);

  return {
    issueDate,
    client: clientName,
    memo,
    ...amountDraft,
    ...applied,
    itemName: applied.itemName || memo,
  };
}

export type BankTaxInvoiceIssueResult = {
  invoice: TaxInvoice;
  taxInvoices?: TaxInvoice[];
  version?: number;
  message?: string;
};

type BankTaxInvoiceIssueModalProps = {
  clients: ClientMasterLike[];
  currentUser: ErpUser | null;
  erpVersion?: number;
  setTaxInvoices: React.Dispatch<React.SetStateAction<TaxInvoice[]>>;
  onClose: () => void;
  onIssued: (result: BankTaxInvoiceIssueResult) => void | Promise<void>;
  tx?: BankTransaction;
  draft?: TaxInvoiceIssueDraft | null;
  sourceAmount?: number;
  unavailableMessage?: string;
};

export function BankTaxInvoiceIssueModal({
  tx,
  draft: draftProp,
  sourceAmount: sourceAmountProp,
  unavailableMessage,
  clients,
  currentUser,
  erpVersion = 0,
  setTaxInvoices,
  onClose,
  onIssued,
}: BankTaxInvoiceIssueModalProps) {
  const builtFromTx = useMemo(
    () => (tx ? buildBankTaxInvoiceIssueDraft(tx, clients) : null),
    [tx, clients],
  );
  const initialDraft = draftProp ?? builtFromTx;
  const sourceAmount = sourceAmountProp ?? (tx ? getBankTxClassifiedAmount(tx) : 0);
  const [draft, setDraft] = useState<TaxInvoiceIssueDraft | null>(initialDraft);
  const [formError, setFormError] = useState("");
  const [issueLoading, setIssueLoading] = useState(false);

  const isAdmin = currentUser?.role === "admin";
  const canIssueElectronically = Boolean(isAdmin && draft && sourceAmount > 0);

  const clientOptions = useMemo(
    () => clients.map((client) => String(client.name || "")).filter(Boolean),
    [clients],
  );

  const previewAmounts = useMemo(() => {
    if (!draft) return { supplyAmount: 0, vatAmount: 0, totalAmount: 0 };
    return resolveTaxInvoiceModalAmounts(draft);
  }, [draft]);

  const handleClientChange = (clientName: string) => {
    const matched = clients.find((client) => client.name === clientName);
    const applied = applyClientToInvoiceDraft(matched);
    const vatIncluded = clientVatIncluded(matched);
    const amounts = vatIncluded
      ? calculateTaxInvoiceAmountsFromTotal(sourceAmount, draft?.documentType || "tax")
      : calculateTaxInvoiceAmounts(sourceAmount, draft?.documentType || "tax");

    setDraft((prev) =>
      prev
        ? {
            ...prev,
            client: clientName,
            ...applied,
            supplyAmount: String(amounts.supplyAmount),
            totalAmount: String(amounts.totalAmount),
            amountInputSource: vatIncluded ? "total" : "supply",
          }
        : prev,
    );
  };

  const handleSupplyAmountChange = (raw: string) => {
    const supplyAmount = raw.replace(/[^\d]/g, "");
    setDraft((prev) => {
      if (!prev) return prev;
      const amounts = calculateTaxInvoiceAmounts(parseTaxInvoiceAmount(supplyAmount), prev.documentType);
      return {
        ...prev,
        supplyAmount,
        totalAmount: supplyAmount ? String(amounts.totalAmount) : "",
        amountInputSource: "supply",
      };
    });
  };

  const handleTotalAmountChange = (raw: string) => {
    const totalAmount = raw.replace(/[^\d]/g, "");
    setDraft((prev) => {
      if (!prev) return prev;
      const amounts = calculateTaxInvoiceAmountsFromTotal(parseTaxInvoiceAmount(totalAmount), prev.documentType);
      return {
        ...prev,
        totalAmount,
        supplyAmount: totalAmount ? String(amounts.supplyAmount) : "",
        amountInputSource: "total",
      };
    });
  };

  const handleDocumentTypeChange = (documentType: TaxInvoiceDocumentType) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const amounts = resolveTaxInvoiceModalAmounts({ ...prev, documentType });
      return {
        ...prev,
        documentType,
        supplyAmount:
          parseTaxInvoiceAmount(prev.supplyAmount) > 0 || parseTaxInvoiceAmount(prev.totalAmount) > 0
            ? String(amounts.supplyAmount)
            : prev.supplyAmount,
        totalAmount:
          parseTaxInvoiceAmount(prev.supplyAmount) > 0 || parseTaxInvoiceAmount(prev.totalAmount) > 0
            ? String(amounts.totalAmount)
            : prev.totalAmount,
      };
    });
  };

  const issueViaBarobill = async () => {
    if (!draft) return;

    const error = validateTaxInvoiceInput({
      issueDate: draft.issueDate,
      client: draft.client,
      supplyAmount: draft.supplyAmount,
      totalAmount: draft.totalAmount,
    });
    if (error) {
      setFormError(error);
      return;
    }

    const businessDigits = String(draft.businessNo || "").replace(/\D/g, "");
    if (businessDigits.length !== 10) {
      setFormError(L.barobillIssueBusinessNo);
      return;
    }

    const partyError = validateInvoiceePartyForIssue({
      ceoName: draft.invoiceeCeoName,
      email: draft.invoiceeEmail,
      address: draft.invoiceeAddr,
      bizType: draft.invoiceeBizType,
      bizClass: draft.invoiceeBizClass,
    });
    if (partyError) {
      setFormError(partyError);
      return;
    }

    const amounts = resolveTaxInvoiceModalAmounts(draft);
    const authorName = currentUser?.name || currentUser?.loginId || "\uC0AC\uC6A9\uC790";
    const authorLoginId = currentUser?.loginId || "";

    setIssueLoading(true);
    setFormError("");
    try {
      const result = await issueBarobillTaxInvoice({
        issueDate: draft.issueDate,
        client: draft.client.trim(),
        businessNo: businessDigits,
        documentType: draft.documentType,
        supplyAmount: amounts.supplyAmount,
        vatAmount: amounts.vatAmount,
        totalAmount: amounts.totalAmount,
        itemName: draft.itemName.trim() || draft.memo.trim() || draft.client.trim(),
        memo: draft.memo.trim() || undefined,
        purposeType: 2,
        invoiceeCeoName: draft.invoiceeCeoName.trim(),
        invoiceeEmail: draft.invoiceeEmail.trim(),
        invoiceeAddr: draft.invoiceeAddr.trim(),
        invoiceePhone: draft.invoiceePhone.trim() || undefined,
        invoiceeBizType: draft.invoiceeBizType.trim(),
        invoiceeBizClass: draft.invoiceeBizClass.trim(),
        apply: true,
        version: erpVersion,
      });

      const issued =
        result.taxInvoice ||
        ({
          id: makeTaxInvoiceId(),
          issueDate: draft.issueDate,
          client: draft.client.trim(),
          businessNo: businessDigits,
          flowType: "sales" as const,
          documentType: draft.documentType,
          supplyAmount: amounts.supplyAmount,
          vatAmount: amounts.vatAmount,
          totalAmount: amounts.totalAmount,
          invoiceNo: result.invoiceNo || undefined,
          memo:
            [draft.memo.trim(), result.mgtKey ? `MgtKey: ${result.mgtKey}` : ""].filter(Boolean).join(" \u00B7 ") ||
            undefined,
          status: "issued" as const,
          createdAt: new Date().toISOString(),
          createdBy: authorName,
          createdByLoginId: authorLoginId,
        } satisfies TaxInvoice);

      if (result.taxInvoices) {
        setTaxInvoices(normalizeTaxInvoices(result.taxInvoices));
      } else {
        setTaxInvoices((prev) => [issued, ...prev]);
      }

      await onIssued({
        invoice: issued,
        taxInvoices: result.taxInvoices ? normalizeTaxInvoices(result.taxInvoices) : undefined,
        version: result.version,
        message: result.message || L.barobillIssueDone,
      });
    } catch (issueError) {
      setFormError(issueError instanceof Error ? issueError.message : L.barobillIssueFailed);
    } finally {
      setIssueLoading(false);
    }
  };

  if (!draft) {
    return (
      <div className="erp-ledger-modal-backdrop" onClick={onClose}>
        <div className="erp-ledger-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
          <p className="text-sm text-slate-600">
            {unavailableMessage || (tx ? L.depositOnly : L.unavailable)}
          </p>
          <div className="mt-4 flex justify-end">
            <Button type="button" variant="outline" className="rounded-2xl" onClick={onClose}>
              {L.cancel}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="erp-ledger-modal-backdrop" onClick={onClose}>
      <div className="erp-ledger-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="erp-text-section font-bold">{L.title}</h2>
          <button type="button" className="rounded-xl p-2 text-slate-400 hover:bg-slate-100" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={L.issueDate}>
              <KoreanDateInput
                className="erp-input w-full rounded-2xl border px-3 py-2.5"
                value={draft.issueDate}
                onChange={(event) => setDraft((prev) => (prev ? { ...prev, issueDate: event.target.value } : prev))}
              />
            </Field>
            <Field label={L.documentType}>
              <select
                className="erp-input w-full rounded-2xl border bg-white px-3 py-2.5"
                value={draft.documentType}
                onChange={(event) => handleDocumentTypeChange(normalizeTaxInvoiceDocumentType(event.target.value))}
              >
                {TAX_INVOICE_DOCUMENT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label={L.client}>
            <AutocompleteInput
              value={draft.client}
              options={clientOptions}
              onChange={handleClientChange}
              placeholder={L.clientPlaceholder}
              inputProps={{ className: "erp-input w-full rounded-2xl border px-3 py-2.5" }}
              compact={false}
            />
          </Field>
          <Field label={L.businessNo}>
            <input
              className="erp-input w-full rounded-2xl border px-3 py-2.5"
              value={draft.businessNo}
              onChange={(event) => setDraft((prev) => (prev ? { ...prev, businessNo: event.target.value } : prev))}
              lang="ko"
            />
          </Field>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-4">
            <div>
              <div className="erp-text-body font-bold text-slate-800">{L.invoiceeSection}</div>
              <p className="mt-1 erp-text-caption text-slate-500">{L.invoiceeSectionHint}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={L.ceoName}>
                <input
                  className="erp-input w-full rounded-2xl border bg-white px-3 py-2.5"
                  value={draft.invoiceeCeoName}
                  onChange={(event) =>
                    setDraft((prev) => (prev ? { ...prev, invoiceeCeoName: event.target.value } : prev))
                  }
                  lang="ko"
                />
              </Field>
              <Field label={L.email}>
                <input
                  type="email"
                  className="erp-input w-full rounded-2xl border bg-white px-3 py-2.5"
                  value={draft.invoiceeEmail}
                  onChange={(event) =>
                    setDraft((prev) => (prev ? { ...prev, invoiceeEmail: event.target.value } : prev))
                  }
                  lang="ko"
                />
              </Field>
              <Field label={L.bizType}>
                <input
                  className="erp-input w-full rounded-2xl border bg-white px-3 py-2.5"
                  value={draft.invoiceeBizType}
                  onChange={(event) =>
                    setDraft((prev) => (prev ? { ...prev, invoiceeBizType: event.target.value } : prev))
                  }
                  lang="ko"
                />
              </Field>
              <Field label={L.bizClass}>
                <input
                  className="erp-input w-full rounded-2xl border bg-white px-3 py-2.5"
                  value={draft.invoiceeBizClass}
                  onChange={(event) =>
                    setDraft((prev) => (prev ? { ...prev, invoiceeBizClass: event.target.value } : prev))
                  }
                  lang="ko"
                />
              </Field>
              <Field label={L.phone}>
                <input
                  className="erp-input w-full rounded-2xl border bg-white px-3 py-2.5"
                  value={draft.invoiceePhone}
                  onChange={(event) =>
                    setDraft((prev) => (prev ? { ...prev, invoiceePhone: event.target.value } : prev))
                  }
                  lang="ko"
                />
              </Field>
              <Field label={L.itemName}>
                <input
                  className="erp-input w-full rounded-2xl border bg-white px-3 py-2.5"
                  value={draft.itemName}
                  onChange={(event) => setDraft((prev) => (prev ? { ...prev, itemName: event.target.value } : prev))}
                  lang="ko"
                />
              </Field>
            </div>
            <Field label={L.address}>
              <input
                className="erp-input w-full rounded-2xl border bg-white px-3 py-2.5"
                value={draft.invoiceeAddr}
                onChange={(event) => setDraft((prev) => (prev ? { ...prev, invoiceeAddr: event.target.value } : prev))}
                lang="ko"
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={L.supplyAmount}>
              <input
                className="erp-input w-full rounded-2xl border px-3 py-2.5"
                value={draft.supplyAmount}
                onChange={(event) => handleSupplyAmountChange(event.target.value)}
                inputMode="numeric"
                placeholder="0"
              />
            </Field>
            <Field label={L.totalAmountInclVat}>
              <input
                className="erp-input w-full rounded-2xl border px-3 py-2.5"
                value={draft.totalAmount}
                onChange={(event) => handleTotalAmountChange(event.target.value)}
                inputMode="numeric"
                placeholder="0"
              />
            </Field>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
            <p className="mb-3 text-xs text-slate-500">{L.amountHint}</p>
            <div className="flex justify-between gap-3">
              <span className="text-slate-500">{L.supplyAmount}</span>
              <span className="font-semibold">{formatKRW(previewAmounts.supplyAmount)}</span>
            </div>
            <div className="mt-2 flex justify-between gap-3">
              <span className="text-slate-500">{L.vatAmount}</span>
              <span className="font-semibold text-amber-700">{formatKRW(previewAmounts.vatAmount)}</span>
            </div>
            <div className="mt-2 flex justify-between gap-3 border-t border-slate-200 pt-2">
              <span className="text-slate-500">{L.totalAmountInclVat}</span>
              <span className="font-bold text-emerald-700">{formatKRW(previewAmounts.totalAmount)}</span>
            </div>
          </div>
          <Field label={L.memo}>
            <textarea
              className="erp-input min-h-[4rem] w-full rounded-2xl border px-3 py-2.5"
              value={draft.memo}
              onChange={(event) => setDraft((prev) => (prev ? { ...prev, memo: event.target.value } : prev))}
              lang="ko"
            />
          </Field>
          {formError ? <p className="text-sm font-semibold text-red-600">{formError}</p> : null}
          {canIssueElectronically ? (
            <p className="text-sm text-slate-500">{L.barobillIssueHint}</p>
          ) : !isAdmin ? (
            <p className="text-sm text-slate-500">{L.adminOnly}</p>
          ) : null}
          {issueLoading ? <p className="text-sm font-semibold text-slate-500">{L.barobillIssueLoading}</p> : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" className="rounded-2xl" onClick={onClose} disabled={issueLoading}>
              {L.cancel}
            </Button>
            {canIssueElectronically ? (
              <Button
                type="button"
                className="rounded-2xl"
                disabled={issueLoading}
                onClick={() => void issueViaBarobill()}
              >
                {L.barobillIssue}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
