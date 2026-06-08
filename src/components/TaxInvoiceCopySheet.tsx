import React from "react";
import { formatKRW } from "@/utils/companyLedger";
import type { TaxInvoiceCopyParty, TaxInvoiceCopySheetData } from "@/utils/taxInvoiceCopyData";
import { A4_PORTRAIT_WIDTH_PX } from "@/utils/statementSheetLayout";

const L = {
  businessNo: "\uB4F1\uB85D\uBC88\uD638",
  corpName: "\uC0C1\uD638",
  ceoName: "\uC131\uBA85",
  address: "\uC0AC\uC5C5\uC7A5",
  bizType: "\uC885\uBAA9",
  bizClass: "\uC5C5\uD0DC",
  email: "\uC774\uBA54\uC77C",
  subtitle: "(\uACF5\uAE09\uBC1B\uB294\uC790 \uBCF4\uAD00\uC6A9)",
  issueDate: "\uC791\uC131\uC77C\uC790",
  invoiceNo: "\uC2B9\uC778\uBC88\uD638",
  supplier: "\uACF5\uAE09\uC790",
  buyer: "\uACF5\uAE09\uBC1B\uB294\uC790",
  itemName: "\uD488\uBAA9",
  supplyAmount: "\uACF5\uAE09\uAC00\uC561",
  vatAmount: "\uC138\uC561",
  totalAmount: "\uD569\uACC4",
  totalLabel: "\uD569\uACC4",
  memo: "\uBE44\uACE0",
  footer: "\uBCF8 \uBB38\uC11C\uB294 ERP\uC5D0\uC11C \uC0DD\uC131\uD55C \uACC4\uC0B0\uC11C \uC0AC\uBCF8\uC785\uB2C8\uB2E4. \uACF5\uAE09\uBC1B\uB294\uC790 \uBCF4\uAD00\uC6A9\uC73C\uB85C \uC0AC\uC6A9\uD558\uC138\uC694.",
};

function PartyBlock({ label, tone, party }: { label: string; tone: "supplier" | "buyer"; party: TaxInvoiceCopyParty }) {
  const toneClass = tone === "supplier" ? "tax-copy-party--supplier" : "tax-copy-party--buyer";
  return (
    <div className={`tax-copy-party ${toneClass}`}>
      <div className="tax-copy-party-label">{label}</div>
      <table className="tax-copy-party-table">
        <tbody>
          <tr>
            <th>{L.businessNo}</th>
            <td colSpan={3}>{party.businessNo || "-"}</td>
          </tr>
          <tr>
            <th>{L.corpName}</th>
            <td>{party.name || "-"}</td>
            <th>{L.ceoName}</th>
            <td>{party.ceoName || "-"}</td>
          </tr>
          <tr>
            <th>{L.address}</th>
            <td colSpan={3}>{party.address || "-"}</td>
          </tr>
          <tr>
            <th>{L.bizType}</th>
            <td>{party.bizType || "-"}</td>
            <th>{L.bizClass}</th>
            <td>{party.bizClass || "-"}</td>
          </tr>
          <tr>
            <th>{L.email}</th>
            <td colSpan={3}>{party.email || "-"}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function TaxInvoiceCopySheet({ data }: { data: TaxInvoiceCopySheetData }) {
  return (
    <div
      data-tax-invoice-copy-root
      className="erp-tax-invoice-copy-sheet"
      style={{ width: `${A4_PORTRAIT_WIDTH_PX}px` }}
    >
      <div className="tax-copy-header">
        <div className="tax-copy-title">{data.title}</div>
        <div className="tax-copy-subtitle">{L.subtitle}</div>
      </div>

      <div className="tax-copy-meta">
        <div className="tax-copy-meta-item">
          <span className="tax-copy-meta-label">{L.issueDate}</span>
          <span className="tax-copy-meta-value">{data.issueDate || "-"}</span>
        </div>
        <div className="tax-copy-meta-item tax-copy-meta-item--approval">
          <span className="tax-copy-meta-label">{L.invoiceNo}</span>
          <span className="tax-copy-meta-value tax-copy-meta-value--approval">{data.invoiceNo || "-"}</span>
        </div>
      </div>

      <div className="tax-copy-parties">
        <PartyBlock label={L.supplier} tone="supplier" party={data.supplier} />
        <PartyBlock label={L.buyer} tone="buyer" party={data.buyer} />
      </div>

      <table className="tax-copy-items">
        <thead>
          <tr>
            <th>{L.itemName}</th>
            <th>{L.supplyAmount}</th>
            <th>{L.vatAmount}</th>
            <th>{L.totalAmount}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{data.itemName || "-"}</td>
            <td className="num">{formatKRW(data.supplyAmount)}</td>
            <td className="num">{formatKRW(data.vatAmount)}</td>
            <td className="num">{formatKRW(data.totalAmount)}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td className="label">{L.totalLabel}</td>
            <td className="num">{formatKRW(data.supplyAmount)}</td>
            <td className="num">{formatKRW(data.vatAmount)}</td>
            <td className="num total">{formatKRW(data.totalAmount)}</td>
          </tr>
        </tfoot>
      </table>

      {data.memo ? (
        <div className="tax-copy-memo">
          <span className="tax-copy-memo-label">{L.memo}</span>
          <span className="tax-copy-memo-value">{data.memo}</span>
        </div>
      ) : null}

      <div className="tax-copy-footer">{L.footer}</div>
    </div>
  );
}
