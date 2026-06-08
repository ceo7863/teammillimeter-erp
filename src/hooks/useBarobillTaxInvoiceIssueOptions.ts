import { useEffect, useState } from "react";
import {
  fetchBarobillTaxInvoiceIssueOptions,
  getNtsSendOptionLabel,
  resolveDefaultNtsSendOption,
  type BarobillTaxInvoiceIssueOptions,
} from "@/utils/barobillTaxInvoiceIssue";
import type { TaxInvoiceDocumentType } from "@/utils/taxInvoices";

export function useBarobillTaxInvoiceIssueOptions(
  enabled: boolean,
  documentType: TaxInvoiceDocumentType,
) {
  const [issueOptions, setIssueOptions] = useState<BarobillTaxInvoiceIssueOptions | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!enabled) {
      setIssueOptions(null);
      setError("");
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");

    void fetchBarobillTaxInvoiceIssueOptions(documentType)
      .then((result) => {
        if (!cancelled) setIssueOptions(result);
      })
      .catch((fetchError) => {
        if (!cancelled) {
          setIssueOptions(null);
          setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, documentType]);

  return {
    issueOptions,
    loading,
    error,
    resolveDefault: (type: TaxInvoiceDocumentType) =>
      issueOptions ? resolveDefaultNtsSendOption(type, issueOptions.accountDefaults) : 1,
    getLabel: (value: number) => getNtsSendOptionLabel(value, issueOptions?.ntsSendOptions),
  };
}
