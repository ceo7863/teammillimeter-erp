/**
 * Compatibility adapter — canonical implementation lives in SaleDetailDrawer.
 * Do not add a second sale detail UI here.
 */
export {
  SaleDetailDrawer as SaleVoucherEditModal,
  SaleDetailDrawer,
  SALE_DETAIL_DRAWER_IDENTITY,
  type SaleDetailDrawerProps,
  type SaleFormEditorInjectedProps,
} from "@/components/SaleDetailDrawer";

export { SaleDetailDrawer as default } from "@/components/SaleDetailDrawer";
