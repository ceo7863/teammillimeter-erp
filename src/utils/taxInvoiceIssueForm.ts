import { validateInvoiceePartyForIssue } from "@/utils/clientMaster";
import { validateTaxInvoiceInput, type TaxInvoiceIssueFormLike } from "@/utils/taxInvoices";

export function validateTaxInvoiceIssuePreviewForm(draft: TaxInvoiceIssueFormLike) {
  return validateTaxInvoiceInput({
    issueDate: draft.issueDate,
    client: draft.client,
    supplyAmount: draft.supplyAmount,
    totalAmount: draft.totalAmount,
  });
}

export function validateBarobillTaxInvoiceIssueForm(
  draft: TaxInvoiceIssueFormLike,
  messages: { businessNo: string },
) {
  const error = validateTaxInvoiceInput({
    issueDate: draft.issueDate,
    client: draft.client,
    supplyAmount: draft.supplyAmount,
    totalAmount: draft.totalAmount,
  });
  if (error) return error;

  const businessDigits = String(draft.businessNo || "").replace(/\D/g, "");
  if (businessDigits.length !== 10) return messages.businessNo;

  return (
    validateInvoiceePartyForIssue({
      ceoName: draft.invoiceeCeoName,
      email: draft.invoiceeEmail,
      address: draft.invoiceeAddr,
      bizType: draft.invoiceeBizType,
      bizClass: draft.invoiceeBizClass,
    }) || null
  );
}
