import { createRoot, type Root } from "react-dom/client";
import { TaxInvoiceLinkPanel, type TaxInvoiceLinkPanelDataProps } from "@/components/TaxInvoiceLinkPanel";

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const panelHandlersRef: {
  onClose: () => void;
  onLink: (invoiceId: string | undefined) => void;
  onNavigateToTaxInvoice?: () => void;
} = {
  onClose: () => {},
  onLink: () => {},
};

export function setTaxInvoiceLinkPanelHandlers(handlers: {
  onClose: () => void;
  onLink: (invoiceId: string | undefined) => void;
  onNavigateToTaxInvoice?: () => void;
}) {
  panelHandlersRef.onClose = handlers.onClose;
  panelHandlersRef.onLink = handlers.onLink;
  panelHandlersRef.onNavigateToTaxInvoice = handlers.onNavigateToTaxInvoice;
}

export function renderTaxInvoiceLinkPanel(props: TaxInvoiceLinkPanelDataProps) {
  if (!container) {
    container = document.createElement("div");
    container.id = "erp-tax-invoice-link-panel-root";
    document.body.appendChild(container);
    root = createRoot(container);
  }
  root.render(
    <TaxInvoiceLinkPanel
      {...props}
      onClose={() => panelHandlersRef.onClose()}
      onLink={(invoiceId) => panelHandlersRef.onLink(invoiceId)}
      onNavigateToTaxInvoice={
        panelHandlersRef.onNavigateToTaxInvoice
          ? () => panelHandlersRef.onNavigateToTaxInvoice?.()
          : undefined
      }
    />,
  );
}

export function destroyTaxInvoiceLinkPanel() {
  root?.render(null);
}
