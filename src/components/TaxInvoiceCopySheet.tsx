import React from "react";
import { formatKRW } from "@/utils/companyLedger";
import type { TaxInvoiceCopyParty, TaxInvoiceCopySheetData } from "@/utils/taxInvoiceCopyData";
import { A4_PORTRAIT_WIDTH_PX } from "@/utils/statementSheetLayout";

function PartyBlock({ label, tone, party }: { label: string; tone: "supplier" | "buyer"; party: TaxInvoiceCopyParty }) {
  const toneClass = tone === "supplier" ? "tax-copy-party--supplier" : "tax-copy-party--buyer";
  return (
    <div className={`tax-copy-party ${toneClass}`}>
      <div className="tax-copy-party-label">{label}</div>
      <table className="tax-copy-party-table">
        <tbody>
          <tr>
            <th>????</th>
            <td colSpan={3}>{party.businessNo || "-"}</td>
          </tr>
          <tr>
            <th>??</th>
            <td>{party.name || "-"}</td>
            <th>??</th>
            <td>{party.ceoName || "-"}</td>
          </tr>
          <tr>
            <th>???</th>
            <td colSpan={3}>{party.address || "-"}</td>
          </tr>
          <tr>
            <th>??</th>
            <td>{party.bizType || "-"}</td>
            <th>??</th>
            <td>{party.bizClass || "-"}</td>
          </tr>
          <tr>
            <th>???</th>
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
        <div className="tax-copy-subtitle">(????? ??? ??)</div>
      </div>

      <div className="tax-copy-meta">
        <div>
          <span className="tax-copy-meta-label">????</span>
          <span className="tax-copy-meta-value">{data.issueDate || "-"}</span>
        </div>
        <div>
          <span className="tax-copy-meta-label">????</span>
          <span className="tax-copy-meta-value">{data.invoiceNo || "-"}</span>
        </div>
      </div>

      <div className="tax-copy-parties">
        <PartyBlock label="???" tone="supplier" party={data.supplier} />
        <PartyBlock label="?????" tone="buyer" party={data.buyer} />
      </div>

      <table className="tax-copy-items">
        <thead>
          <tr>
            <th>??</th>
            <th>????</th>
            <th>??</th>
            <th>??</th>
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
            <td className="label">??</td>
            <td className="num">{formatKRW(data.supplyAmount)}</td>
            <td className="num">{formatKRW(data.vatAmount)}</td>
            <td className="num total">{formatKRW(data.totalAmount)}</td>
          </tr>
        </tfoot>
      </table>

      {data.memo ? (
        <div className="tax-copy-memo">
          <span className="tax-copy-memo-label">??</span>
          <span className="tax-copy-memo-value">{data.memo}</span>
        </div>
      ) : null}

      <div className="tax-copy-footer">? ??? ERP?? ??? ????? ?? ??????.</div>
    </div>
  );
}
