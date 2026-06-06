import { createRoot, type Root } from "react-dom/client";
import { TaxInvoiceLinkPanel, type TaxInvoiceLinkPanelProps } from "@/components/TaxInvoiceLinkPanel";

let container: HTMLDivElement | null = null;
let root: Root | null = null;

export function renderTaxInvoiceLinkPanel(props: TaxInvoiceLinkPanelProps) {
  if (!container) {
    container = document.createElement("div");
    container.id = "erp-tax-invoice-link-panel-root";
    document.body.appendChild(container);
    root = createRoot(container);
  }
  root.render(<TaxInvoiceLinkPanel {...props} />);
}

export function destroyTaxInvoiceLinkPanel() {
  root?.render(null);
}
