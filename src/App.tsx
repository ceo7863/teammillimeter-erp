import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  CreditCard,
  Download,
  FileSpreadsheet,
  History,
  Home,
  Layers,
  Landmark,
  LogIn,
  LogOut,
  ListOrdered,
  MapPin,
  Menu,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Search,
  Trash2,
  Undo2,
  Users,
  WalletCards,
  FileText,
  X,
  Archive,
  ArrowLeft,
  ArrowLeftRight,
  BookOpen,
  UserCog,
  Megaphone,
  Receipt,
  Circle,
  UserMinus,
  UserCheck,
  Clock,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fetchBundledErpSeed, parseErpExcelFile } from "@/utils/excelImport";
import { buildAnalysisReport, buildClientPivotReport, buildMonthlyPivotReport, buildQuarterlyPivotReport, buildWorkerPivotReport, filterSalesByClient } from "@/utils/pivotReports";
import { buildAnnualMonthlyDashboard, listDashboardYears } from "@/utils/dashboardAnnual";
import { compareSortValues, sortRowsByColumn, type SortDirection } from "@/utils/pivotSort";
import { useSaveMessage } from "@/hooks/useSaveMessage";
import { AuditProvider, useAudit } from "@/context/AuditContext";
import { AuditField, AuditCellHint, EntityAuditButton } from "@/components/AuditField";
import { AuditLogPage } from "@/components/AuditLogPage";
import { LoginHistoryPage } from "@/components/LoginHistoryPage";
import { SalesManagementPage } from "@/components/SalesManagementPage";
import { PaymentReceivablesPage } from "@/components/PaymentReceivablesPage";
import { WorkerPaymentsPage } from "@/components/WorkerPaymentsPage";
import { StatementsPage } from "@/components/StatementsPage";
import { PdfArchivePage } from "@/components/PdfArchivePage";
import { MyAccountModal } from "@/components/MyAccountModal";
import { SidebarMenuOrderModal } from "@/components/SidebarMenuOrderModal";
import { UsersAdminPage } from "@/components/UsersAdminPage";
import { AccountingHubPage } from "@/components/AccountingHubPage";
import { AttendancePage } from "@/components/AttendancePage";
import { AutoLinkBadge, SalePaymentLinkBadge, SalePaymentLinkProvider } from "@/components/AutoLinkBadge";
import { buildAutoLinkedSaleIdSet, buildManualLinkedSaleIdSet, isSaleAutoLinkedPaid, isSaleManualLinkedPaid } from "@/utils/bankReceivableMatch";
import { ClientStatementModal } from "@/components/ClientStatementModal";
import { filterClientCalendarSales, normalizeClientCalendarName } from "@/utils/clientCalendarStats";
import { CompanyNoticeBoardPage } from "@/components/CompanyNoticeBoardPage";
import { CompanyProfilePage } from "@/components/CompanyProfilePage";
import { DEFAULT_COMPANY_PROFILE, normalizeCompanyProfile } from "@/utils/companyProfile";
import { formatDepositNameAliases } from "@/utils/clientDepositAliases";
import { normalizeCompanyNotices } from "@/utils/companyNotices";
import { normalizeWorkPosts } from "@/utils/workBoard";
import { normalizeTaxInvoices } from "@/utils/taxInvoices";
import { normalizeBankTransactions } from "@/utils/bankTransactions";
import { normalizeBankLedgerMatchRules } from "@/utils/bankCompanyLedger";
import { syncFixedExpenseAutomation } from "@/utils/fixedExpenseAutomation";
import { normalizeExpenseCategories, normalizeFixedExpenseCategories } from "@/utils/companyLedger";
import { normalizeBankTransactionFolders } from "@/utils/bankTransactionFolders";
import { normalizeWorkerPayoutVouchers } from "@/utils/workerPayoutLedger";
import { migrateActivePageKey, storeAccountingTab } from "@/utils/accountingHub";
import { normalizeStatementGenerationLogs } from "@/utils/statementGenerationLogs";
import { normalizeStatementFolders } from "@/utils/statementFolders";
import { normalizeAttendanceRecords } from "@/utils/attendance";
import { createClientCalendarStatementDraft, createUnpaidClientStatementDraft, stashStatementDraft, type StatementDraft } from "@/utils/statementDraft";
import {
  buildCalendarPaymentPreview,
  buildCalendarPaymentCancelPreview,
} from "@/utils/clientCalendarPayment";
import { createPaymentInputLogsFromVouchers } from "@/utils/paymentInputLogs";
import { useActionNotice } from "@/hooks/useActionNotice";
import { TableExportSection, TableExportToolbar } from "@/components/TableExportSection";
import { WorkerListExport } from "@/components/WorkerListExport";
import { ClientListExport } from "@/components/ClientListExport";
import { buildClientLastSaleDateMap } from "@/utils/clientListExport";
import { KoreanDateInput } from "@/components/KoreanDateInput";
import { PageKeepAlive } from "@/components/PageKeepAlive";
import { DesktopTableWrap, MobileRecordCard, MobileRecordList } from "@/components/MobileRecordCard";
import { AutocompleteInput, AutocompleteSelect } from "@/components/AutocompleteInput";
import { buildReceivableRowsFromSales, getStatus, getUnpaid, parseMoney, formatMoneyInput, sanitizeMoneyInput } from "@/utils/receivables";
import { getSaleStaffCount, getSaleTotalBill, getSaleWorkerLines, normalizeSalesRecords } from "@/utils/saleBilling";
import { formatWorkerNameSummary } from "@/utils/statementSheets";
import { buildSaleDuplicateIndex, findSalesWithSameClientWorkerDate, isDuplicateSale } from "@/utils/saleDuplicates";
import { filterNamedSuggestions } from "@/utils/autocompleteFilter";
import { confirmDelete } from "@/utils/confirmDelete";
import { filterSalesVoucherRows } from "@/utils/saleVoucherSearch";
import { allocateNextSaleRecordIds, getSaleVoucherLabel, parseVoucherSequence } from "@/utils/saleVoucherNo";
import {
  SALE_AUDIT_FIELDS,
  CLIENT_AUDIT_FIELDS,
  WORKER_AUDIT_FIELDS,
  PAYMENT_AUDIT_FIELDS,
  snapshotSaleForAudit,
  snapshotClientForAudit,
  snapshotWorkerForAudit,
  snapshotPaymentForAudit,
  appendAuditLogs,
  buildAuditEntries,
  mergeAuditLogs,
} from "@/utils/auditLog";
import {
  appendLoginLogs,
  buildLoginLogEntry,
  migrateErpLoginLogs,
} from "@/utils/loginLogs";
import {
  applyWorkerLineFieldUpdate,
  buildWorkerFeeMap,
  calculateWorkerLineAmounts,
  calculateWorkerLineMetrics,
  enrichWorkerLineWithMetrics,
  hasExplicitWorkerField,
  isLineBillStaleUnitCostFallback,
  resolveWorkerFeeRate,
  stripWorkerLineComputedMetrics,
  sumWorkerFormTotals,
} from "@/utils/workerLineMetrics";
import {
  clearAuthSession,
  fetchErpData,
  getAuthToken,
  isApiModeEnabled,
  loadAuthUser,
  loginWithApi,
  saveErpData,
  updateSidebarOrderApi,
  type BankSyncSnapshot,
} from "@/utils/erpApi";
import {
  canUserAccessPage,
  getAccessiblePageDefs,
  getDefaultPageForUser,
  getPageLabel,
  type ErpPageKey,
} from "@/utils/pageAccess";
import {
  cacheSidebarOrderFromUser,
  resolveSidebarOrder,
  saveSidebarOrder,
  sortPageDefsByOrder,
  syncLocalSidebarOrderIfNeeded,
} from "@/utils/sidebarOrder";

const initialReceivables = [
  { id: 1, client: "키친바이블", businessNo: "751-24-01200", manager: "김혁대표님", phone: "010-5775-4630", date: "2026-03-01", voucherNo: "2821-001", salesAmount: 354000, paidAmount: 354000, dueDate: "2026-03-23", memo: "마포 현장" },
  { id: 2, client: "키친바이블", businessNo: "751-24-01200", manager: "김혁대표님", phone: "010-5775-4630", date: "2026-03-03", voucherNo: "2823-001", salesAmount: 390000, paidAmount: 390000, dueDate: "2026-03-23", memo: "보정동 / 김민성" },
  { id: 3, client: "바오퍼니처", businessNo: "", manager: "윤준한 대표님", phone: "010-2084-6523", date: "2026-03-03", voucherNo: "2822-001", salesAmount: 896000, paidAmount: 896000, dueDate: "2026-03-20", memo: "성북 세리니티" },
  { id: 4, client: "엠투디자인", businessNo: "", manager: "김형우", phone: "010-2442-6334", date: "2026-03-03", voucherNo: "2833-001", salesAmount: 731000, paidAmount: 0, dueDate: "2026-05-22", memo: "응봉대림" },
  { id: 5, client: "아파트멘터리", businessNo: "723-87-00195", manager: "윤소연,김준영", phone: "010-3563-5722", date: "2026-03-03", voucherNo: "2828-001", salesAmount: 1440000, paidAmount: 1170000, dueDate: "2026-05-15", memo: "반포 원베일리" },
];

const initialSales = [
  { id: 101, date: "2026-03-01", client: "키친바이블", site: "마포", worker: "유효철", amount: 354000, paid: 354000, memo: "마포 현장" },
  { id: 102, date: "2026-03-03", client: "키친바이블", site: "보정동", worker: "김민성", amount: 390000, paid: 390000, memo: "보정동 / 김민성" },
  { id: 103, date: "2026-03-03", client: "바오퍼니처", site: "성북 세리니티", worker: "유홍규, 허민, 이강훈", amount: 896000, paid: 896000, memo: "성북 세리니티" },
  { id: 104, date: "2026-03-03", client: "엠투디자인", site: "응봉대림", worker: "유효철, 단단팀 황일곤", amount: 731000, paid: 0, memo: "응봉대림" },
  { id: 105, date: "2026-03-03", client: "아파트멘터리", site: "반포 원베일리", worker: "정둠밈, 이서준, 장원호, 최성훈", amount: 1440000, paid: 1170000, memo: "반포 원베일리" },
  { id: 106, date: "2026-03-03", client: "키친앤숲", site: "여의도 트럼프", worker: "전성규, 김병주, 김재홍, 박준규", amount: 1250000, paid: 900000, memo: "여의도 트럼프" },
  { id: 107, date: "2026-03-04", client: "우림", site: "수원", worker: "김태우", amount: 379000, paid: 379000, memo: "수원" },
];

const initialPaymentVouchers = [];

const initialClients = [{"id":1,"name":"나우","businessNo":"","manager":"","phone":"","constructionCost":300000,"overtimeCost":30000,"vat":"Y","mealIncluded":"N","memo":""},{"id":2,"name":"노이","businessNo":"","manager":"","phone":"010-9847-4982","constructionCost":300000,"overtimeCost":30000,"vat":"N","mealIncluded":"Y","memo":""},{"id":3,"name":"누림","businessNo":"398-87-02094","manager":"이상은","phone":"","constructionCost":350000,"overtimeCost":30000,"vat":"Y","mealIncluded":"N","memo":""},{"id":4,"name":"다옴","businessNo":"502-31-46068","manager":"박성근대표님","phone":"010-4900-8000","constructionCost":300000,"overtimeCost":30000,"vat":"N","mealIncluded":"Y","memo":""},{"id":5,"name":"럭스","businessNo":"","manager":"","phone":"","constructionCost":350000,"overtimeCost":30000,"vat":"Y","mealIncluded":"Y","memo":""},{"id":6,"name":"리브젠","businessNo":"","manager":"","phone":"","constructionCost":300000,"overtimeCost":30000,"vat":"N","mealIncluded":"N","memo":""},{"id":7,"name":"바우스","businessNo":"","manager":"","phone":"","constructionCost":300000,"overtimeCost":30000,"vat":"N","mealIncluded":"N","memo":""},{"id":8,"name":"미무","businessNo":"318-85-04466","manager":"김도형대표님","phone":"010-7247-0853","constructionCost":330000,"overtimeCost":30000,"vat":"Y","mealIncluded":"Y","memo":"계산서필: 필수(미무) / 거래내역서: 월 2회"},{"id":9,"name":"인디퍼","businessNo":"296-88-02460","manager":"오승민대표님","phone":"010-5238-0736","constructionCost":330000,"overtimeCost":30000,"vat":"Y","mealIncluded":"Y","memo":"계산서필: 필수 / 거래내역서: 월 2회"},{"id":10,"name":"카르트","businessNo":"663-88-02355","manager":"김진숙","phone":"","constructionCost":300000,"overtimeCost":30000,"vat":"Y","mealIncluded":"N","memo":""},{"id":11,"name":"팀오더","businessNo":"","manager":"김영현팀장님","phone":"010-9288-6488","constructionCost":350000,"overtimeCost":30000,"vat":"N","mealIncluded":"Y","memo":""},{"id":12,"name":"퍼니블","businessNo":"494-31-01284","manager":"최고","phone":"","constructionCost":300000,"overtimeCost":20000,"vat":"Y","mealIncluded":"N","memo":""},{"id":13,"name":"키친앤홈","businessNo":"513-86-02153","manager":"조은애대표님","phone":"010-2110-3500","constructionCost":330000,"overtimeCost":30000,"vat":"Y","mealIncluded":"Y","memo":"계산서필: 필수"},{"id":14,"name":"커스텀","businessNo":"852-07-02785","manager":"이종혁실장님","phone":"010-8775-2364","constructionCost":350000,"overtimeCost":30000,"vat":"Y","mealIncluded":"Y","memo":""},{"id":15,"name":"다연","businessNo":"","manager":"","phone":"","constructionCost":350000,"overtimeCost":30000,"vat":"N","mealIncluded":"N","memo":""},{"id":16,"name":"나무젠","businessNo":"452-27-01022","manager":"박이사님","phone":"010-2465-3465","constructionCost":300000,"overtimeCost":30000,"vat":"Y","mealIncluded":"Y","memo":""},{"id":17,"name":"라우에","businessNo":"252-50-00270","manager":"전창호실장님","phone":"010-9519-0101","constructionCost":300000,"overtimeCost":30000,"vat":"Y","mealIncluded":"Y","memo":""},{"id":18,"name":"넥스","businessNo":"204-15-52782","manager":"조선아과장님","phone":"010-7722-1815","constructionCost":300000,"overtimeCost":30000,"vat":"Y","mealIncluded":"Y","memo":""},{"id":19,"name":"빈스","businessNo":"510-14-51231","manager":"임다빈","phone":"010-4130-6836","constructionCost":300000,"overtimeCost":30000,"vat":"Y","mealIncluded":"Y","memo":""},{"id":20,"name":"바첸","businessNo":"134-26-68910","manager":"박무성","phone":"","constructionCost":300000,"overtimeCost":30000,"vat":"Y","mealIncluded":"Y","memo":""},{"id":21,"name":"어썸","businessNo":"601-41-68316","manager":"손민규실장님","phone":"010-2837-5874","constructionCost":350000,"overtimeCost":30000,"vat":"Y","mealIncluded":"Y","memo":""},{"id":22,"name":"카멜레온","businessNo":"163-08-01742","manager":"임동진","phone":"","constructionCost":300000,"overtimeCost":30000,"vat":"Y","mealIncluded":"Y","memo":""},{"id":23,"name":"어바웃","businessNo":"864-35-00385","manager":"이영빈대표님","phone":"010-9187-5202","constructionCost":300000,"overtimeCost":30000,"vat":"Y","mealIncluded":"Y","memo":""},{"id":24,"name":"쉐이드","businessNo":"203-31-61541","manager":"노승훈팀장님","phone":"010-2054-3570","constructionCost":330000,"overtimeCost":30000,"vat":"Y","mealIncluded":"Y","memo":""},{"id":25,"name":"탑키친","businessNo":"","manager":"","phone":"","constructionCost":350000,"overtimeCost":40000,"vat":"N","mealIncluded":"Y","memo":""},{"id":26,"name":"릴리프","businessNo":"523-87-01819","manager":"오민식","phone":"","constructionCost":300000,"overtimeCost":30000,"vat":"N","mealIncluded":"Y","memo":""},{"id":27,"name":"에이원퍼니처","businessNo":"","manager":"","phone":"","constructionCost":300000,"overtimeCost":30000,"vat":"N","mealIncluded":"Y","memo":""},{"id":28,"name":"조재훈실장님","businessNo":"","manager":"","phone":"","constructionCost":330000,"overtimeCost":30000,"vat":"Y","mealIncluded":"Y","memo":""},{"id":29,"name":"베카코리아부산","businessNo":"644-08-02352","manager":"김준영실장님","phone":"010-2463-2627","constructionCost":330000,"overtimeCost":30000,"vat":"Y","mealIncluded":"Y","memo":""},{"id":30,"name":"엘트리","businessNo":"","manager":"","phone":"","constructionCost":300000,"overtimeCost":30000,"vat":"N","mealIncluded":"Y","memo":""},{"id":31,"name":"오영선이사","businessNo":"","manager":"","phone":"","constructionCost":300000,"overtimeCost":30000,"vat":"N","mealIncluded":"Y","memo":""},{"id":32,"name":"디자인퍼니처","businessNo":"105-81-44812","manager":"송준모 대표님","phone":"","constructionCost":300000,"overtimeCost":30000,"vat":"N","mealIncluded":"Y","memo":""},{"id":33,"name":"바오퍼니처","businessNo":"","manager":"윤준한 대표님","phone":"010-2084-6523","constructionCost":330000,"overtimeCost":30000,"vat":"Y","mealIncluded":"Y","memo":"거래내역서: 월 2회"},{"id":34,"name":"라곰퍼니처","businessNo":"682-08-00899","manager":"정의엽대표님","phone":"","constructionCost":330000,"overtimeCost":30000,"vat":"N","mealIncluded":"Y","memo":""},{"id":35,"name":"팀밀리미터","businessNo":"505-88-03515","manager":"","phone":"","constructionCost":300000,"overtimeCost":30000,"vat":"N","mealIncluded":"Y","memo":""},{"id":36,"name":"온테일","businessNo":"329-22-02390","manager":"조재훈","phone":"","constructionCost":330000,"overtimeCost":30000,"vat":"Y","mealIncluded":"Y","memo":"계산서필: 필수 / 거래내역서: 월 2회"},{"id":37,"name":"해밀디자인","businessNo":"701-86-01902","manager":"김학호","phone":"010-4009-8444","constructionCost":350000,"overtimeCost":30000,"vat":"N","mealIncluded":"N","memo":""},{"id":38,"name":"에싯굿","businessNo":"449-11-02437","manager":"임차혁","phone":"","constructionCost":350000,"overtimeCost":30000,"vat":"Y","mealIncluded":"Y","memo":"계산서필: 필수 / 거래내역서: 월 2회"},{"id":39,"name":"다송","businessNo":"","manager":"","phone":"","constructionCost":350000,"overtimeCost":40000,"vat":"N","mealIncluded":"Y","memo":""},{"id":40,"name":"키친바이블","businessNo":"751-24-01200","manager":"김혁대표님","phone":"010-5775-4630","constructionCost":330000,"overtimeCost":30000,"vat":"Y","mealIncluded":"Y","memo":""},{"id":41,"name":"제이원키친","businessNo":"541-19-01614","manager":"이재원","phone":"","constructionCost":350000,"overtimeCost":40000,"vat":"N","mealIncluded":"Y","memo":""},{"id":42,"name":"느루디자인","businessNo":"737-36-01570","manager":"김화숙","phone":"","constructionCost":350000,"overtimeCost":30000,"vat":"Y","mealIncluded":"Y","memo":""},{"id":43,"name":"오드삼삼","businessNo":"152-86-01212","manager":"노희민실장님","phone":"010-4100-4935","constructionCost":300000,"overtimeCost":30000,"vat":"Y","mealIncluded":"Y","memo":""},{"id":44,"name":"엠투디자인","businessNo":"","manager":"김형우","phone":"010-2442-6334","constructionCost":350000,"overtimeCost":30000,"vat":"Y","mealIncluded":"Y","memo":""},{"id":45,"name":"김용석팀장","businessNo":"","manager":"","phone":"","constructionCost":300000,"overtimeCost":30000,"vat":"N","mealIncluded":"Y","memo":""},{"id":46,"name":"본파트너스","businessNo":"333-87-00046","manager":"이영미","phone":"","constructionCost":350000,"overtimeCost":30000,"vat":"Y","mealIncluded":"Y","memo":""},{"id":47,"name":"베카코리아서울","businessNo":"302-81-30146","manager":"권영석","phone":"010-2784-1310","constructionCost":330000,"overtimeCost":30000,"vat":"Y","mealIncluded":"Y","memo":"계산서필: 필수"},{"id":48,"name":"밀리퍼니","businessNo":"727-23-01118","manager":"박재완","phone":"010-9220-9692","constructionCost":350000,"overtimeCost":30000,"vat":"Y","mealIncluded":"Y","memo":""},{"id":49,"name":"라움","businessNo":"","manager":"","phone":"","constructionCost":350000,"overtimeCost":30000,"vat":"N","mealIncluded":"Y","memo":""},{"id":50,"name":"키바소개","businessNo":"","manager":"","phone":"","constructionCost":330000,"overtimeCost":30000,"vat":"N","mealIncluded":"Y","memo":""},{"id":51,"name":"잇츠","businessNo":"","manager":"","phone":"","constructionCost":350000,"overtimeCost":30000,"vat":"N","mealIncluded":"Y","memo":""},{"id":52,"name":"부산대우그린","businessNo":"","manager":"","phone":"","constructionCost":330000,"overtimeCost":30000,"vat":"N","mealIncluded":"Y","memo":""},{"id":53,"name":"케이싱크","businessNo":"","manager":"","phone":"","constructionCost":350000,"overtimeCost":30000,"vat":"N","mealIncluded":"Y","memo":""},{"id":54,"name":"부산에이지스튜디오","businessNo":"","manager":"","phone":"","constructionCost":350000,"overtimeCost":30000,"vat":"N","mealIncluded":"Y","memo":""},{"id":55,"name":"성실가구","businessNo":"769-81-01989","manager":"김영숙","phone":"","constructionCost":350000,"overtimeCost":30000,"vat":"Y","mealIncluded":"Y","memo":""},{"id":56,"name":"조아리폼","businessNo":"","manager":"","phone":"","constructionCost":350000,"overtimeCost":30000,"vat":"N","mealIncluded":"Y","memo":""},{"id":57,"name":"비엔키친","businessNo":"","manager":"","phone":"","constructionCost":330000,"overtimeCost":30000,"vat":"N","mealIncluded":"Y","memo":""},{"id":58,"name":"우보소개","businessNo":"","manager":"","phone":"","constructionCost":350000,"overtimeCost":30000,"vat":"N","mealIncluded":"Y","memo":""},{"id":59,"name":"진성은디자인","businessNo":"880-81-02378","manager":"진성은","phone":"","constructionCost":350000,"overtimeCost":30000,"vat":"Y","mealIncluded":"Y","memo":""},{"id":60,"name":"럭스","businessNo":"","manager":"문연준","phone":"010-3269-7098","constructionCost":350000,"overtimeCost":30000,"vat":"Y","mealIncluded":"Y","memo":""},{"id":61,"name":"하랑","businessNo":"694-33-00759","manager":"박승배","phone":"010-7673-1740","constructionCost":350000,"overtimeCost":30000,"vat":"Y","mealIncluded":"Y","memo":""},{"id":62,"name":"리앤","businessNo":"","manager":"","phone":"","constructionCost":350000,"overtimeCost":30000,"vat":"N","mealIncluded":"Y","memo":""},{"id":63,"name":"윤술디자인","businessNo":"624-88-03612","manager":"신윤수","phone":"010-6564-6815","constructionCost":350000,"overtimeCost":30000,"vat":"N","mealIncluded":"Y","memo":""},{"id":64,"name":"키친앤숲","businessNo":"419-81-03739","manager":"이승재","phone":"010-5188-1655(김민정)","constructionCost":350000,"overtimeCost":30000,"vat":"Y","mealIncluded":"Y","memo":""},{"id":65,"name":"HY디자인","businessNo":"602-16-67093","manager":"박동춘","phone":"","constructionCost":350000,"overtimeCost":30000,"vat":"Y","mealIncluded":"Y","memo":"계산서필: 필수 / 거래내역서: 주 1회"},{"id":66,"name":"아파트멘터리","businessNo":"723-87-00195","manager":"윤소연,김준영","phone":"010-3563-5722","constructionCost":350000,"overtimeCost":30000,"vat":"Y","mealIncluded":"Y","memo":""},{"id":67,"name":"개인소비","businessNo":"","manager":"","phone":"","constructionCost":330000,"overtimeCost":30000,"vat":"N","mealIncluded":"Y","memo":""},{"id":68,"name":"노스플랜","businessNo":"","manager":"","phone":"","constructionCost":350000,"overtimeCost":30000,"vat":"N","mealIncluded":"Y","memo":""},{"id":69,"name":"누림","businessNo":"398-87-02094","manager":"이상은","phone":"","constructionCost":350000,"overtimeCost":30000,"vat":"N","mealIncluded":"Y","memo":""},{"id":70,"name":"하르퍼니처","businessNo":"","manager":"","phone":"","constructionCost":350000,"overtimeCost":30000,"vat":"Y","mealIncluded":"Y","memo":""},{"id":71,"name":"미크래빗","businessNo":"341-81-01364","manager":"김명일","phone":"","constructionCost":350000,"overtimeCost":30000,"vat":"Y","mealIncluded":"Y","memo":""},{"id":72,"name":"포메","businessNo":"","manager":"권성민","phone":"010-3956-3562","constructionCost":350000,"overtimeCost":30000,"vat":"Y","mealIncluded":"Y","memo":""},{"id":73,"name":"미래퍼니처","businessNo":"","manager":"","phone":"","constructionCost":350000,"overtimeCost":30000,"vat":"N","mealIncluded":"Y","memo":""},{"id":74,"name":"개인소비자","businessNo":"","manager":"","phone":"","constructionCost":330000,"overtimeCost":30000,"vat":"N","mealIncluded":"Y","memo":""},{"id":75,"name":"예림","businessNo":"","manager":"","phone":"","constructionCost":350000,"overtimeCost":30000,"vat":"Y","mealIncluded":"Y","memo":""},{"id":76,"name":"퍼니볼트","businessNo":"217-26-13404","manager":"이은준","phone":"010-2237-4093","constructionCost":350000,"overtimeCost":30000,"vat":"Y","mealIncluded":"Y","memo":""},{"id":77,"name":"도담","businessNo":"","manager":"","phone":"","constructionCost":350000,"overtimeCost":30000,"vat":"Y","mealIncluded":"Y","memo":""},{"id":78,"name":"제이와이","businessNo":"287-81-02486","manager":"정현우대표님","phone":"010-9631-0084","constructionCost":350000,"overtimeCost":30000,"vat":"Y","mealIncluded":"Y","memo":""},{"id":79,"name":"우림","businessNo":"869-87-02844","manager":"안병진대표님","phone":"010-8456-5253","constructionCost":350000,"overtimeCost":30000,"vat":"Y","mealIncluded":"Y","memo":""},{"id":80,"name":"바함","businessNo":"207-08-80727","manager":"우현탁","phone":"","constructionCost":350000,"overtimeCost":30000,"vat":"Y","mealIncluded":"Y","memo":""},{"id":81,"name":"바함(김보윤실장)","businessNo":"207-08-80727","manager":"김보윤","phone":"","constructionCost":0,"overtimeCost":0,"vat":"N","mealIncluded":"N","memo":""},{"id":82,"name":"더안","businessNo":"524-77-00599","manager":"안지원","phone":"","constructionCost":350000,"overtimeCost":30000,"vat":"Y","mealIncluded":"Y","memo":""},{"id":83,"name":"김영현팀장님","businessNo":"","manager":"김영현팀장님","phone":"","constructionCost":350000,"overtimeCost":0,"vat":"Y","mealIncluded":"Y","memo":""},{"id":84,"name":"퍼랩스","businessNo":"572-14-00706","manager":"박영태대표님","phone":"010-6309-2385","constructionCost":350000,"overtimeCost":30000,"vat":"Y","mealIncluded":"Y","memo":""},{"id":85,"name":"바이빅테이블","businessNo":"277-53-00192","manager":"정재운대표님","phone":"010-3034-0194","constructionCost":350000,"overtimeCost":30000,"vat":"Y","mealIncluded":"Y","memo":""},{"id":86,"name":"인테리어쇼","businessNo":"453-88-01900","manager":"김영빈","phone":"","constructionCost":350000,"overtimeCost":30000,"vat":"Y","mealIncluded":"Y","memo":""},{"id":87,"name":"키친제니스","businessNo":"","manager":"","phone":"","constructionCost":350000,"overtimeCost":30000,"vat":"Y","mealIncluded":"Y","memo":""},{"id":88,"name":"홈루덴스","businessNo":"673-88-02745","manager":"박수성","phone":"010-5110-9288","constructionCost":350000,"overtimeCost":30000,"vat":"Y","mealIncluded":"Y","memo":""},{"id":89,"name":"선건축","businessNo":"702-07-02651","manager":"한승호","phone":"010-4440-0443","constructionCost":350000,"overtimeCost":30000,"vat":"Y","mealIncluded":"Y","memo":""},{"id":90,"name":"HG","businessNo":"408-87-02616","manager":"김정훈 대표","phone":"","constructionCost":350000,"overtimeCost":30000,"vat":"Y","mealIncluded":"Y","memo":""},{"id":91,"name":"CNA건설","businessNo":"574-87-03270","manager":"박진수,전승희","phone":"","constructionCost":350000,"overtimeCost":30000,"vat":"Y","mealIncluded":"Y","memo":""},{"id":92,"name":"우리퍼니처포항","businessNo":"736-49-00772","manager":"남주현 대표","phone":"","constructionCost":350000,"overtimeCost":30000,"vat":"Y","mealIncluded":"Y","memo":""},{"id":93,"name":"유니크","businessNo":"446-15-01927","manager":"엄태진","phone":"","constructionCost":350000,"overtimeCost":30000,"vat":"Y","mealIncluded":"Y","memo":""},{"id":94,"name":"알코","businessNo":"875-44-01275","manager":"민홍장대표님","phone":"","constructionCost":350000,"overtimeCost":30000,"vat":"Y","mealIncluded":"Y","memo":""},{"id":95,"name":"키친앤코","businessNo":"","manager":"","phone":"","constructionCost":350000,"overtimeCost":30000,"vat":"Y","mealIncluded":"Y","memo":""},{"id":96,"name":"에프에프퍼니처","businessNo":"177-22-02130","manager":"김소영대표님","phone":"","constructionCost":350000,"overtimeCost":30000,"vat":"Y","mealIncluded":"Y","memo":""},{"id":97,"name":"비앤비디자인","businessNo":"166-24-00887","manager":"김병민","phone":"","constructionCost":350000,"overtimeCost":30000,"vat":"Y","mealIncluded":"Y","memo":""},{"id":98,"name":"태광","businessNo":"","manager":"","phone":"","constructionCost":350000,"overtimeCost":30000,"vat":"Y","mealIncluded":"Y","memo":""},{"id":99,"name":"디자인유벤","businessNo":"","manager":"","phone":"","constructionCost":350000,"overtimeCost":30000,"vat":"Y","mealIncluded":"Y","memo":""},{"id":100,"name":"비엔비디자인","businessNo":"","manager":"","phone":"","constructionCost":350000,"overtimeCost":30000,"vat":"Y","mealIncluded":"Y","memo":""},{"id":101,"name":"드림씽크","businessNo":"","manager":"","phone":"","constructionCost":350000,"overtimeCost":30000,"vat":"Y","mealIncluded":"Y","memo":""}];

const initialWorkers = [
  { id: 1, name: "배종원", bank: "농협", account: "3521068652933", phone: "010-5797-7863", constructionCost: 400000, overtimeCost: 30000, feeRate: 0, memo: "" },
  { id: 2, name: "김민성", bank: "우리", account: "1005504611465", phone: "010-4457-6334", constructionCost: 390000, overtimeCost: 30000, feeRate: 0.1, memo: "" },
  { id: 3, name: "정둠밈", bank: "카카오뱅크", account: "3333304498766", phone: "010-8756-7078", constructionCost: 390000, overtimeCost: 30000, feeRate: 0.1, memo: "" },
  { id: 4, name: "이서준", bank: "신한", account: "110508771860", phone: "010-5511-6348", constructionCost: 350000, overtimeCost: 30000, feeRate: 0.1, memo: "" },
  { id: 5, name: "여명기", bank: "농협", account: "3120147464861", phone: "010-3694-2190", constructionCost: 350000, overtimeCost: 30000, feeRate: 0.1, memo: "" },
  { id: 6, name: "박준규", bank: "국민", account: "806437-00-012636(준퍼니처)", phone: "010-6483-6945", constructionCost: 350000, overtimeCost: 30000, feeRate: 0.1, memo: "" },
  { id: 7, name: "유효철", bank: "국민", account: "50160201184763", phone: "010-6398-8654", constructionCost: 350000, overtimeCost: 30000, feeRate: 0.1, memo: "" },
  { id: 8, name: "허민", bank: "하나", account: "14491036257907", phone: "010-8379-4089", constructionCost: 330000, overtimeCost: 30000, feeRate: 0.1, memo: "" },
  { id: 9, name: "신동욱", bank: "신한", account: "110165734600", phone: "010-6788-1707", constructionCost: 300000, overtimeCost: 30000, feeRate: 0.1, memo: "" },
  { id: 10, name: "장원호", bank: "국민", account: "51970101096893", phone: "010-9208-5019", constructionCost: 330000, overtimeCost: 30000, feeRate: 0.1, memo: "" },
  { id: 11, name: "유홍규", bank: "신한", account: "110388315954", phone: "010-9378-8030", constructionCost: 330000, overtimeCost: 30000, feeRate: 0.1, memo: "" },
  { id: 12, name: "전성규", bank: "신한", account: "110492002497", phone: "010-6413-4755", constructionCost: 330000, overtimeCost: 30000, feeRate: 0.1, memo: "" },
  { id: 13, name: "강태원", bank: "국민", account: "71820201219984", phone: "010-2474-1677", constructionCost: 320000, overtimeCost: 30000, feeRate: 0.1, memo: "" },
  { id: 14, name: "김태우", bank: "국민", account: "29030204288461", phone: "010-9188-8452", constructionCost: 350000, overtimeCost: 30000, feeRate: 0.1, memo: "" },
  { id: 15, name: "문정학", bank: "국민", account: "76230204146879", phone: "010-9359-7704", constructionCost: 330000, overtimeCost: 30000, feeRate: 0.1, memo: "" },
  { id: 16, name: "최성훈", bank: "신한", account: "110455332533", phone: "010-2363-7614", constructionCost: 300000, overtimeCost: 30000, feeRate: 0.1, memo: "" },
  { id: 17, name: "최건일", bank: "신한", account: "110398668110", phone: "010 7563 5298", constructionCost: 220000, overtimeCost: 30000, feeRate: 0.1, memo: "" },
  { id: 18, name: "이호혁", bank: "토스뱅크", account: "1000-1262-8260", phone: "010-9148-1595", constructionCost: 270000, overtimeCost: 30000, feeRate: 0.1, memo: "" },
  { id: 19, name: "김병주", bank: "우리은행", account: "1002-459-808633", phone: "010-2203-7076", constructionCost: 180000, overtimeCost: 30000, feeRate: 0.1, memo: "" },
  { id: 20, name: "임성혁", bank: "국민은행", account: "01250104124090", phone: "010-3464-8014", constructionCost: 180000, overtimeCost: 30000, feeRate: 0.1, memo: "" },
  { id: 21, name: "김재홍", bank: "", account: "", phone: "010-5011-2956", constructionCost: 320000, overtimeCost: 30000, feeRate: 0.1, memo: "" },
  { id: 22, name: "신동석", bank: "", account: "", phone: "010-5353-2287", constructionCost: 200000, overtimeCost: 30000, feeRate: 0.1, memo: "" },
  { id: 23, name: "전진영", bank: "국민은행", account: "86510204080917", phone: "010-3027-4988", constructionCost: 200000, overtimeCost: 30000, feeRate: 0.1, memo: "" },
  { id: 24, name: "이강훈", bank: "", account: "", phone: "010-2239-8452", constructionCost: 150000, overtimeCost: 30000, feeRate: 0.1, memo: "" },
  { id: 25, name: "안준서", bank: "", account: "", phone: "010-4477-3352", constructionCost: 100000, overtimeCost: 30000, feeRate: 0.1, memo: "" },
  { id: 26, name: "김진호", bank: "", account: "", phone: "010-8370-4400", constructionCost: 100000, overtimeCost: 30000, feeRate: 0.1, memo: "" },
  { id: 27, name: "박정우", bank: "우리은행", account: "1002163814077", phone: "010-8008-2221", constructionCost: 100000, overtimeCost: 30000, feeRate: 0.1, memo: "" },
  { id: 28, name: "김명진", bank: "토스백크", account: "1000 0298 1331", phone: "010-4302-0913", constructionCost: 100000, overtimeCost: 30000, feeRate: 0.1, memo: "" },
  { id: 29, name: "서찬수", bank: "", account: "", phone: "010-6215-8484", constructionCost: 100000, overtimeCost: 30000, feeRate: 0.1, memo: "" },
  { id: 30, name: "정성수", bank: "", account: "", phone: "010-5596-8959", constructionCost: 100000, overtimeCost: 30000, feeRate: 0.1, memo: "" },
  { id: 31, name: "정호영", bank: "", account: "", phone: "010-5552-8484", constructionCost: 230000, overtimeCost: 30000, feeRate: 0.1, memo: "" },
];

const STORAGE_KEY = "teammillimeter-erp-stable-v1";
const SESSION_USER_KEY = "teammillimeter-erp-session";
const ACTIVE_TAB_KEY = "teammillimeter-erp-active-tab";
const REMEMBER_LOGIN_ID_KEY = "teammillimeter-erp-remember-login-id";
const REMEMBER_LOGIN_ID_FLAG_KEY = "teammillimeter-erp-remember-login-id-enabled";

function loadRememberLoginIdEnabled() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(REMEMBER_LOGIN_ID_FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

function loadRememberedLoginId() {
  if (!loadRememberLoginIdEnabled()) return "";
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(REMEMBER_LOGIN_ID_KEY) || "";
  } catch {
    return "";
  }
}

function persistRememberedLoginId(loginId, remember) {
  if (typeof window === "undefined") return;
  try {
    if (remember && loginId) {
      window.localStorage.setItem(REMEMBER_LOGIN_ID_KEY, loginId);
      window.localStorage.setItem(REMEMBER_LOGIN_ID_FLAG_KEY, "1");
    } else {
      window.localStorage.removeItem(REMEMBER_LOGIN_ID_KEY);
      window.localStorage.removeItem(REMEMBER_LOGIN_ID_FLAG_KEY);
    }
  } catch {
    // ignore
  }
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function monthStartISO() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function monthRangeISO(offset = 0) {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const startDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
  const endDateObj = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  const endDate = `${endDateObj.getFullYear()}-${String(endDateObj.getMonth() + 1).padStart(2, "0")}-${String(endDateObj.getDate()).padStart(2, "0")}`;
  return { startDate, endDate };
}

function addDaysISO(dateStr, days) {
  if (!dateStr) return "";
  const date = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(date.getTime())) return dateStr;
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function loadSessionUser() {
  if (typeof window === "undefined") return null;
  if (isApiModeEnabled()) {
    const user = loadAuthUser();
    return user && getAuthToken() ? user : null;
  }
  try {
    const saved = window.sessionStorage.getItem(SESSION_USER_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

function saveSessionUser(user) {
  if (typeof window === "undefined") return;
  try {
    if (user) window.sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(user));
    else window.sessionStorage.removeItem(SESSION_USER_KEY);
  } catch {
    // ignore
  }
}

function loadStoredData() {
  if (typeof window === "undefined") return null;
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved ? migrateClientName(JSON.parse(saved)) : null;
  } catch {
    return null;
  }
}

function saveStoredData(data) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // 저장소 접근이 막힌 환경에서도 앱은 계속 동작하게 둡니다.
  }
}

function downloadBackup(data) {
  if (typeof document === "undefined") return;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `teammillimeter-erp-backup-${todayISO()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function migrateClientName(data) {
  if (!data || typeof data !== "object") return data;
  const from = "에이치";
  const to = "미무";
  const next = { ...data };

  if (Array.isArray(next.clients)) {
    next.clients = next.clients.map((client) => (client.name === from ? { ...client, name: to } : client));
  }
  if (Array.isArray(next.sales)) {
    next.sales = next.sales.map((sale) => (sale.client === from ? { ...sale, client: to } : sale));
  }
  if (Array.isArray(next.paymentVouchers)) {
    next.paymentVouchers = next.paymentVouchers.map((voucher) => (voucher.client === from ? { ...voucher, client: to } : voucher));
  }
  if (Array.isArray(next.auditLogs)) {
    next.auditLogs = next.auditLogs.map((entry) => {
      const nextEntry = { ...entry };
      if (typeof nextEntry.entityLabel === "string" && nextEntry.entityLabel.includes(from)) {
        nextEntry.entityLabel = nextEntry.entityLabel.replaceAll(from, to);
      }
      if (nextEntry.before === from) nextEntry.before = to;
      if (nextEntry.after === from) nextEntry.after = to;
      return nextEntry;
    });
  }

  return next;
}

function resolveInitialLogs(storedData) {
  return migrateErpLoginLogs({
    auditLogs: Array.isArray(storedData?.auditLogs) ? storedData.auditLogs : [],
    loginLogs: Array.isArray(storedData?.loginLogs) ? storedData.loginLogs : [],
  });
}

function normalizeBackupPayload(raw) {
  if (!raw || typeof raw !== "object") throw new Error("invalid backup");
  return migrateErpLoginLogs(
    migrateClientName({
      sales: Array.isArray(raw.sales) ? raw.sales : initialSales,
      paymentVouchers: Array.isArray(raw.paymentVouchers) ? raw.paymentVouchers : [],
      paymentInputLogs: Array.isArray(raw.paymentInputLogs) ? raw.paymentInputLogs : [],
      clients: Array.isArray(raw.clients) && raw.clients.length ? raw.clients : initialClients,
      workers: Array.isArray(raw.workers) && raw.workers.length ? raw.workers : initialWorkers,
      auditLogs: Array.isArray(raw.auditLogs) ? raw.auditLogs : [],
      loginLogs: Array.isArray(raw.loginLogs) ? raw.loginLogs : [],
      workerPaymentRecords: Array.isArray(raw.workerPaymentRecords) ? raw.workerPaymentRecords : [],
      workerPayoutVouchers: normalizeWorkerPayoutVouchers(raw.workerPayoutVouchers),
      companyExpenses: Array.isArray(raw.companyExpenses) ? raw.companyExpenses : [],
      attendanceRecords: normalizeAttendanceRecords(raw.attendanceRecords),
      fixedExpenses: Array.isArray(raw.fixedExpenses) ? raw.fixedExpenses : [],
      fixedExpensePayments: Array.isArray(raw.fixedExpensePayments) ? raw.fixedExpensePayments : [],
      bankLedgerRules: normalizeBankLedgerMatchRules(raw.bankLedgerRules),
      expenseCategories: normalizeExpenseCategories(raw.expenseCategories, Array.isArray(raw.companyExpenses) ? raw.companyExpenses : []),
      fixedExpenseCategories: normalizeFixedExpenseCategories(
        raw.fixedExpenseCategories,
        Array.isArray(raw.fixedExpenses) ? raw.fixedExpenses : [],
      ),
      companyNotices: normalizeCompanyNotices(raw.companyNotices),
      workPosts: normalizeWorkPosts(raw.workPosts),
      taxInvoices: normalizeTaxInvoices(raw.taxInvoices),
      bankTransactions: normalizeBankTransactions(raw.bankTransactions),
      bankTransactionFolders: normalizeBankTransactionFolders(raw.bankTransactionFolders),
      statementGenerationLogs: normalizeStatementGenerationLogs(raw.statementGenerationLogs),
      statementFolders: normalizeStatementFolders(raw.statementFolders),
      companyProfile: normalizeCompanyProfile(raw.companyProfile),
    })
  );
}

const emptyReceivableForm = {
  client: "",
  businessNo: "",
  manager: "",
  phone: "",
  date: todayISO(),
  voucherNo: "",
  salesAmount: "",
  paidAmount: "",
  dueDate: todayISO(),
  memo: "",
};

const createWorkerLine = (index) => ({
  no: index + 1,
  worker: "",
  quantity: "",
  unitCost: "",
  chargeAmount: "",
  meal: "",
  lodging: "",
  expense: "",
  overtimeHours: "",
  overtimeCost: "30000",
  memo: "",
});

const emptySaleForm = {
  date: todayISO(),
  client: "",
  site: "",
  paid: "",
  memo: "",
  officeMemo: "",
  workers: Array.from({ length: 5 }, (_, index) => createWorkerLine(index)),
};

const compactSaleForm = () => ({
  ...emptySaleForm,
  workers: Array.from({ length: 8 }, (_, index) => createWorkerLine(index)),
});

function saleRowToForm(row, minWorkerRows = 8) {
  const workerLines = row.workers?.length
    ? row.workers.map((line, index) => {
        const merged = { ...createWorkerLine(index), ...line };
        if (
          Object.prototype.hasOwnProperty.call(merged, "chargeAmount") &&
          !hasExplicitWorkerField(merged.chargeAmount) &&
          isLineBillStaleUnitCostFallback(merged)
        ) {
          return stripWorkerLineComputedMetrics(merged);
        }
        return merged;
      })
    : [{
      ...createWorkerLine(0),
      worker: row.worker || "",
      quantity: "1",
      chargeAmount: String(row.amount || ""),
      unitCost: String(row.amount || ""),
    }];

  while (workerLines.length < minWorkerRows) {
    workerLines.push(createWorkerLine(workerLines.length));
  }

  return {
    date: row.date || todayISO(),
    client: row.client || "",
    site: row.site || "",
    paid: row.manualPaidCleared ? "" : String(row.basePaid ?? 0),
    memo: row.memo || "",
    officeMemo: row.officeMemo || "",
    workers: workerLines,
  };
}

function SaleFormCompactEditor({
  title,
  desc,
  form,
  update,
  updateWorkerLine,
  addWorkerLine,
  removeWorkerLine,
  clients,
  workers,
  totals,
  filledWorkerCount,
  canSave,
  onSave,
  saveLabel = "매출 저장",
  saveMessage = "",
  statusMessage,
  headerAction,
  auditEntityId,
  secondaryAction,
  footerStartExtra,
  onReset,
  showPaidField = true,
  memoAfterWorkers = false,
  onSharedMemoChange,
  lockClientSite = false,
  allowClientSiteUnlock = false,
}) {
  const [clientSiteUnlocked, setClientSiteUnlocked] = useState(false);
  const [clientSiteUnlockPromptOpen, setClientSiteUnlockPromptOpen] = useState(false);

  useEffect(() => {
    setClientSiteUnlocked(false);
    setClientSiteUnlockPromptOpen(false);
  }, [auditEntityId, allowClientSiteUnlock]);

  const clientSiteLocked = allowClientSiteUnlock ? !clientSiteUnlocked : lockClientSite;

  const footerStatus = saveMessage || statusMessage || (canSave
    ? `${form.client}${form.site ? ` · ${form.site}` : ""} · ${formatKRW(totals.bill)}`
    : null);
  const skipToolbarTabStop = memoAfterWorkers;

  const handleSiteKeyDown = (event) => {
    if (!memoAfterWorkers || isImeActive(event)) return;
    if (event.key === "Tab" && !event.shiftKey) {
      event.preventDefault();
      focusWorkerGridCell(0, "worker", { cursorAt: "start" });
    }
  };

  const handleFirstWorkerKeyDown = (event) => {
    if (!memoAfterWorkers || isImeActive(event)) return;
    if (event.key === "Tab" && event.shiftKey) {
      event.preventDefault();
      focusSaleFormSiteField();
    }
  };

  const totalsBar = (
    <div className="erp-sale-form-compact-metrics erp-sale-form-compact-metrics--above-table">
      <div className="erp-sale-form-compact-metric">
        <span className="label">청구</span>
        <span className="value">{formatKRW(totals.bill)}</span>
      </div>
      <div className="erp-sale-form-compact-metric">
        <span className="label">지급</span>
        <span className="value">{formatKRW(totals.spend)}</span>
      </div>
      <div className={`erp-sale-form-compact-metric ${totals.margin < 0 ? "is-negative" : "is-positive"}`}>
        <span className="label">마진</span>
        <span className="value">{formatKRW(totals.margin)}</span>
      </div>
    </div>
  );

  return (
    <>
      <div className="erp-sale-form-compact-head">
        <div>
          <h1 className="erp-sale-form-compact-title">{title}</h1>
          <p className="erp-sale-form-compact-desc">{desc ?? `전표 입력 · 시공자 ${filledWorkerCount}/${form.workers.length}명`}</p>
        </div>
        <div className="erp-sale-form-compact-head-actions">
          {auditEntityId != null && (
            <EntityAuditButton entityType="sale" entityId={auditEntityId} title="매출전표 변경 이력" />
          )}
          {headerAction}
        </div>
      </div>

      <Card className="erp-sale-form-card erp-sale-form-card--compact rounded-xl border-slate-200/80 shadow-sm">
        <CardContent className="p-3 md:p-4">
          <div className={`erp-sale-form-inline-grid${!showPaidField ? " erp-sale-form-inline-grid--no-paid" : ""}`}>
            <SaleFormField label="일자" icon={CalendarDays}>
              <div className="erp-sale-form-date-wrap">
                <Input type="date" className="erp-input-compact" value={form.date} onChange={(e) => update("date", e.target.value)} />
                <button type="button" className="erp-sale-form-date-today" onClick={() => update("date", todayISO())}>
                  {"\uC624\uB298"}
                </button>
              </div>
            </SaleFormField>
            <SaleFormField label="거래처" icon={Building2}>
              <div className="erp-sale-form-client-row">
                {clientSiteLocked ? (
                  <Input className="erp-input-compact erp-input-compact--locked" value={form.client} readOnly disabled />
                ) : (
                  <AutocompleteInput
                    value={form.client}
                    options={clients}
                    onChange={(value) => update("client", value)}
                    placeholder="거래처"
                    freeSolo={false}
                    inputProps={{ className: "erp-input-compact" }}
                    renderSub={(client) => `${client.manager || "담당자 없음"} · ${formatKRW(client.constructionCost || 0)}`}
                  />
                )}
                {allowClientSiteUnlock && clientSiteLocked ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="erp-sale-form-client-change-btn"
                    onClick={() => setClientSiteUnlockPromptOpen(true)}
                  >
                    <Pencil size={13} />
                    변경
                  </Button>
                ) : null}
              </div>
            </SaleFormField>
            <SaleFormField label="현장" icon={MapPin}>
              <Input
                className={`erp-input-compact${clientSiteLocked ? " erp-input-compact--locked" : ""}`}
                data-sale-form-site="true"
                value={form.site}
                onChange={(e) => update("site", e.target.value)}
                onKeyDown={clientSiteLocked ? undefined : handleSiteKeyDown}
                placeholder="현장명"
                readOnly={clientSiteLocked}
                disabled={clientSiteLocked}
              />
            </SaleFormField>
            {showPaidField && (
              <SaleFormField label="입금" icon={CreditCard}>
                <MoneyInput className="erp-input-compact" value={form.paid} onChange={(e) => update("paid", e.target.value)} placeholder="0" />
              </SaleFormField>
            )}
            {!memoAfterWorkers && (
              <>
                <SaleFormField label="공통비고" icon={FileText}>
                  <Input className="erp-input-compact" value={form.memo} onChange={(e) => (onSharedMemoChange || ((value) => update("memo", value)))(e.target.value)} placeholder="시공자 공통 비고" />
                </SaleFormField>
                <SaleFormField label="사무실메모" icon={FileText}>
                  <Input className="erp-input-compact" value={form.officeMemo || ""} onChange={(e) => update("officeMemo", e.target.value)} placeholder="사무실 메모" />
                </SaleFormField>
              </>
            )}
          </div>

          {totalsBar}

          <div className="erp-sale-form-table-toolbar">
            <span className="erp-text-caption font-semibold text-slate-500">시공자 내역</span>
            <Button variant="outline" size="sm" className="h-7 rounded-lg px-2 text-xs" tabIndex={skipToolbarTabStop ? -1 : undefined} onClick={addWorkerLine}>
              <Plus size={12} />
              행 추가
            </Button>
          </div>

          <TableExportSection fileName="매출등록_시공자" title="매출등록 시공자 내역" disabled={form.workers.length === 0} toolbarTabIndex={skipToolbarTabStop ? -1 : undefined}>
          <div className="erp-sale-form-table-wrap erp-sale-form-table-wrap--compact">
            <table className="erp-table erp-worker-grid-table erp-sale-form-table erp-sale-form-table--compact erp-sale-form-table--sheet">
              <colgroup>
                <col className="erp-col-index" />
                <col className="erp-col-worker" />
                <col className="erp-col-qty" />
                <col className="erp-col-num" />
                <col className="erp-col-num" />
                <col className="erp-col-num" />
                <col className="erp-col-num" />
                <col className="erp-col-num" />
                <col className="erp-col-num" />
                <col className="erp-col-num" />
                <col className="erp-col-memo" />
                <col className="erp-col-action" />
              </colgroup>
              <thead>
                <tr className="erp-sale-form-col-row">
                  <th className="text-center">#</th>
                  <th className="text-left">시공자</th>
                  <th className="text-right">수량</th>
                  <th className="text-right">지급</th>
                  <th className="text-right">청구</th>
                  <th className="text-right">식대</th>
                  <th className="text-right">숙박</th>
                  <th className="text-right">경비</th>
                  <th className="text-right">야근</th>
                  <th className="text-right">야근비</th>
                  <th className="text-left">비고</th>
                  <th className="erp-table-export-skip" />
                </tr>
              </thead>
              <tbody>
                {form.workers.map((line, index) => {
                  const hasWorker = Boolean(String(line.worker || "").trim());
                  return (
                    <tr key={index} className={hasWorker ? "is-filled" : ""}>
                      <td className="erp-sale-form-row-index text-center">{index + 1}</td>
                      <td className="erp-grid-worker">
                        <WorkerGridWorkerInput rowIndex={index} rowCount={form.workers.length} workers={workers} value={line.worker} onChange={(value) => updateWorkerLine(index, "worker", value)} onKeyDown={index === 0 ? handleFirstWorkerKeyDown : undefined} placeholder="시공자" className="erp-grid-input erp-input-compact" />
                      </td>
                      <td className="erp-grid-qty"><WorkerGridInput rowIndex={index} columnKey="quantity" rowCount={form.workers.length} className="erp-grid-input erp-grid-input--num erp-input-compact" value={line.quantity} onChange={(e) => updateWorkerLine(index, "quantity", e.target.value)} placeholder="1" /></td>
                      <td className="erp-grid-num"><WorkerGridInput rowIndex={index} columnKey="unitCost" rowCount={form.workers.length} className="erp-grid-input erp-grid-input--num erp-input-compact" value={line.unitCost} onChange={(e) => updateWorkerLine(index, "unitCost", e.target.value)} /></td>
                      <td className="erp-grid-num"><WorkerGridInput rowIndex={index} columnKey="chargeAmount" rowCount={form.workers.length} className="erp-grid-input erp-grid-input--num erp-input-compact" value={line.chargeAmount} onChange={(e) => updateWorkerLine(index, "chargeAmount", e.target.value)} /></td>
                      <td className="erp-grid-num"><WorkerGridInput rowIndex={index} columnKey="meal" rowCount={form.workers.length} className="erp-grid-input erp-grid-input--num erp-input-compact" value={line.meal} onChange={(e) => updateWorkerLine(index, "meal", e.target.value)} /></td>
                      <td className="erp-grid-num"><WorkerGridInput rowIndex={index} columnKey="lodging" rowCount={form.workers.length} className="erp-grid-input erp-grid-input--num erp-input-compact" value={line.lodging} onChange={(e) => updateWorkerLine(index, "lodging", e.target.value)} /></td>
                      <td className="erp-grid-num"><WorkerGridInput rowIndex={index} columnKey="expense" rowCount={form.workers.length} className="erp-grid-input erp-grid-input--num erp-input-compact" value={line.expense} onChange={(e) => updateWorkerLine(index, "expense", e.target.value)} /></td>
                      <td className="erp-grid-num"><WorkerGridInput rowIndex={index} columnKey="overtimeHours" rowCount={form.workers.length} className="erp-grid-input erp-grid-input--num erp-input-compact" value={line.overtimeHours} onChange={(e) => updateWorkerLine(index, "overtimeHours", e.target.value)} /></td>
                      <td className="erp-grid-num"><WorkerGridInput rowIndex={index} columnKey="overtimeCost" rowCount={form.workers.length} className="erp-grid-input erp-grid-input--num erp-input-compact" value={line.overtimeCost} onChange={(e) => updateWorkerLine(index, "overtimeCost", e.target.value)} /></td>
                      <td className="erp-sale-form-row-memo"><WorkerGridInput rowIndex={index} columnKey="memo" rowCount={form.workers.length} className="erp-grid-input erp-input-compact" value={line.memo} onChange={(e) => updateWorkerLine(index, "memo", e.target.value)} placeholder="개별 비고" /></td>
                      <td className="erp-sale-form-row-action erp-table-export-skip text-center">
                        <button
                          type="button"
                          className="erp-sale-form-row-delete"
                          tabIndex={skipToolbarTabStop ? -1 : undefined}
                          onClick={() => {
                            if (!confirmDelete("이 시공자 행을 삭제할까요?")) return;
                            removeWorkerLine(index);
                          }}
                          disabled={form.workers.length <= 1}
                          aria-label="행 삭제"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </TableExportSection>

          {memoAfterWorkers && (
            <div className="erp-sale-form-memo-after-workers">
              <SaleFormField label="공통비고" icon={FileText}>
                <Input
                  className="erp-input-compact"
                  value={form.memo}
                  onChange={(e) => (onSharedMemoChange || ((value) => update("memo", value)))(e.target.value)}
                  placeholder="시공자 공통 비고"
                />
              </SaleFormField>
              <SaleFormField label="사무실메모" icon={FileText}>
                <Input className="erp-input-compact" value={form.officeMemo || ""} onChange={(e) => update("officeMemo", e.target.value)} placeholder="사무실 메모" />
              </SaleFormField>
            </div>
          )}

          <div className="erp-sale-form-footer erp-sale-form-footer--compact">
            <div className="erp-sale-form-footer-start">
              {onReset ? (
                <Button variant="outline" size="sm" className="h-8 rounded-lg text-xs" onClick={onReset}>
                  <RotateCcw size={13} />
                  초기화
                </Button>
              ) : null}
              {footerStartExtra}
            </div>
            <div className="erp-sale-form-footer-status">
              {saveMessage ? (
                <>
                  <CheckCircle2 size={14} className="text-emerald-600" />
                  <span className="text-emerald-700">{saveMessage}</span>
                </>
              ) : footerStatus ? (
                <>
                  <CheckCircle2 size={14} className={canSave ? "text-emerald-600" : "text-amber-500"} />
                  <span>{footerStatus}</span>
                </>
              ) : (
                <>
                  <AlertCircle size={14} className="text-amber-500" />
                  <span>등록된 거래처·시공자 선택 및 현장·청구액 입력 필요</span>
                </>
              )}
            </div>
            <div className="erp-sale-form-footer-actions">
              {secondaryAction}
              <Button variant="outline" size="sm" className="h-8 rounded-lg text-xs" onClick={addWorkerLine}>
                <Plus size={13} />
                행 추가
              </Button>
              <Button size="sm" className="h-8 rounded-lg px-4 text-xs" onClick={onSave} disabled={!canSave}>
                <Save size={13} />
                {saveLabel}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {clientSiteUnlockPromptOpen ? (
        <div className="erp-ledger-modal-backdrop erp-ledger-modal-backdrop--elevated" onClick={() => setClientSiteUnlockPromptOpen(false)}>
          <div
            className="erp-ledger-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="sale-client-unlock-title"
          >
            <h2 id="sale-client-unlock-title" className="text-base font-bold text-slate-900 md:text-lg">
              거래처·현장 변경
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              거래처·현장을 변경하면 연결된 입금전표·미수금 집계에도 반영됩니다. 실수로 변경하지 않도록 주의해 주세요.
            </p>
            <p className="mt-4 text-sm font-semibold text-slate-700">거래처·현장 변경을 진행할까요?</p>
            <div className="mt-5 flex gap-2">
              <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setClientSiteUnlockPromptOpen(false)}>
                취소
              </Button>
              <Button
                className="flex-1 rounded-xl"
                onClick={() => {
                  setClientSiteUnlocked(true);
                  setClientSiteUnlockPromptOpen(false);
                }}
              >
                변경 진행
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function formatKRW(value) {
  return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 }).format(Number(value) || 0);
}

function formatCompactKRW(value) {
  const amount = Math.round(Number(value) || 0);
  if (amount === 0) return "-";
  if (amount >= 100000000) {
    const eok = amount / 100000000;
    return `${Number.isInteger(eok) ? eok : eok.toFixed(1).replace(/\.0$/, "")}\uC5B5`;
  }
  if (amount >= 10000) return `${Math.round(amount / 10000)}\uB9CC`;
  if (amount >= 1000) return `${Math.round(amount / 1000)}\uCC9C`;
  return String(amount);
}

function getSaleWorkerHeadcount(sale) {
  return getSaleStaffCount(sale);
}

function aggregateSaleCalendarStats(sale, feeMap) {
  const lines = getSaleWorkerLines(sale);
  let spend = 0;
  let fee = 0;
  let margin = 0;

  for (const line of lines) {
    const metrics = calculateWorkerLineMetrics(line, resolveWorkerFeeRate(line, feeMap));
    spend += metrics.spend;
    fee += Math.round(metrics.spend * metrics.feeRate);
    margin += metrics.margin;
  }

  return {
    staff: getSaleWorkerHeadcount(sale),
    bill: getSaleTotalBill(sale),
    spend,
    fee,
    netPay: spend - fee,
    margin,
    count: 1,
  };
}

const CALENDAR_CLIENT_COLORS = ["#0d9488", "#7c3aed", "#e11d48", "#ea580c", "#2563eb", "#db2777", "#059669", "#ca8a04"];

const EMPTY_CALENDAR_DAY_STATS = { staff: 0, bill: 0, spend: 0, fee: 0, netPay: 0, margin: 0, count: 0, paid: 0, unpaid: 0, hasUnpaid: false, entries: [] };

function getSalePaidAmount(sale, unpaid = getUnpaid(sale)) {
  const explicit = Number(sale.paid ?? sale.paidAmount);
  if (Number.isFinite(explicit) && explicit >= 0) return explicit;
  const amount = Number(sale.amount ?? sale.salesAmount ?? 0) || 0;
  return Math.max(0, amount - unpaid);
}

function getCalendarClientColor(client) {
  const name = String(client || "").trim() || "(미지정)";
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return CALENDAR_CLIENT_COLORS[hash % CALENDAR_CLIENT_COLORS.length];
}

function getCalendarPaymentBorderColor(hasUnpaid) {
  return hasUnpaid ? "#ef4444" : "#22c55e";
}

function getCalendarEntryBorderStyle(entry) {
  return { borderLeftColor: getCalendarPaymentBorderColor(entry.hasUnpaid) };
}

function normalizeCalendarClientName(client) {
  return String(client || "").trim() || "(미지정)";
}

function getCalendarDayPaymentTone(stats) {
  if (!stats?.count) return "";
  const unpaidCount = stats.entries.filter((entry) => entry.hasUnpaid).length;
  if (unpaidCount === 0) return "paid";
  if (unpaidCount === stats.entries.length) return "unpaid";
  return "mixed";
}

function isElementVisibleInContainer(element, container, padding = 2) {
  const entryRect = element.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  return entryRect.top >= containerRect.top - padding && entryRect.bottom <= containerRect.bottom + padding;
}

function isElementVisibleInViewport(element, topInset = 72, bottomInset = 24) {
  const rect = element.getBoundingClientRect();
  return rect.top >= topInset && rect.bottom <= window.innerHeight - bottomInset;
}

function scrollCalendarSpotlightEntryIntoView(entry) {
  const list = entry.closest(".erp-calendar-cell-entries");
  if (!list || isElementVisibleInContainer(entry, list)) return;
  entry.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function scrollCalendarSpotlightDateIntoView(grid, date) {
  if (!grid || !date) return;
  const cell = grid.querySelector(`[data-calendar-date="${date}"]`);
  if (!cell) return;

  cell.querySelectorAll(".erp-calendar-cell-entry.is-client-spotlight").forEach(scrollCalendarSpotlightEntryIntoView);

  if (!isElementVisibleInViewport(cell)) {
    cell.scrollIntoView({ block: "center", behavior: "smooth" });
  }
}

function scrollCalendarSpotlightIntoView(grid, anchorDate = null, orderedDates = []) {
  if (!grid) return;

  const dates = orderedDates.length
    ? orderedDates
    : [...grid.querySelectorAll(".erp-calendar-cell.is-client-spotlight-cell")]
        .map((cell) => cell.getAttribute("data-calendar-date"))
        .filter(Boolean);

  const primaryDate = anchorDate && dates.includes(anchorDate) ? anchorDate : dates[0];
  if (primaryDate) scrollCalendarSpotlightDateIntoView(grid, primaryDate);

  grid.querySelectorAll(".erp-calendar-cell-entry.is-client-spotlight").forEach((entry) => {
    window.setTimeout(() => scrollCalendarSpotlightEntryIntoView(entry), primaryDate ? 180 : 0);
  });

  window.setTimeout(() => {
    const offScreenDates = dates.filter((date) => {
      const cell = grid.querySelector(`[data-calendar-date="${date}"]`);
      return cell && !isElementVisibleInViewport(cell);
    });
    const nextDate = offScreenDates.find((date) => date !== primaryDate) || offScreenDates[0];
    if (nextDate && nextDate !== primaryDate) {
      scrollCalendarSpotlightDateIntoView(grid, nextDate);
    }
  }, primaryDate ? 320 : 120);
}

function formatCalendarDayLabel(date) {
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][parsed.getDay()];
  const [, monthText, dayText] = date.split("-");
  return `${Number(monthText)}월 ${Number(dayText)}일 (${weekday})`;
}

function buildCalendarClientSearchRows(sales, monthKey, feeMap) {
  const map = new Map();

  sales.forEach((sale) => {
    const clientName = normalizeClientCalendarName(sale.client);
    const date = String(sale.date || "").trim();
    if (!date) return;

    let row = map.get(clientName);
    if (!row) {
      row = {
        client: clientName,
        monthBill: 0,
        monthPaid: 0,
        monthUnpaid: 0,
        monthCount: 0,
        latestDate: "",
        firstDateInMonth: "",
      };
      map.set(clientName, row);
    }

    if (date > row.latestDate) row.latestDate = date;

    if (!date.startsWith(monthKey)) return;

    const stats = aggregateSaleCalendarStats(sale, feeMap);
    const unpaid = getUnpaid(sale);
    const paid = getSalePaidAmount(sale, unpaid);
    row.monthBill += stats.bill;
    row.monthPaid += paid;
    row.monthUnpaid += unpaid;
    row.monthCount += 1;
    if (!row.firstDateInMonth || date < row.firstDateInMonth) {
      row.firstDateInMonth = date;
    }
  });

  return Array.from(map.values()).sort((a, b) => a.client.localeCompare(b.client, "ko-KR"));
}

function getSaleVoucherSortValue(sale) {
  return parseVoucherSequence(getSaleVoucherLabel(sale)) ?? getSaleVoucherLabel(sale);
}

function buildCalendarDays(monthKey, sales, workers = []) {
  const [yearText, monthText] = monthKey.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const startOffset = firstDay.getDay();
  const daysInMonth = lastDay.getDate();
  const feeMap = buildWorkerFeeMap(workers);

  const statsByDate = sales.reduce((acc, sale) => {
    if (!String(sale.date || "").startsWith(monthKey)) return acc;
    const key = sale.date;
    if (!acc[key]) acc[key] = { ...EMPTY_CALENDAR_DAY_STATS, entries: [] };
    const dayStats = aggregateSaleCalendarStats(sale, feeMap);
    const unpaid = getUnpaid(sale);
    const paid = getSalePaidAmount(sale, unpaid);
    if (unpaid > 0) acc[key].hasUnpaid = true;
    acc[key].staff += dayStats.staff;
    acc[key].bill += dayStats.bill;
    acc[key].spend += dayStats.spend;
    acc[key].fee += dayStats.fee;
    acc[key].netPay += dayStats.netPay;
    acc[key].margin += dayStats.margin;
    acc[key].paid += paid;
    acc[key].unpaid += unpaid;
    acc[key].count += dayStats.count;
    acc[key].entries.push({
      saleId: sale.id,
      voucherSortValue: getSaleVoucherSortValue(sale),
      client: String(sale.client || "").trim() || "(미지정)",
      site: String(sale.site || sale.memo || "").trim() || "현장명 없음",
      staff: dayStats.staff,
      workerSummary: formatWorkerNameSummary(getSaleWorkerLines(sale)),
      bill: dayStats.bill,
      amount: Number(sale.amount ?? sale.salesAmount ?? dayStats.bill) || 0,
      paid,
      unpaid,
      hasUnpaid: unpaid > 0,
      color: getCalendarClientColor(sale.client),
    });
    return acc;
  }, {});

  Object.values(statsByDate).forEach((day) => {
    day.entries.sort((left, right) => compareSortValues(left.voucherSortValue, right.voucherSortValue, "asc"));
  });

  const cells = [];
  for (let i = 0; i < startOffset; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${monthKey}-${String(day).padStart(2, "0")}`;
    cells.push({ date, day, stats: statsByDate[date] || { ...EMPTY_CALENDAR_DAY_STATS } });
  }
  while (cells.length % 7 !== 0) cells.push(null);

  return { cells, monthLabel: `${year}년 ${month}월` };
}

function calculateWorkerLine(line) {
  return calculateWorkerLineAmounts(line);
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildSaleFromForm(form, currentUser = null, workers = []) {
  const feeMap = buildWorkerFeeMap(workers);
  const workerLines = (form.workers || [])
    .filter((line) => line.worker)
    .map((line) =>
      enrichWorkerLineWithMetrics(
        stripWorkerLineComputedMetrics(line),
        resolveWorkerFeeRate(line, feeMap)
      )
    );
  const amount = getSaleTotalBill({ workers: workerLines, amount: 0 });
  const workerNames = workerLines.map((line) => line.worker).filter(Boolean);
  const workerLabel = workerNames.join(", ");
  const now = new Date().toISOString();

  return {
    date: form.date,
    client: form.client,
    site: form.site,
    worker: workerLabel,
    workers: workerLines,
    amount,
    paid: Math.min(parseMoney(form.paid), amount),
    basePaid: Math.min(parseMoney(form.paid), amount),
    memo: String(form.memo ?? "").trim(),
    officeMemo: String(form.officeMemo ?? "").trim(),
    createdBy: currentUser?.name || form.createdBy || "-",
    createdByEmail: currentUser?.email || form.createdByEmail || "",
    createdAt: form.createdAt || now,
    updatedAt: now,
  };
}

function applyPaymentVouchers(sales, vouchers) {
  const copied = sales.map((row) => ({
    ...row,
    basePaid: row.basePaid ?? row.paid ?? 0,
    voucherPaid: 0,
    manualPaidCleared: row.manualPaidCleared || false,
  }));
  const clientCredits = {};

  const applyToRow = (row, amount) => {
    const unpaid = Math.max((row.amount || 0) - (row.basePaid || 0) - (row.voucherPaid || 0), 0);
    const applied = Math.min(unpaid, amount);
    row.voucherPaid += applied;
    return amount - applied;
  };

  vouchers.forEach((voucher) => {
    let remaining = parseMoney(voucher.amount);

    if (voucher.salesId) {
      const target = copied.find((row) => String(row.id) === String(voucher.salesId));
      if (target) remaining = applyToRow(target, remaining);
      if (remaining > 0) {
        clientCredits[voucher.client] = (clientCredits[voucher.client] || 0) + remaining;
      }
      return;
    }

    let scopedRows = copied.filter((row) => row.client === voucher.client && !row.manualPaidCleared);

    if (voucher.statementSalesIds?.length) {
      const idSet = new Set(voucher.statementSalesIds.map((id) => String(id)));
      scopedRows = scopedRows.filter((row) => idSet.has(String(row.id)));
    } else if (voucher.statementPeriodStart || voucher.statementPeriodEnd) {
      scopedRows = scopedRows.filter((row) => {
        const date = String(row.date || "");
        if (voucher.statementPeriodStart && date < voucher.statementPeriodStart) return false;
        if (voucher.statementPeriodEnd && date > voucher.statementPeriodEnd) return false;
        return true;
      });
    }

    scopedRows
      .sort((a, b) => a.date.localeCompare(b.date) || String(a.id).localeCompare(String(b.id)))
      .forEach((row) => {
        if (remaining <= 0) return;
        remaining = applyToRow(row, remaining);
      });

    if (remaining > 0) {
      clientCredits[voucher.client] = (clientCredits[voucher.client] || 0) + remaining;
    }
  });

  return {
    sales: copied.map((row) => ({ ...row, paid: Math.min((row.basePaid || 0) + (row.voucherPaid || 0), row.amount || 0), prepaidBalance: clientCredits[row.client] || 0 })),
    clientCredits,
  };
}

function runSelfTests() {
  const paid = { salesAmount: 1000, paidAmount: 1000 };
  const partial = { salesAmount: 1000, paidAmount: 400 };
  const unpaid = { salesAmount: 1000, paidAmount: 0 };
  console.assert(getUnpaid(partial) === 600, "getUnpaid should return remaining balance");
  console.assert(getStatus(paid) === "완료", "fully paid row should be 완료");
  console.assert(getStatus(partial) === "일부수금", "partially paid row should be 일부수금");
  console.assert(getStatus(unpaid) === "미수", "unpaid row should be 미수");
  console.assert(parseMoney("1,200,000원") === 1200000, "parseMoney should parse KRW text");
}
runSelfTests();

function Input(props) {
  const {
    className = "",
    lang,
    type,
    inputMode,
    value,
    onChange,
    onLiveValueChange,
    onCompositionStart,
    onCompositionEnd,
    onCompositionUpdate,
    ...rest
  } = props;
  if (type === "date") {
    const compact = className.includes("erp-input-compact");
    return (
      <KoreanDateInput
        className={className}
        value={value ?? ""}
        onChange={onChange}
        compact={compact}
        clearable={!compact}
        {...rest}
      />
    );
  }
  const isNumericField = type === "number" || inputMode === "numeric" || inputMode === "decimal";
  const composingRef = useRef(false);
  const [localValue, setLocalValue] = useState(value ?? "");

  useEffect(() => {
    if (!composingRef.current) setLocalValue(value ?? "");
  }, [value]);

  const emitLiveValue = (nextValue) => {
    onLiveValueChange?.(nextValue);
  };

  return (
    <input
      {...rest}
      type={type}
      inputMode={inputMode}
      value={localValue}
      lang={lang ?? (isNumericField ? undefined : "ko")}
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      spellCheck={false}
      onChange={(event) => {
        const nextValue = event.target.value;
        setLocalValue(nextValue);
        emitLiveValue(nextValue);
        if (!composingRef.current) onChange?.(event);
      }}
      onCompositionStart={(event) => {
        composingRef.current = true;
        erpInputComposing = true;
        onCompositionStart?.(event);
      }}
      onCompositionUpdate={(event) => {
        const nextValue = event.currentTarget.value;
        setLocalValue(nextValue);
        emitLiveValue(nextValue);
        onCompositionUpdate?.(event);
      }}
      onCompositionEnd={(event) => {
        composingRef.current = false;
        erpInputComposing = false;
        const nextValue = event.currentTarget.value;
        setLocalValue(nextValue);
        emitLiveValue(nextValue);
        onChange?.(event);
        onCompositionEnd?.(event);
      }}
      className={`erp-input w-full rounded-2xl border bg-white px-3 py-2.5 text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-slate-900 md:px-4 md:py-3 ${className}`}
    />
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="erp-text-caption mb-1 block font-semibold text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function SaleFormField({ label, icon: Icon, children, hint }) {
  return (
    <label className="erp-sale-form-field block">
      <span className="erp-sale-form-label">
        {Icon && (
          <span className="erp-sale-form-label-icon">
            <Icon size={14} />
          </span>
        )}
        {label}
      </span>
      {children}
      {hint && <span className="erp-sale-form-hint">{hint}</span>}
    </label>
  );
}

function SaleFormSectionHead({ icon: Icon, title, desc, badge }) {
  return (
    <div className="erp-sale-form-section-head">
      {Icon && (
        <div className="erp-sale-form-section-icon">
          <Icon size={18} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="erp-text-section">{title}</h2>
          {badge}
        </div>
        {desc && <p className="erp-text-caption mt-0.5 text-slate-500">{desc}</p>}
      </div>
    </div>
  );
}

const workerGridColumns = ["worker", "quantity", "unitCost", "chargeAmount", "meal", "lodging", "expense", "overtimeHours", "overtimeCost", "memo"];
const workerGridNumericColumns = new Set(["quantity", "unitCost", "chargeAmount", "meal", "lodging", "expense", "overtimeHours", "overtimeCost"]);
const workerGridIntegerColumns = new Set(["quantity"]);
const workerGridTextColumns = new Set(["worker", "memo"]);

let erpInputComposing = false;
let erpImeAnchor = null;

function ensureImeAnchor() {
  if (typeof document === "undefined") return null;
  if (erpImeAnchor?.isConnected) return erpImeAnchor;

  const anchor = document.createElement("input");
  anchor.type = "text";
  anchor.lang = "ko";
  anchor.autocomplete = "off";
  anchor.tabIndex = -1;
  anchor.setAttribute("aria-hidden", "true");
  anchor.style.cssText = "position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;";
  document.body.appendChild(anchor);
  erpImeAnchor = anchor;
  return anchor;
}

function filterWorkerSuggestions(workers, query, limit = 12) {
  return filterNamedSuggestions(filterActiveWorkers(workers), query, (worker) => String(worker.name || ""), limit);
}

function isImeActive(event) {
  return erpInputComposing || event.isComposing || event.key === "Process" || event.keyCode === 229;
}

function shouldNavigateWorkerGrid(event, columnKey) {
  if (isImeActive(event)) return false;

  const input = event.currentTarget;
  if (!(input instanceof HTMLInputElement)) return true;

  const textLen = input.value.length;
  const start = input.selectionStart ?? 0;
  const end = input.selectionEnd ?? 0;
  const isTextColumn = workerGridTextColumns.has(columnKey);

  if (event.key === "ArrowLeft") return start === 0 && end === 0;
  if (event.key === "ArrowRight") return start === textLen && end === textLen;
  if (event.key === "ArrowUp" || event.key === "ArrowDown") {
    if (isTextColumn) return textLen === 0 || (start === 0 && end === textLen);
    return true;
  }

  return false;
}

function focusWorkerGridCell(rowIndex, columnKey, { cursorAt = "end" } = {}) {
  if (typeof document === "undefined") return;
  const target = document.querySelector(`input[data-worker-row="${rowIndex}"][data-worker-col="${columnKey}"]`);
  if (!(target instanceof HTMLInputElement)) return;

  const applySelection = () => {
    if (document.activeElement !== target) return;

    const len = target.value.length;
    if (workerGridNumericColumns.has(columnKey)) {
      target.select();
      return;
    }

    if (cursorAt === "start") target.setSelectionRange(0, 0);
    else target.setSelectionRange(len, len);
  };

  const focusTarget = () => {
    if (workerGridTextColumns.has(columnKey)) {
      target.setAttribute("lang", "ko");
      target.removeAttribute("inputmode");
    }

    target.focus({ preventScroll: true });
    requestAnimationFrame(applySelection);
  };

  if (workerGridTextColumns.has(columnKey)) {
    const anchor = ensureImeAnchor();
    if (anchor) {
      anchor.focus({ preventScroll: true });
      requestAnimationFrame(() => {
        requestAnimationFrame(focusTarget);
      });
      return;
    }
  }

  focusTarget();
}

function focusSaleFormSiteField() {
  if (typeof document === "undefined") return;
  const target = document.querySelector('[data-sale-form-site="true"]');
  if (target instanceof HTMLInputElement) target.focus({ preventScroll: true });
}

function handleWorkerGridKeyDown(event, rowIndex, columnKey, rowCount) {
  if (!shouldNavigateWorkerGrid(event, columnKey)) return;

  const columnIndex = workerGridColumns.indexOf(columnKey);
  if (columnIndex === -1) return;

  let nextRow = rowIndex;
  let nextColumnIndex = columnIndex;
  let cursorAt = "end";

  if (event.key === "ArrowUp") nextRow = Math.max(0, rowIndex - 1);
  else if (event.key === "ArrowDown") nextRow = Math.min(rowCount - 1, rowIndex + 1);
  else if (event.key === "ArrowLeft") {
    nextColumnIndex = Math.max(0, columnIndex - 1);
    cursorAt = "end";
  } else if (event.key === "ArrowRight") {
    nextColumnIndex = Math.min(workerGridColumns.length - 1, columnIndex + 1);
    cursorAt = "start";
  } else return;

  event.preventDefault();
  focusWorkerGridCell(nextRow, workerGridColumns[nextColumnIndex], { cursorAt });
}

function WorkerGridColgroup() {
  return (
    <colgroup>
      <col className="erp-col-worker" />
      <col className="erp-col-qty" />
      <col className="erp-col-num" />
      <col className="erp-col-num" />
      <col className="erp-col-num" />
      <col className="erp-col-num" />
      <col className="erp-col-num" />
      <col className="erp-col-num" />
      <col className="erp-col-num" />
      <col className="erp-col-memo" />
      <col className="erp-col-action" />
    </colgroup>
  );
}

function MoneyInput({ className = "", value, onChange, ...rest }) {
  return (
    <Input
      {...rest}
      className={className}
      type="text"
      inputMode="numeric"
      value={formatMoneyInput(value)}
      onChange={(event) => {
        const sanitized = sanitizeMoneyInput(event.target.value);
        onChange?.({
          ...event,
          target: { ...event.target, value: sanitized },
          currentTarget: { ...event.currentTarget, value: sanitized },
        });
      }}
    />
  );
}

function WorkerGridInput({ rowIndex, columnKey, rowCount, className = "", value, onChange, ...props }) {
  const isNumeric = workerGridNumericColumns.has(columnKey);
  const displayValue = isNumeric ? formatMoneyInput(value) : value;

  const handleChange = (event) => {
    if (!isNumeric) {
      onChange?.(event);
      return;
    }

    let sanitized = sanitizeMoneyInput(event.target.value);
    if (workerGridIntegerColumns.has(columnKey)) {
      sanitized = sanitized.replace(/[^\d]/g, "");
    }

    onChange?.({
      ...event,
      target: { ...event.target, value: sanitized },
      currentTarget: { ...event.currentTarget, value: sanitized },
    });
  };

  return (
    <Input
      {...props}
      type="text"
      value={displayValue}
      onChange={handleChange}
      data-worker-row={rowIndex}
      data-worker-col={columnKey}
      className={`erp-grid-input ${isNumeric ? "erp-grid-input--num" : ""} ${className}`.trim()}
      inputMode={columnKey === "overtimeHours" ? "decimal" : isNumeric ? "numeric" : undefined}
      onKeyDown={(event) => {
        props.onKeyDown?.(event);
        if (event.defaultPrevented) return;
        if (rowIndex != null && columnKey) handleWorkerGridKeyDown(event, rowIndex, columnKey, rowCount);
      }}
    />
  );
}

function WorkerGridWorkerInput({ rowIndex, rowCount, workers, value, onChange, placeholder = "시공자명", onFocus, onBlur, ...props }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [filterQuery, setFilterQuery] = useState(value ?? "");
  const suggestions = useMemo(() => filterWorkerSuggestions(workers, filterQuery), [workers, filterQuery]);
  const canPick = menuOpen && suggestions.length > 0 && filterQuery.trim().length > 0;

  useEffect(() => {
    setFilterQuery(value ?? "");
  }, [value]);

  const syncFilterQuery = (nextQuery) => {
    setFilterQuery(nextQuery);
    if (String(nextQuery || "").trim()) setMenuOpen(true);
    setHighlightIndex(0);
  };

  const pickWorker = (worker) => {
    if (!worker) return;
    onChange(worker.name);
    setHighlightIndex(0);
    setMenuOpen(false);
  };

  return (
    <div className="relative">
      <WorkerGridInput
        {...props}
        rowIndex={rowIndex}
        columnKey="worker"
        rowCount={rowCount}
        value={value}
        lang="ko"
        placeholder={placeholder}
        className="erp-grid-worker-input"
        onLiveValueChange={syncFilterQuery}
        onChange={(event) => {
          onChange(event.target.value);
          syncFilterQuery(event.target.value);
        }}
        onFocus={(event) => {
          event.currentTarget.setAttribute("lang", "ko");
          event.currentTarget.removeAttribute("inputmode");
          if (String(value ?? "").length > 0) setMenuOpen(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setTimeout(() => setMenuOpen(false), 150);
          const trimmed = String(value ?? "").trim();
          if (trimmed && !findActiveWorkerByName(workers, trimmed)) {
            onChange("");
            syncFilterQuery("");
          }
          onBlur?.(event);
        }}
        onKeyDown={(event) => {
          if (isImeActive(event)) return;

          if (canPick && event.key === "ArrowDown") {
            event.preventDefault();
            setHighlightIndex((prev) => (prev + 1) % suggestions.length);
            return;
          }

          if (canPick && event.key === "ArrowUp") {
            event.preventDefault();
            setHighlightIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
            return;
          }

          if (canPick && event.key === "Enter") {
            event.preventDefault();
            pickWorker(suggestions[highlightIndex] ?? suggestions[0]);
            return;
          }

          if (canPick && event.key === "Tab") {
            pickWorker(suggestions[highlightIndex] ?? suggestions[0]);
          }

          props.onKeyDown?.(event);
        }}
      />

      {canPick && (
        <div className="erp-autocomplete-menu erp-autocomplete-menu--compact absolute z-50 min-w-[10rem] w-max max-w-[16rem] overflow-y-auto border bg-white">
          {suggestions.map((worker, index) => (
            <button
              key={String(worker.id ?? worker.name)}
              type="button"
              className={`erp-autocomplete-option erp-autocomplete-option--inline w-full border-b text-left hover:bg-slate-50 ${highlightIndex === index ? "bg-slate-50" : ""}`}
              onMouseEnter={() => setHighlightIndex(index)}
              onMouseDown={(event) => {
                event.preventDefault();
                pickWorker(worker);
              }}
            >
              <div className="erp-autocomplete-option-label">{worker.name}</div>
              <div className="erp-autocomplete-option-sub">
                {`${worker.phone || "연락처 없음"} · ${formatKRW(worker.constructionCost || 0)}`}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const VAT_TYPE_OPTIONS = [
  { label: "포함", value: "included" },
  { label: "별도", value: "excluded" },
];

const YES_NO_OPTIONS = [
  { label: "Y", value: "Y" },
  { label: "N", value: "N" },
];

const WORKER_CATEGORY_OPTIONS = ["팀원", "외주"];
const WORKER_GRADE_OPTIONS = ["S", "A", "B", "C", "D"];

function normalizeWorkerGrade(value) {
  const grade = String(value || "").trim().toUpperCase();
  return WORKER_GRADE_OPTIONS.includes(grade) ? grade : "";
}

function normalizeWorkerCategory(value) {
  return String(value || "").trim() === "외주" ? "외주" : "팀원";
}

function workerCategorySortRank(value) {
  return normalizeWorkerCategory(value) === "외주" ? 1 : 0;
}

function workerActiveSortRank(worker) {
  return worker?.isActive === false ? 1 : 0;
}

function workerGradeSortRank(value) {
  const grade = normalizeWorkerGrade(value);
  const index = WORKER_GRADE_OPTIONS.indexOf(grade);
  return index === -1 ? WORKER_GRADE_OPTIONS.length : index;
}

type WorkerListSortColumn = "name" | "grade" | "category";

function compareWorkersDefault(a, b) {
  const activeDiff = workerActiveSortRank(a) - workerActiveSortRank(b);
  if (activeDiff !== 0) return activeDiff;
  const rankDiff = workerCategorySortRank(a.category) - workerCategorySortRank(b.category);
  if (rankDiff !== 0) return rankDiff;
  return String(a.name || "").localeCompare(String(b.name || ""), "ko");
}

function compareWorkersByColumn(a, b, column: WorkerListSortColumn, direction: SortDirection) {
  const dir = direction === "asc" ? 1 : -1;
  let cmp = 0;
  if (column === "name") {
    cmp = String(a.name || "").localeCompare(String(b.name || ""), "ko");
  } else if (column === "grade") {
    cmp = workerGradeSortRank(a.grade) - workerGradeSortRank(b.grade);
  } else {
    cmp = workerCategorySortRank(a.category) - workerCategorySortRank(b.category);
  }
  if (cmp !== 0) return cmp * dir;
  return compareWorkersDefault(a, b);
}

function isWorkerActive(worker) {
  return worker?.isActive !== false;
}

function filterActiveWorkers(workers = []) {
  return workers.filter((worker) => isWorkerActive(worker));
}

function findActiveWorkerByName(workers, name) {
  const trimmed = String(name || "").trim();
  if (!trimmed) return undefined;
  return workers.find((worker) => worker.name === trimmed && isWorkerActive(worker));
}

function getInactiveWorkerNamesInForm(form, workers) {
  const inactiveNames = new Set(
    workers
      .filter((worker) => !isWorkerActive(worker))
      .map((worker) => String(worker.name || "").trim())
      .filter(Boolean)
  );
  return [...new Set(
    (form.workers || [])
      .map((line) => String(line.worker || "").trim())
      .filter((name) => name && inactiveNames.has(name))
  )];
}

function findRegisteredClientByName(clients, name) {
  const trimmed = String(name || "").trim();
  if (!trimmed) return undefined;
  return clients.find((client) => client.name === trimmed);
}

function getUnknownWorkerNamesInForm(form, workers) {
  const knownNames = new Set(
    workers
      .map((worker) => String(worker.name || "").trim())
      .filter(Boolean)
  );
  return [...new Set(
    (form.workers || [])
      .map((line) => String(line.worker || "").trim())
      .filter((name) => name && !knownNames.has(name))
  )];
}

function validateSaleFormMasterRefs(form, clients, workers) {
  const clientName = String(form.client || "").trim();
  if (clientName && !findRegisteredClientByName(clients, clientName)) {
    return "등록된 거래처만 선택할 수 있습니다.";
  }

  const inactiveWorkers = getInactiveWorkerNamesInForm(form, workers);
  if (inactiveWorkers.length > 0) {
    return `비활성 시공자는 매출등록에 사용할 수 없습니다: ${inactiveWorkers.join(", ")}`;
  }

  const unknownWorkers = getUnknownWorkerNamesInForm(form, workers);
  if (unknownWorkers.length > 0) {
    return `등록된 시공자만 선택할 수 있습니다: ${unknownWorkers.join(", ")}`;
  }

  const hasRegisteredActiveWorker = (form.workers || []).some((line) => findActiveWorkerByName(workers, line.worker));
  if (!hasRegisteredActiveWorker) {
    return "등록된 활성 시공자를 한 명 이상 선택해 주세요.";
  }

  return "";
}

function isSaleFormMasterRefsValid(form, clients, workers) {
  return validateSaleFormMasterRefs(form, clients, workers) === "";
}

function syncLinkedPaymentVouchersForSale(vouchers, saleId, next: { client: string; site: string }) {
  if (!Array.isArray(vouchers)) return vouchers;
  const saleKey = String(saleId);
  let changed = false;
  const nextVouchers = vouchers.map((voucher) => {
    if (String(voucher.salesId ?? "") !== saleKey) return voucher;
    if (voucher.client === next.client && voucher.site === next.site) return voucher;
    changed = true;
    return { ...voucher, client: next.client, site: next.site };
  });
  return changed ? nextVouchers : vouchers;
}

function SummaryCard({ title, value, sub, tone = "default", icon: Icon, compact = false }) {
  const toneClass = tone === "danger" ? "text-red-600" : tone === "success" ? "text-emerald-600" : "text-slate-900";
  return (
    <Card className={`erp-summary-card ${compact ? "erp-summary-card--compact" : ""} rounded-2xl shadow-sm`}>
      <CardContent className={compact ? "p-2.5 md:p-3" : "p-4 md:p-5"}>
        <div className="flex items-start justify-between gap-2 md:gap-3">
          <div className="min-w-0 flex-1">
            <div className="erp-text-caption font-semibold text-slate-500">{title}</div>
            <div className={`erp-text-stat ${compact ? "mt-1" : "mt-1.5 md:mt-2"} ${toneClass}`}>{value}</div>
            <div className={`erp-text-caption ${compact ? "mt-0.5" : "mt-1"} text-slate-400`}>{sub}</div>
          </div>
          {Icon && (
            <div className={`hidden shrink-0 rounded-xl bg-slate-100 text-slate-700 xl:block ${compact ? "p-1.5" : "rounded-2xl p-2.5 md:p-3"}`}>
              <Icon size={compact ? 16 : 20} />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

const BRAND_LOGO_SRC = "/team-millimeter-login-logo.jpg";

function LoginScreen({ onLogin }) {
  const [rememberLoginId, setRememberLoginId] = useState(loadRememberLoginIdEnabled);
  const [loginId, setLoginId] = useState(loadRememberedLoginId);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const apiMode = isApiModeEnabled();

  const submitLogin = async () => {
    const trimmedLoginId = loginId.trim();
    if (!trimmedLoginId) {
      setError("로그인 ID를 입력해 주세요.");
      return;
    }
    if (!password) {
      setError("비밀번호를 입력해 주세요.");
      return;
    }
    if (!/^[a-zA-Z0-9]+$/.test(trimmedLoginId)) {
      setError("로그인 ID는 영문과 숫자만 사용할 수 있습니다.");
      return;
    }
    if (apiMode) {
      setLoading(true);
      setError("");
      try {
        const { user, erpVersion } = await loginWithApi(trimmedLoginId, password);
        persistRememberedLoginId(trimmedLoginId, rememberLoginId);
        onLogin(user, erpVersion);
      } catch (err) {
        setError(err instanceof Error ? err.message : "로그인에 실패했습니다.");
      } finally {
        setLoading(false);
      }
      return;
    }
    if (trimmedLoginId === "admin" && password === "1234") {
      setError("");
      persistRememberedLoginId(trimmedLoginId, rememberLoginId);
      onLogin({ id: 0, name: "관리자", loginId: "admin", role: "admin" });
      return;
    }
    setError("로그인 ID 또는 비밀번호가 맞지 않습니다.");
  };

  return (
    <div className="erp-login-page min-h-screen p-4 text-white sm:p-6" lang="ko">
      <div className="erp-login-page__glow" aria-hidden="true" />
      <div className="erp-login-page__inner mx-auto grid min-h-[calc(100vh-32px)] max-w-6xl grid-cols-1 items-center gap-8 lg:min-h-[calc(100vh-48px)] lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-12">
        <div className="erp-login-page__hero">
          <div className="erp-login-hero-logo-wrap">
            <img src={BRAND_LOGO_SRC} alt="TEAM MILLIMETER" className="erp-login-hero-logo" />
          </div>
          <p className="erp-login-hero-kicker">ORDER MADE FURNITURE · INSTALL TEAM</p>
          <h1 className="erp-login-hero-title">팀밀리미터 업무를 한 곳에서 관리하세요.</h1>
          <p className="erp-login-hero-desc">
            매출등록, 거래처 미수, 시공자 관리, 보고서를 하나의 ERP 화면에서 확인합니다.
          </p>
        </div>
        <Card className="erp-login-card rounded-3xl border-0 bg-white text-slate-900 shadow-2xl">
          <CardContent className="p-6 sm:p-8">
            <div className="erp-login-card-head mb-7 text-center">
              <img src={BRAND_LOGO_SRC} alt="" className="erp-login-card-logo mx-auto" aria-hidden="true" />
              <h2 className="erp-text-section font-black">로그인</h2>
              <p className="erp-text-body mt-2 text-slate-500">ERP에 접속하려면 계정 정보를 입력하세요.</p>
            </div>
            <div className="space-y-4">
              <Field label="로그인 ID">
                <Input
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value.replace(/[^a-zA-Z0-9]/g, ""))}
                  placeholder="로그인 ID"
                  autoComplete="username"
                  className="rounded-2xl"
                />
                <span className="erp-text-caption mt-1 block text-slate-400">영문과 숫자만 사용 (예: admin)</span>
              </Field>
              <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600">
                <input
                  type="checkbox"
                  checked={rememberLoginId}
                  onChange={(e) => setRememberLoginId(e.target.checked)}
                />
                로그인 ID 저장
              </label>
              <Field label="비밀번호">
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="비밀번호"
                  autoComplete="current-password"
                  className="rounded-2xl"
                  onKeyDown={(e) => e.key === "Enter" && !loading && submitLogin()}
                />
              </Field>
              {error && <div className="erp-text-body rounded-2xl bg-red-50 px-4 py-3 font-semibold text-red-600">{error}</div>}
              <Button className="erp-login-submit erp-text-body w-full rounded-2xl py-5 font-bold md:py-6" onClick={submitLogin} disabled={loading}>
                {loading ? "로그인 중..." : "로그인"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

const PAGE_ICONS: Record<ErpPageKey, typeof Home> = {
  dashboard: Home,
  calendar: CalendarDays,
  attendance: Clock,
  salesInput: Plus,
  sales: FileSpreadsheet,
  salesVoucherSearch: Search,
  receivables: CreditCard,
  workerPayments: WalletCards,
  reports: BarChart3,
  statements: Download,
  pdfArchive: Archive,
  clients: Building2,
  workers: Users,
  accounting: Landmark,
  companyNotices: Megaphone,
  companyProfile: Landmark,
  auditLog: History,
  usersAdmin: UserCog,
  loginHistory: LogIn,
};

function Sidebar({
  active,
  setActive,
  currentUser,
  sidebarOrder,
  onLogout,
  onOpenMyAccount,
  onOpenMenuOrder,
  mobileOpen,
  onMobileClose,
  syncStatus,
}) {
  const items = sortPageDefsByOrder(getAccessiblePageDefs(currentUser), sidebarOrder).map((page) => [
    page.key,
    page.label,
    PAGE_ICONS[page.key],
  ]);

  const navigate = (key) => {
    setActive(key);
    onMobileClose?.();
  };

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          aria-label="메뉴 닫기"
          className="fixed inset-0 z-40 bg-slate-950/50 lg:hidden"
          onClick={onMobileClose}
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[min(18rem,88vw)] shrink-0 flex-col bg-slate-950 p-4 text-white transition-transform duration-200 sm:p-5 lg:static lg:z-auto lg:min-h-screen lg:w-64 lg:translate-x-0 xl:w-72 ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
      >
      <div className="mb-6 flex items-start justify-between gap-3 lg:mb-8">
        <div className="erp-sidebar-brand min-w-0">
          <div className="erp-sidebar-logo-wrap">
            <img
              src={BRAND_LOGO_SRC}
              alt="TEAM MILLIMETER"
              className="erp-sidebar-logo"
            />
          </div>
          <div className="erp-text-caption mt-2 text-slate-400">Web ERP</div>
        </div>
        <button type="button" className="rounded-xl p-2 text-slate-300 hover:bg-slate-800 lg:hidden" onClick={onMobileClose} aria-label="메뉴 닫기">
          <X size={20} />
        </button>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto lg:space-y-2">
        <button
          type="button"
          className="erp-sidebar-menu-order-btn erp-text-caption mb-2 flex min-h-[40px] w-full items-center justify-center gap-2 rounded-2xl border border-slate-700 px-3 py-2 font-semibold text-slate-300 transition hover:border-slate-500 hover:bg-slate-800 hover:text-white"
          onClick={onOpenMenuOrder}
        >
          <ListOrdered size={16} />
          메뉴 순서
        </button>
        {items.map(([key, label, Icon]) => (
          <button key={key} onClick={() => navigate(key)} className={`erp-touch-target erp-text-body flex min-h-[44px] w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left font-semibold transition lg:px-4 lg:py-3 ${active === key ? "bg-white text-slate-950" : "text-slate-300 hover:bg-slate-800"}`}>
            <Icon size={18} /> {label}
          </button>
        ))}
      </nav>
      <div className="mt-4 shrink-0 rounded-2xl bg-slate-900 p-3 lg:mt-auto lg:p-4">
        <button
          type="button"
          className="erp-sidebar-account-btn w-full rounded-xl px-2 py-2 text-left transition hover:bg-slate-800"
          onClick={onOpenMyAccount}
        >
          <div className="erp-text-body font-bold">{currentUser.name}</div>
          <div className="erp-text-caption mt-1 text-slate-400">{currentUser.loginId || currentUser.email || ""}</div>
          <div className="erp-text-caption mt-1 text-slate-500">내 계정</div>
        </button>
        {syncStatus && <div className="erp-text-caption mt-2 text-emerald-400">{syncStatus}</div>}
        <button type="button" className="erp-sidebar-footer-btn erp-text-body mt-4" onClick={onLogout}>
          <LogOut size={16} /> 로그아웃
        </button>
      </div>
    </aside>
    </>
  );
}

function DashboardAnnualLineChart({ months }) {
  const lineColor = "#0f172a";
  const getValue = (row) => row.bill;

  const width = 960;
  const height = 280;
  const padding = { top: 18, right: 20, bottom: 34, left: 54 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const maxValue = Math.max(
    1,
    ...months.map((row) => Number(getValue(row)) || 0).filter((value) => value > 0)
  );

  const xStep = months.length > 1 ? plotWidth / (months.length - 1) : 0;
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({
    ratio,
    value: Math.round(maxValue * ratio),
    y: padding.top + plotHeight - ratio * plotHeight,
  }));

  const lineSegments = [];
  let currentSegment = [];

  months.forEach((row, index) => {
    const value = Math.max(Number(getValue(row)) || 0, 0);
    if (value <= 0) {
      if (currentSegment.length) {
        lineSegments.push(currentSegment);
        currentSegment = [];
      }
      return;
    }

    const x = padding.left + index * xStep;
    const y = padding.top + plotHeight - (value / maxValue) * plotHeight;
    currentSegment.push({ x, y, value, label: row.label, monthKey: row.monthKey });
  });

  if (currentSegment.length) lineSegments.push(currentSegment);

  const buildSegmentPath = (segment) =>
    segment
      .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
      .join(" ");

  const salesPoints = lineSegments.flat();

  return (
    <div className="erp-dashboard-annual-line-chart" aria-label="월별 매출 라인 그래프">
      <div className="erp-dashboard-annual-chart-legend">
        <span><i className="is-bill" />총매출</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="erp-dashboard-annual-line-svg" role="img">
        {yTicks.map((tick) => (
          <g key={tick.ratio}>
            <line x1={padding.left} y1={tick.y} x2={width - padding.right} y2={tick.y} className="erp-dashboard-annual-line-grid" />
            <text x={padding.left - 8} y={tick.y + 4} className="erp-dashboard-annual-line-y-label" textAnchor="end">
              {formatCompactKRW(tick.value)}
            </text>
          </g>
        ))}
        {lineSegments.map((segment, segmentIndex) => (
          segment.length > 1 ? (
            <path
              key={`segment-${segmentIndex}`}
              d={buildSegmentPath(segment)}
              className="erp-dashboard-annual-line-path"
              stroke={lineColor}
              fill="none"
            />
          ) : null
        ))}
        {salesPoints.map((point) => (
          <circle
            key={point.monthKey}
            cx={point.x}
            cy={point.y}
            r={4}
            className="erp-dashboard-annual-line-dot"
            fill={lineColor}
          >
            <title>{`${point.label} 총매출 ${formatKRW(point.value)}`}</title>
          </circle>
        ))}
        {months.map((row, index) => (
          <text
            key={row.monthKey}
            x={padding.left + index * xStep}
            y={height - 10}
            className="erp-dashboard-annual-line-x-label"
            textAnchor="middle"
          >
            {row.label}
          </text>
        ))}
      </svg>
    </div>
  );
}

function DashboardAnnualChart({ months, maxBill }) {
  const safeMax = Math.max(maxBill, 1);

  const barHeight = (value) => {
    if (!value) return 0;
    return Math.max((value / safeMax) * 100, 18);
  };

  const renderBar = (value, tone) => (
    <div className="erp-dashboard-annual-bar-wrap">
      <div
        className={`erp-dashboard-annual-bar is-${tone}${value > 0 ? " has-value" : ""}`}
        style={{ height: value > 0 ? `${barHeight(value)}%` : "0" }}
      >
        {value > 0 ? <span className="erp-dashboard-annual-bar-value">{formatCompactKRW(value)}</span> : null}
      </div>
    </div>
  );

  return (
    <div className="erp-dashboard-annual-chart" aria-label="월별 매출 그래프">
      <div className="erp-dashboard-annual-chart-legend">
        <span><i className="is-bill" />총매출</span>
        <span><i className="is-margin" />마진</span>
        <span><i className="is-paid" />입금</span>
        <span><i className="is-vat" />부가세</span>
      </div>
      <div className="erp-dashboard-annual-chart-grid">
        {months.map((row) => (
          <div key={row.monthKey} className="erp-dashboard-annual-chart-col">
            <div
              className="erp-dashboard-annual-chart-bars"
              title={`${row.label} · 매출 ${formatKRW(row.bill)} · 마진 ${formatKRW(row.margin)} · 입금 ${formatKRW(row.paid)} · 부가세 ${formatKRW(row.vat)}`}
            >
              {renderBar(row.bill, "bill")}
              {renderBar(row.margin, "margin")}
              {renderBar(row.paid, "paid")}
              {renderBar(row.vat, "vat")}
            </div>
            <span className="erp-dashboard-annual-chart-label">{row.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DashboardSalesRankingChart({ title, rows, tone = "bill", limit = 12, emptyLabel = "매출 데이터가 없습니다." }) {
  const visibleRows = useMemo(
    () => rows.filter((row) => row.bill > 0).slice(0, limit),
    [rows, limit]
  );
  const maxBill = useMemo(() => Math.max(...visibleRows.map((row) => row.bill), 1), [visibleRows]);

  if (!visibleRows.length) {
    return <p className="erp-text-body py-8 text-center text-slate-500">{emptyLabel}</p>;
  }

  return (
    <div className="erp-dashboard-ranking-chart" aria-label={title}>
      {visibleRows.map((row) => (
        <div
          key={row.key}
          className="erp-dashboard-ranking-row"
          title={`${row.label} · 매출 ${formatKRW(row.bill)}`}
        >
          <span className="erp-dashboard-ranking-label" title={row.label}>{row.label}</span>
          <div className="erp-dashboard-ranking-bar-track">
            <div
              className={`erp-dashboard-ranking-bar-fill is-${tone}`}
              style={{ width: `${Math.max((row.bill / maxBill) * 100, row.bill > 0 ? 6 : 0)}%` }}
            />
          </div>
          <span className="erp-dashboard-ranking-value">{formatCompactKRW(row.bill)}</span>
        </div>
      ))}
    </div>
  );
}

function Dashboard({ sales, paymentVouchers = [], workers = [] }) {
  const yearOptions = useMemo(() => listDashboardYears(sales), [sales]);
  const [year, setYear] = useState(() => yearOptions[0] || new Date().getFullYear());

  useEffect(() => {
    if (!yearOptions.includes(year)) setYear(yearOptions[0] || new Date().getFullYear());
  }, [year, yearOptions]);

  const annualReport = useMemo(
    () => buildAnnualMonthlyDashboard(sales, paymentVouchers, year, workers),
    [sales, paymentVouchers, year, workers]
  );

  const { months, totals } = annualReport;
  const maxBill = useMemo(() => Math.max(...months.map((row) => row.bill), 0), [months]);
  const totalReceived = totals.paid + totals.vat;
  const yearLabel = `${year}년`;
  const countLabel = `${totals.voucherCount}전표 · ${yearLabel}`;
  const yearDateFilter = useMemo(() => ({ startDate: `${year}-01-01`, endDate: `${year}-12-31` }), [year]);
  const salesPivotContext = useMemo(() => ({ workerFeeRates: buildWorkerFeeMap(workers) }), [workers]);
  const clientRanking = useMemo(
    () => buildClientPivotReport(sales, yearDateFilter, salesPivotContext).rows,
    [sales, yearDateFilter, salesPivotContext]
  );
  const workerRanking = useMemo(
    () => buildWorkerPivotReport(sales, yearDateFilter, salesPivotContext).rows,
    [sales, yearDateFilter, salesPivotContext]
  );

  const shiftYear = (delta) => {
    const index = yearOptions.indexOf(year);
    const nextIndex = index + delta;
    if (nextIndex >= 0 && nextIndex < yearOptions.length) setYear(yearOptions[nextIndex]);
  };

  return (
    <div className="erp-page">
      <PageTitle
        title="대시보드"
        desc={`${yearLabel} 월별 연매출 · 총매출 · 마진 · 입금 · 부가세`}
        action={(
          <div className="erp-dashboard-year-nav flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="erp-touch-target rounded-xl"
              disabled={yearOptions.indexOf(year) >= yearOptions.length - 1}
              onClick={() => shiftYear(1)}
              aria-label="이전 연도"
            >
              <ChevronLeft size={16} />
            </Button>
            <select
              className="erp-input erp-dashboard-year-select rounded-xl px-3 py-2 text-sm font-semibold"
              value={year}
              onChange={(event) => setYear(Number(event.target.value))}
            >
              {yearOptions.map((optionYear) => (
                <option key={optionYear} value={optionYear}>{optionYear}년</option>
              ))}
            </select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="erp-touch-target rounded-xl"
              disabled={yearOptions.indexOf(year) <= 0}
              onClick={() => shiftYear(-1)}
              aria-label="다음 연도"
            >
              <ChevronRight size={16} />
            </Button>
          </div>
        )}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 xl:grid-cols-4">
        <SummaryCard title="연간 총매출" value={formatKRW(totals.bill)} sub={countLabel} icon={WalletCards} />
        <SummaryCard
          title="연간 마진"
          value={formatKRW(totals.margin)}
          sub={`마진율 ${formatMarginRate(totals.margin, totals.bill)} · ${yearLabel}`}
          tone={totals.margin >= 0 ? "success" : "danger"}
          icon={BarChart3}
        />
        <SummaryCard title="연간 입금" value={formatKRW(totals.paid)} sub={`공급가액 · ${yearLabel}`} tone="success" icon={CreditCard} />
        <SummaryCard
          title="연간 부가세"
          value={formatKRW(totals.vat)}
          sub={totalReceived > 0 ? `총입금 ${formatKRW(totalReceived)} · ${yearLabel}` : `${yearLabel} · 부가세 없음`}
          tone={totals.vat > 0 ? "warning" : "default"}
          icon={CreditCard}
        />
      </div>

      <Card className="erp-dashboard-annual-card rounded-2xl shadow-sm">
        <CardContent className="p-4 md:p-5">
          <div className="mb-4 flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
            <h2 className="erp-text-section">{yearLabel} 월별 매출 추이</h2>
            <span className="erp-text-caption text-slate-500">총매출 라인 · 1~12월 추이</span>
          </div>
          <DashboardAnnualLineChart months={months} />
        </CardContent>
      </Card>

      <Card className="erp-dashboard-annual-card rounded-2xl shadow-sm">
        <CardContent className="p-4 md:p-5">
          <div className="mb-4 flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
            <h2 className="erp-text-section">{yearLabel} 월별 그래프</h2>
            <span className="erp-text-caption text-slate-500">매출 전표 일자 기준 · 입금·부가세는 연결된 입금내역 합계</span>
          </div>
          <DashboardAnnualChart months={months} maxBill={maxBill} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="erp-dashboard-annual-card rounded-2xl shadow-sm">
          <CardContent className="p-4 md:p-5">
            <div className="mb-4 flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
              <h2 className="erp-text-section">{yearLabel} 거래처별 매출</h2>
              <span className="erp-text-caption text-slate-500">매출 상위 · 전표 총매출 기준</span>
            </div>
            <DashboardSalesRankingChart
              title={`${yearLabel} 거래처별 매출`}
              rows={clientRanking}
              tone="client"
              emptyLabel={`${yearLabel} 거래처 매출이 없습니다.`}
            />
          </CardContent>
        </Card>
        <Card className="erp-dashboard-annual-card rounded-2xl shadow-sm">
          <CardContent className="p-4 md:p-5">
            <div className="mb-4 flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
              <h2 className="erp-text-section">{yearLabel} 시공자별 매출</h2>
              <span className="erp-text-caption text-slate-500">매출 상위 · 시공자별 청구 합계</span>
            </div>
            <DashboardSalesRankingChart
              title={`${yearLabel} 시공자별 매출`}
              rows={workerRanking}
              tone="worker"
              emptyLabel={`${yearLabel} 시공자 매출이 없습니다.`}
            />
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-4 md:p-5">
          <div className="mb-3 flex flex-col gap-1 md:mb-4 md:flex-row md:items-center md:justify-between">
            <h2 className="erp-text-section">{yearLabel} 월별 표</h2>
            <span className="erp-text-caption text-slate-500">1~12월 · 연간 합계 · 월평균매출(연간 총매출 ÷ 매출 있는 달)</span>
          </div>
          <TableExportSection fileName={`대시보드_${year}_월별`} title={`${yearLabel} 월별 연매출`}>
            <div className="erp-table-wrap">
              <table className="erp-table erp-dashboard-annual-table w-full">
                <thead className="bg-slate-100 text-slate-600">
                  <tr>
                    <th className="text-left">월</th>
                    <th className="text-right">총매출</th>
                    <th className="text-right">월평균매출</th>
                    <th className="text-right">마진</th>
                    <th className="text-right">마진율</th>
                    <th className="text-right">입금</th>
                    <th className="text-right">부가세</th>
                    <th className="text-right">총입금</th>
                    <th className="text-right">전표</th>
                  </tr>
                </thead>
                <tbody>
                  {months.map((row) => (
                    <tr key={row.monthKey} className="border-t">
                      <td className="font-semibold text-left">{row.label}</td>
                      <td className="text-right font-medium">{formatKRW(row.bill)}</td>
                      <td className="text-right text-slate-400">-</td>
                      <td className={`text-right font-medium ${row.margin >= 0 ? "text-emerald-600" : "text-red-600"}`}>{formatKRW(row.margin)}</td>
                      <td className="text-right text-slate-600">{formatMarginRate(row.margin, row.bill)}</td>
                      <td className="text-right text-slate-600">{formatKRW(row.paid)}</td>
                      <td className="text-right text-slate-600">{formatKRW(row.vat)}</td>
                      <td className="text-right font-medium">{formatKRW(row.paid + row.vat)}</td>
                      <td className="text-right text-slate-500">{row.voucherCount}</td>
                    </tr>
                  ))}
                  <tr className="erp-dashboard-annual-total border-t bg-slate-50 font-bold">
                    <td className="text-left">연간 합계</td>
                    <td className="text-right">{formatKRW(totals.bill)}</td>
                    <td className="text-right text-indigo-700">{formatKRW(totals.avgBill)}</td>
                    <td className={`text-right ${totals.margin >= 0 ? "text-emerald-700" : "text-red-700"}`}>{formatKRW(totals.margin)}</td>
                    <td className="text-right">{formatMarginRate(totals.margin, totals.bill)}</td>
                    <td className="text-right">{formatKRW(totals.paid)}</td>
                    <td className="text-right">{formatKRW(totals.vat)}</td>
                    <td className="text-right">{formatKRW(totalReceived)}</td>
                    <td className="text-right">{totals.voucherCount}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </TableExportSection>
        </CardContent>
      </Card>
    </div>
  );
}

type CalendarDaySortColumn = "voucher" | "client" | "site" | "worker" | "bill" | "paid" | "unpaid" | "status";

function getCalendarDaySortValue(sale, column: CalendarDaySortColumn) {
  switch (column) {
    case "voucher":
      return getSaleVoucherSortValue(sale);
    case "client":
      return sale.client;
    case "site":
      return sale.site;
    case "worker":
      return sale.worker;
    case "bill":
      return getSaleTotalBill(sale);
    case "paid":
      return Number(sale.paid) || 0;
    case "unpaid":
      return getUnpaid(sale);
    case "status":
      return getStatus(sale);
    default:
      return "";
  }
}

function formatCalendarSelectedDateLabel(date) {
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][parsed.getDay()];
  const [, monthText, dayText] = date.split("-");
  return `${Number(monthText)}/${Number(dayText)} (${weekday})`;
}

function isCalendarClientVatIncluded(clients, clientName) {
  const match = clients.find((row) => String(row.name || "").trim() === clientName);
  return String(match?.vat || "Y").trim().toUpperCase() !== "N";
}

function CalendarPage({
  sales,
  setSales,
  clients,
  workers = [],
  currentUser,
  paymentVouchers = [],
  setPaymentVouchers,
  setPaymentInputLogs,
  companyProfile,
  statementGenerationLogs,
  setStatementGenerationLogs,
  statementFolders,
  setStatementFolders,
  autoLinkedSaleIds = new Set(),
  manualLinkedSaleIds = new Set(),
}) {
  const { recordAudit } = useAudit();
  const { message: clientFilterNotice, showNotice: showClientFilterNotice, clearNotice: clearClientFilterNotice } = useActionNotice();
  const [monthKey, setMonthKey] = useState(() => todayISO().slice(0, 7));
  const [selectedDate, setSelectedDate] = useState("");
  const [filteredClient, setFilteredClient] = useState(null);
  const [selectedDates, setSelectedDates] = useState([]);
  const [paymentPreview, setPaymentPreview] = useState(null);
  const [paymentCancelPreview, setPaymentCancelPreview] = useState(null);
  const [statementModalDraft, setStatementModalDraft] = useState(null);
  const [editingSaleId, setEditingSaleId] = useState(null);
  const [voucherForm, setVoucherForm] = useState(emptySaleForm);
  const [voucherDeleteConfirm, setVoucherDeleteConfirm] = useState(null);
  const { message: voucherSaveMessage, setMessage: setVoucherSaveMessage, clearMessage: clearVoucherSaveMessage } = useSaveMessage();
  const suppressCellClickUntilRef = useRef(0);
  const preFilterRef = useRef(null);
  const entrySpotlightClickTimerRef = useRef(null);
  const calendarGridRef = useRef(null);
  const spotlightScrollAnchorRef = useRef(null);
  const [spotlightClient, setSpotlightClient] = useState(null);
  const [spotlightDateIndex, setSpotlightDateIndex] = useState(0);
  const [clientSearchOpen, setClientSearchOpen] = useState(false);
  const [clientSearchQuery, setClientSearchQuery] = useState("");
  const [clientSearchSort, setClientSearchSort] = useState("name");
  const calendarSales = useMemo(
    () => (filteredClient ? filterClientCalendarSales(sales, filteredClient) : sales),
    [sales, filteredClient],
  );
  const { cells, monthLabel } = useMemo(() => buildCalendarDays(monthKey, calendarSales, workers), [monthKey, calendarSales, workers]);
  const spotlightSummary = useMemo(() => {
    if (!spotlightClient) return null;
    const dates = new Set();
    let entryCount = 0;
    cells.forEach((cell) => {
      if (!cell) return;
      cell.stats.entries.forEach((entry) => {
        if (entry.client !== spotlightClient) return;
        dates.add(cell.date);
        entryCount += 1;
      });
    });
    if (entryCount === 0) return null;
    return {
      client: spotlightClient,
      dayCount: dates.size,
      entryCount,
      color: getCalendarClientColor(spotlightClient),
    };
  }, [spotlightClient, cells]);
  const spotlightDates = useMemo(() => {
    if (!spotlightClient) return [];
    const dates = [];
    cells.forEach((cell) => {
      if (!cell) return;
      if (cell.stats.entries.some((entry) => entry.client === spotlightClient)) {
        dates.push(cell.date);
      }
    });
    return dates.sort();
  }, [spotlightClient, cells]);
  const todayDate = todayISO();
  const feeMap = useMemo(() => buildWorkerFeeMap(workers), [workers]);
  const calendarClientSearchRows = useMemo(
    () => buildCalendarClientSearchRows(sales, monthKey, feeMap),
    [sales, monthKey, feeMap],
  );
  const calendarClientMasterByName = useMemo(() => {
    const map = new Map();
    clients.forEach((client) => {
      const name = String(client.name || "").trim();
      if (name) map.set(name, client);
    });
    return map;
  }, [clients]);
  const filteredCalendarClientSearchRows = useMemo(() => {
    const query = clientSearchQuery.trim().toLowerCase();
    let rows = calendarClientSearchRows;
    if (query) {
      rows = rows.filter((row) => {
        if (row.client.toLowerCase().includes(query)) return true;
        const master = calendarClientMasterByName.get(row.client);
        if (!master) return false;
        return [master.manager, master.phone, master.depositNameAliases].some((value) =>
          String(value || "").toLowerCase().includes(query),
        );
      });
    }
    if (clientSearchSort === "sales") {
      return [...rows].sort(
        (a, b) => b.monthBill - a.monthBill || a.client.localeCompare(b.client, "ko-KR"),
      );
    }
    return [...rows].sort((a, b) => a.client.localeCompare(b.client, "ko-KR"));
  }, [calendarClientSearchRows, calendarClientMasterByName, clientSearchQuery, clientSearchSort]);

  const selectedDaySales = useMemo(() => {
    if (!selectedDate) return [];
    const rows = calendarSales.filter((sale) => sale.date === selectedDate);
    return sortRowsByColumn(rows, (sale) => getCalendarDaySortValue(sale, "voucher"), "asc");
  }, [calendarSales, selectedDate]);

  const selectedDayStats = useMemo(() => {
    if (!selectedDate) return null;
    return selectedDaySales.reduce(
      (acc, sale) => {
        const stats = aggregateSaleCalendarStats(sale, feeMap);
        acc.staff += stats.staff;
        acc.bill += stats.bill;
        acc.netPay += stats.netPay;
        acc.margin += stats.margin;
        acc.count += 1;
        return acc;
      },
      { staff: 0, bill: 0, netPay: 0, margin: 0, count: 0 },
    );
  }, [selectedDate, selectedDaySales, feeMap]);

  useEffect(() => {
    if (selectedDate && !selectedDate.startsWith(monthKey)) setSelectedDate("");
  }, [monthKey, selectedDate]);

  useEffect(() => {
    setSelectedDates([]);
    setSpotlightClient(null);
    setSpotlightDateIndex(0);
    spotlightScrollAnchorRef.current = null;
    clearClientFilterNotice();
    setPaymentPreview(null);
    setPaymentCancelPreview(null);
  }, [filteredClient, clearClientFilterNotice]);

  useEffect(() => {
    if (!filteredClient) {
      setSpotlightClient(null);
      setSpotlightDateIndex(0);
      spotlightScrollAnchorRef.current = null;
      return;
    }
    setPaymentPreview(null);
    setPaymentCancelPreview(null);
  }, [monthKey, filteredClient]);

  useEffect(() => {
    if (!spotlightClient || filteredClient) return;
    const anchorDate = spotlightScrollAnchorRef.current;
    const anchorIndex = anchorDate ? spotlightDates.indexOf(anchorDate) : -1;
    setSpotlightDateIndex(anchorIndex >= 0 ? anchorIndex : 0);
    const timer = window.setTimeout(() => {
      scrollCalendarSpotlightIntoView(calendarGridRef.current, anchorDate, spotlightDates);
    }, 80);
    return () => window.clearTimeout(timer);
  }, [spotlightClient, filteredClient, spotlightDates]);

  const goSpotlightDate = (delta) => {
    if (!spotlightDates.length) return;
    setSpotlightDateIndex((current) => {
      const nextIndex = (current + delta + spotlightDates.length) % spotlightDates.length;
      scrollCalendarSpotlightDateIntoView(calendarGridRef.current, spotlightDates[nextIndex]);
      return nextIndex;
    });
  };

  const monthTransactionDates = useMemo(
    () => cells.filter(Boolean).filter((cell) => cell.stats.count > 0).map((cell) => cell.date),
    [cells],
  );

  const allMonthDatesSelected = useMemo(
    () => monthTransactionDates.length > 0 && monthTransactionDates.every((date) => selectedDates.includes(date)),
    [monthTransactionDates, selectedDates],
  );

  const toggleSpotlightClient = (clientName, anchorDate = null) => {
    const normalized = normalizeCalendarClientName(clientName);
    setSpotlightClient((current) => {
      if (current === normalized) {
        spotlightScrollAnchorRef.current = null;
        setSpotlightDateIndex(0);
        return null;
      }
      spotlightScrollAnchorRef.current = anchorDate;
      return normalized;
    });
  };

  const handleEntrySpotlightClick = (event, clientName, anchorDate) => {
    event.stopPropagation();
    clearTimeout(entrySpotlightClickTimerRef.current);
    entrySpotlightClickTimerRef.current = setTimeout(() => {
      toggleSpotlightClient(clientName, anchorDate);
    }, 220);
  };

  const applyClientFilter = (clientName, anchorDate) => {
    preFilterRef.current = { selectedDate, monthKey, spotlightClient };
    const normalized = normalizeClientCalendarName(clientName);
    setSpotlightClient(null);
    spotlightScrollAnchorRef.current = null;
    setSpotlightDateIndex(0);
    setFilteredClient(normalized);
    setSelectedDate("");
    setSelectedDates([]);
    clearClientFilterNotice();
    setPaymentPreview(null);
    setPaymentCancelPreview(null);
    if (anchorDate && String(anchorDate).length >= 7) {
      setMonthKey(String(anchorDate).slice(0, 7));
    }
  };

  const enterClientFilterFromSpotlight = (clientName, anchorDate) => {
    const normalized = normalizeCalendarClientName(clientName);
    if (!spotlightClient || spotlightClient !== normalized) return;
    applyClientFilter(clientName, anchorDate);
    showClientFilterNotice(`${normalized} 거래처만 표시합니다. 날짜를 선택해 주세요.`);
  };

  const openClientSearch = () => {
    setClientSearchQuery("");
    setClientSearchSort("name");
    setClientSearchOpen(true);
  };

  const closeClientSearch = () => {
    setClientSearchOpen(false);
    setClientSearchQuery("");
  };

  const selectClientFromSearch = (row) => {
    const normalized = normalizeClientCalendarName(row.client);
    const anchorDate = row.firstDateInMonth || row.latestDate;
    closeClientSearch();
    applyClientFilter(row.client, anchorDate);
    showClientFilterNotice(`${normalized} 거래처만 표시합니다. 날짜를 선택해 주세요.`);
  };

  const goBackFromClientFilter = () => {
    const previous = preFilterRef.current;
    setFilteredClient(null);
    setSelectedDates([]);
    setStatementModalDraft(null);
    clearClientFilterNotice();
    setPaymentPreview(null);
    setPaymentCancelPreview(null);
    if (previous) {
      setMonthKey(previous.monthKey);
      setSelectedDate(previous.selectedDate || "");
      if (previous.spotlightClient) {
        setSpotlightClient(previous.spotlightClient);
      }
    }
    preFilterRef.current = null;
  };

  const clearClientFilter = () => {
    setFilteredClient(null);
    setSelectedDates([]);
    setStatementModalDraft(null);
    clearClientFilterNotice();
    setPaymentPreview(null);
    setPaymentCancelPreview(null);
    preFilterRef.current = null;
  };

  const toggleClientFilterDate = (date) => {
    setSelectedDates((prev) => (prev.includes(date) ? prev.filter((item) => item !== date) : [...prev, date].sort()));
  };

  const selectAllClientFilterDates = () => {
    if (!filteredClient) {
      showClientFilterNotice("거래처를 먼저 선택해 주세요.");
      return;
    }
    if (!monthTransactionDates.length) {
      showClientFilterNotice("이번 달에 거래 내역이 있는 날짜가 없습니다.");
      return;
    }
    if (allMonthDatesSelected) {
      setSelectedDates([]);
      showClientFilterNotice("선택이 해제되었습니다.");
      return;
    }
    setSelectedDates([...monthTransactionDates]);
    showClientFilterNotice(`${monthTransactionDates.length}일이 선택되었습니다.`);
  };

  const handleClientFilterExportStatement = () => {
    if (!filteredClient) {
      showClientFilterNotice("거래처를 선택해 주세요.");
      return;
    }
    if (!selectedDates.length) {
      showClientFilterNotice("시공비내역서를 만들 날짜를 선택해 주세요.");
      return;
    }

    const draft = createClientCalendarStatementDraft(filteredClient, calendarSales, selectedDates);
    if (!draft) {
      showClientFilterNotice("선택한 날짜에 해당 거래처 전표가 없습니다.");
      return;
    }

    stashStatementDraft(draft);
    setStatementModalDraft(draft);
    showClientFilterNotice(`${selectedDates.length}일 · 시공비내역서를 엽니다.`);
  };

  const openClientFilterPaymentConfirm = () => {
    if (!filteredClient) {
      showClientFilterNotice("거래처를 선택해 주세요.");
      return;
    }
    if (!selectedDates.length) {
      showClientFilterNotice("입금 처리할 날짜를 선택해 주세요.");
      return;
    }
    if (!setPaymentVouchers || !setPaymentInputLogs) {
      showClientFilterNotice("입금 처리 기능을 사용할 수 없습니다.");
      return;
    }

    const vatIncluded = isCalendarClientVatIncluded(clients, filteredClient);
    const preview = buildCalendarPaymentPreview(sales, filteredClient, selectedDates, todayISO(), vatIncluded);
    if (!preview) {
      showClientFilterNotice("선택한 날짜에 미수 전표가 없습니다.");
      return;
    }

    setPaymentPreview(preview);
  };

  const handleClientFilterPaymentVatChange = (vatIncluded) => {
    if (!filteredClient || !selectedDates.length) return;
    const preview = buildCalendarPaymentPreview(sales, filteredClient, selectedDates, todayISO(), vatIncluded);
    if (preview) setPaymentPreview(preview);
  };

  const closeClientFilterPaymentConfirm = () => {
    setPaymentPreview(null);
  };

  const confirmClientFilterPaymentProcess = () => {
    if (!paymentPreview || !setPaymentVouchers || !setPaymentInputLogs) return;

    const batchId = Date.now();
    const savedBy = currentUser?.name || currentUser?.email || "";
    const vouchers = paymentPreview.vouchers;
    const logs = createPaymentInputLogsFromVouchers(vouchers, savedBy, batchId);

    vouchers.forEach((voucher) => {
      recordAudit({
        entityType: "paymentVoucher",
        entityId: voucher.id,
        entityLabel: `${voucher.client} · ${voucher.site}`,
        screen: "캘린더",
        action: "create",
        after: snapshotPaymentForAudit(voucher),
        fields: PAYMENT_AUDIT_FIELDS,
        user: currentUser,
      });
    });

    setPaymentVouchers((prev) => [...vouchers, ...prev]);
    setPaymentInputLogs((prev) => [...logs, ...prev]);
    setPaymentPreview(null);
    setSelectedDates([]);
    showClientFilterNotice(`${vouchers.length}건 · ${formatKRW(paymentPreview.totalFinal)} 입금완료 처리되었습니다.`);
  };

  const openClientFilterPaymentCancelConfirm = () => {
    if (!filteredClient) {
      showClientFilterNotice("거래처를 선택해 주세요.");
      return;
    }
    if (!selectedDates.length) {
      showClientFilterNotice("입금 취소할 날짜를 선택해 주세요.");
      return;
    }
    if (!setPaymentVouchers || !setPaymentInputLogs) {
      showClientFilterNotice("입금 취소 기능을 사용할 수 없습니다.");
      return;
    }

    const preview = buildCalendarPaymentCancelPreview(sales, paymentVouchers, filteredClient, selectedDates);
    if (!preview) {
      showClientFilterNotice("선택한 날짜에 취소할 입금 내역이 없습니다.");
      return;
    }

    setPaymentCancelPreview(preview);
  };

  const closeClientFilterPaymentCancelConfirm = () => {
    setPaymentCancelPreview(null);
  };

  const confirmClientFilterPaymentCancel = () => {
    if (!paymentCancelPreview || !setPaymentVouchers || !setPaymentInputLogs) return;

    const cancelIds = new Set(paymentCancelPreview.vouchers.map((voucher) => String(voucher.id)));

    paymentCancelPreview.vouchers.forEach((voucher) => {
      recordAudit({
        entityType: "paymentVoucher",
        entityId: voucher.id,
        entityLabel: `${voucher.client} · ${voucher.site}`,
        screen: "캘린더",
        action: "delete",
        before: snapshotPaymentForAudit(voucher),
        fields: PAYMENT_AUDIT_FIELDS,
        user: currentUser,
      });
    });

    setPaymentVouchers((prev) => prev.filter((item) => !cancelIds.has(String(item.id))));
    setPaymentInputLogs((prev) => prev.filter((log) => !cancelIds.has(String(log.paymentVoucherId))));
    setPaymentCancelPreview(null);
    setSelectedDates([]);
    showClientFilterNotice(`${paymentCancelPreview.voucherCount}건 · ${formatKRW(paymentCancelPreview.totalFinal)} 입금이 취소되었습니다.`);
  };

  const monthTotals = useMemo(() => {
    return cells.filter(Boolean).reduce(
      (acc, cell) => {
        acc.staff += cell.stats.staff;
        acc.bill += cell.stats.bill;
        acc.spend += cell.stats.spend;
        acc.fee += cell.stats.fee;
        acc.netPay += cell.stats.netPay;
        acc.margin += cell.stats.margin;
        acc.paid += cell.stats.paid;
        acc.unpaid += cell.stats.unpaid;
        acc.count += cell.stats.count;
        return acc;
      },
      { staff: 0, bill: 0, spend: 0, fee: 0, netPay: 0, margin: 0, paid: 0, unpaid: 0, count: 0 },
    );
  }, [cells]);

  const clientFilterSelectedTotals = useMemo(() => {
    if (!filteredClient || !selectedDates.length) return null;
    const selectedSet = new Set(selectedDates);
    return calendarSales.reduce(
      (acc, sale) => {
        const date = String(sale.date || "").trim();
        if (!selectedSet.has(date)) return acc;
        const stats = aggregateSaleCalendarStats(sale, feeMap);
        const unpaid = getUnpaid(sale);
        const paid = getSalePaidAmount(sale, unpaid);
        acc.count += 1;
        acc.bill += stats.bill;
        acc.paid += paid;
        acc.unpaid += unpaid;
        return acc;
      },
      { days: selectedDates.length, count: 0, bill: 0, paid: 0, unpaid: 0 },
    );
  }, [filteredClient, selectedDates, calendarSales, feeMap]);

  const busiestDay = useMemo(() => {
    let best = null;
    for (const cell of cells) {
      if (!cell || cell.stats.count <= 0) continue;
      if (!best || cell.stats.bill > best.stats.bill) best = cell;
    }
    return best;
  }, [cells]);

  const shiftMonth = (delta) => {
    const [yearText, monthText] = monthKey.split("-");
    const date = new Date(Number(yearText), Number(monthText) - 1 + delta, 1);
    setMonthKey(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`);
  };

  const selectDate = (date) => {
    setSelectedDate(date);
  };

  const shiftSelectedDate = (delta) => {
    if (!selectedDate) return;
    const parsed = new Date(`${selectedDate}T12:00:00`);
    parsed.setDate(parsed.getDate() + delta);
    const nextDate = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
    setSelectedDate(nextDate);
    if (!nextDate.startsWith(monthKey)) {
      setMonthKey(nextDate.slice(0, 7));
    }
  };

  const weekdayLabels = [
    { label: "일", tone: "sun" },
    { label: "월", tone: "default" },
    { label: "화", tone: "default" },
    { label: "수", tone: "default" },
    { label: "목", tone: "default" },
    { label: "금", tone: "default" },
    { label: "토", tone: "sat" },
  ];

  const editingSale = sales.find((row) => row.id === editingSaleId);

  const updateVoucherForm = (key, value) => {
    clearVoucherSaveMessage();
    setVoucherForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateVoucherSharedMemo = (value) => {
    clearVoucherSaveMessage();
    setVoucherForm((prev) => {
      const previousCommon = String(prev.memo || "").trim();
      return {
        ...prev,
        memo: value,
        workers: prev.workers.map((line) => {
          const lineMemo = String(line.memo || "").trim();
          if (lineMemo && lineMemo !== previousCommon) return line;
          return { ...line, memo: value };
        }),
      };
    });
  };

  const resetVoucherEdit = () => {
    setEditingSaleId(null);
    setVoucherForm(emptySaleForm);
    setVoucherDeleteConfirm(null);
  };

  const closeVoucherEdit = () => {
    resetVoucherEdit();
    clearVoucherSaveMessage();
  };

  const openVoucherEdit = (sale) => {
    setEditingSaleId(sale.id);
    clearVoucherSaveMessage();
    setVoucherForm(saleRowToForm(sale));
  };

  const updateVoucherWorkerLine = (index, key, value) => {
    clearVoucherSaveMessage();
    setVoucherForm((prev) => ({
      ...prev,
      workers: prev.workers.map((line, lineIndex) => {
        if (lineIndex !== index) return line;
        let nextLine = applyWorkerLineFieldUpdate(line, key, value);
        if (key === "worker") {
          const selectedWorker = findActiveWorkerByName(workers, value);
          const selectedClient = clients.find((client) => client.name === prev.client);
          nextLine.quantity = nextLine.quantity || "1";
          nextLine.unitCost = selectedWorker?.constructionCost ? String(selectedWorker.constructionCost) : nextLine.unitCost;
          nextLine.chargeAmount = selectedWorker?.customChargeCost ? String(selectedWorker.customChargeCost) : selectedClient?.constructionCost ? String(selectedClient.constructionCost) : nextLine.chargeAmount;
          nextLine.overtimeCost = selectedClient?.overtimeCost ? String(selectedClient.overtimeCost) : selectedWorker?.overtimeCost ? String(selectedWorker.overtimeCost) : nextLine.overtimeCost || "30000";
          nextLine.feeRate = selectedWorker?.feeRate ?? nextLine.feeRate ?? "";
          nextLine = stripWorkerLineComputedMetrics(nextLine);
        }
        return nextLine;
      }),
    }));
  };

  const addVoucherWorkerLine = () => setVoucherForm((prev) => ({
    ...prev,
    workers: [...prev.workers, { ...createWorkerLine(prev.workers.length), memo: prev.memo || "" }],
  }));

  const removeVoucherWorkerLine = (index) => setVoucherForm((prev) => ({
    ...prev,
    workers: prev.workers.length <= 1 ? prev.workers : prev.workers.filter((_, lineIndex) => lineIndex !== index),
  }));

  const voucherFormTotals = useMemo(() => sumWorkerFormTotals(voucherForm.workers, workers), [voucherForm.workers, workers]);
  const voucherFilledWorkerCount = useMemo(
    () => voucherForm.workers.filter((line) => String(line.worker || "").trim()).length,
    [voucherForm.workers],
  );
  const canSaveVoucher = Boolean(
    voucherForm.client.trim()
    && voucherForm.site.trim()
    && voucherFormTotals.bill > 0
    && isSaleFormMasterRefsValid(voucherForm, clients, workers)
  );

  const saveVoucherEdit = () => {
    if (!editingSale) return;
    const masterRefError = validateSaleFormMasterRefs(voucherForm, clients, workers);
    if (masterRefError) {
      setVoucherSaveMessage(masterRefError);
      return;
    }
    const payload = buildSaleFromForm(voucherForm, currentUser, workers);
    if (!payload.client || !payload.site || payload.amount <= 0) return;

    recordAudit({
      entityType: "sale",
      entityId: editingSale.id,
      entityLabel: `${payload.client} · ${payload.site}`,
      screen: "캘린더",
      action: "update",
      before: snapshotSaleForAudit(editingSale),
      after: snapshotSaleForAudit({ ...editingSale, ...payload }),
      fields: SALE_AUDIT_FIELDS,
      user: currentUser,
    });

    setSales((prev) => prev.map((row) => (
      row.id === editingSale.id
        ? { ...row, ...payload, createdBy: row.createdBy, createdByEmail: row.createdByEmail, createdAt: row.createdAt }
        : row
    )));
    if (setPaymentVouchers && (payload.client !== editingSale.client || payload.site !== editingSale.site)) {
      setPaymentVouchers((prev) => syncLinkedPaymentVouchersForSale(prev, editingSale.id, { client: payload.client, site: payload.site }));
    }
    setVoucherSaveMessage(`${payload.client} · ${payload.site} 전표가 저장되었습니다.`);
    resetVoucherEdit();
  };

  const confirmDeleteVoucherEdit = () => {
    if (!voucherDeleteConfirm) return;
    const sale = voucherDeleteConfirm;

    recordAudit({
      entityType: "sale",
      entityId: sale.id,
      entityLabel: `${sale.client} · ${sale.site}`,
      screen: "캘린더",
      action: "delete",
      before: snapshotSaleForAudit(sale),
      fields: SALE_AUDIT_FIELDS,
      user: currentUser,
    });

    setSales((prev) => prev.filter((row) => row.id !== sale.id));
    setVoucherDeleteConfirm(null);
    resetVoucherEdit();
    setVoucherSaveMessage(`전표 ${sale.voucherNo || sale.id} (${sale.client} · ${sale.site})가 삭제되었습니다.`);
  };

  return (
    <div
      className={`erp-page erp-calendar-page${selectedDate ? " has-side-panel" : ""}`}
    >
      {paymentCancelPreview ? (
        <div className="erp-ledger-modal-backdrop" onClick={closeClientFilterPaymentCancelConfirm}>
          <div
            className="erp-ledger-modal erp-client-calendar-payment-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="calendar-client-payment-cancel-title"
          >
            <h2 id="calendar-client-payment-cancel-title" className="text-base font-bold text-slate-900 md:text-lg">
              입금 취소
            </h2>
            <p className="mt-2 text-sm font-semibold text-slate-800">{paymentCancelPreview.client}</p>
            <div className="mt-4 space-y-2 text-sm text-slate-600">
              <p>선택 일자 <strong>{paymentCancelPreview.selectedDays}일</strong></p>
              <p>취소 입금 <strong>{paymentCancelPreview.voucherCount}건</strong></p>
              <p>입금 공급가액 <strong>{formatKRW(paymentCancelPreview.totalAmount)}</strong></p>
              <p>
                부가세{" "}
                <strong className={paymentCancelPreview.totalVat > 0 ? "text-amber-700" : "text-slate-500"}>
                  {paymentCancelPreview.totalVat > 0 ? formatKRW(paymentCancelPreview.totalVat) : "없음"}
                </strong>
              </p>
              <p>취소 금액 <strong className="text-red-700">{formatKRW(paymentCancelPreview.totalFinal)}</strong></p>
              <p className="text-xs text-slate-500">선택한 날짜 매출 전표에 연결된 입금 내역을 삭제합니다.</p>
            </div>
            <div className="mt-5 flex gap-2">
              <Button variant="outline" className="flex-1 rounded-xl" onClick={closeClientFilterPaymentCancelConfirm}>
                닫기
              </Button>
              <Button className="flex-1 rounded-xl bg-red-600 hover:bg-red-700" onClick={confirmClientFilterPaymentCancel}>
                입금취소
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {paymentPreview ? (
        <div className="erp-ledger-modal-backdrop" onClick={closeClientFilterPaymentConfirm}>
          <div
            className="erp-ledger-modal erp-client-calendar-payment-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="calendar-client-payment-title"
          >
            <h2 id="calendar-client-payment-title" className="text-base font-bold text-slate-900 md:text-lg">
              입금 처리
            </h2>
            <p className="mt-2 text-sm font-semibold text-slate-800">{paymentPreview.client}</p>
            <div className="mt-4">
              <p className="text-xs font-semibold text-slate-500">부가세 처리</p>
              <div className="mt-2 flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={paymentPreview.vatIncluded ? "default" : "outline"}
                  className="flex-1 rounded-xl"
                  onClick={() => handleClientFilterPaymentVatChange(true)}
                >
                  부가세 포함
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={!paymentPreview.vatIncluded ? "default" : "outline"}
                  className="flex-1 rounded-xl"
                  onClick={() => handleClientFilterPaymentVatChange(false)}
                >
                  부가세 미포함
                </Button>
              </div>
            </div>
            <div className="mt-4 space-y-2 text-sm text-slate-600">
              <p>선택 일자 <strong>{paymentPreview.selectedDays}일</strong></p>
              <p>미수 전표 <strong>{paymentPreview.saleCount}건</strong></p>
              <p>입금 공급가액 <strong>{formatKRW(paymentPreview.totalUnpaid)}</strong></p>
              <p>
                부가세{" "}
                <strong className={paymentPreview.totalVat > 0 ? "text-amber-700" : "text-slate-500"}>
                  {paymentPreview.totalVat > 0 ? formatKRW(paymentPreview.totalVat) : "없음"}
                </strong>
              </p>
              <p>최종 입금액 <strong className="text-emerald-700">{formatKRW(paymentPreview.totalFinal)}</strong></p>
              <p className="text-xs text-slate-500">선택한 날짜의 미수 잔액을 오늘({todayISO()}) 입금완료 처리합니다.</p>
            </div>
            <div className="mt-5 flex gap-2">
              <Button variant="outline" className="flex-1 rounded-xl" onClick={closeClientFilterPaymentConfirm}>
                취소
              </Button>
              <Button className="flex-1 rounded-xl" onClick={confirmClientFilterPaymentProcess}>
                입금완료
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <PageTitle
        title="캘린더"
        desc={
          filteredClient
            ? `${filteredClient} 거래처 전표만 표시합니다. 날짜를 선택해 시공비내역서·입금 처리를 진행하세요.`
            : "월별 일자별 총인원·총시공비·시공자 지급액·마진·마진율을 확인합니다."
        }
        action={(
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="erp-touch-target shrink-0 rounded-xl"
            onClick={openClientSearch}
          >
            <Search size={16} className="mr-1.5" />
            거래처 검색
          </Button>
        )}
      />

      {clientSearchOpen ? (
        <div className="erp-ledger-modal-backdrop" onClick={closeClientSearch}>
          <div
            className="erp-ledger-modal erp-ledger-modal--calendar-client-search"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="calendar-client-search-title"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 id="calendar-client-search-title" className="text-base font-bold text-slate-900 md:text-lg">
                  거래처 검색
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {monthLabel} 기준 · 거래처를 선택하면 해당 거래처 전표만 표시합니다.
                </p>
              </div>
              <button
                type="button"
                className="erp-calendar-nav-btn shrink-0"
                onClick={closeClientSearch}
                aria-label="거래처 검색 닫기"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-4">
              <SearchBox
                query={clientSearchQuery}
                setQuery={setClientSearchQuery}
                placeholder="거래처명, 담당자, 연락처, 예금주 별칭 검색"
              />
            </div>

            <div className="erp-client-calendar-client-list mt-4">
              <div className="erp-client-calendar-client-list-head">
                <div className="erp-client-calendar-client-list-head-name">
                  <button
                    type="button"
                    className={`erp-pivot-sort-btn erp-client-calendar-sort-btn ${clientSearchSort === "name" ? "is-active" : ""}`}
                    onClick={() => setClientSearchSort("name")}
                  >
                    거래처
                    {clientSearchSort === "name" ? <ArrowUp size={12} aria-hidden="true" /> : null}
                  </button>
                </div>
                <div className="erp-client-calendar-client-list-head-amounts">
                  <button
                    type="button"
                    className={`erp-pivot-sort-btn erp-client-calendar-sort-btn ${clientSearchSort === "sales" ? "is-active" : ""}`}
                    onClick={() => setClientSearchSort("sales")}
                  >
                    {monthLabel} 매출
                    {clientSearchSort === "sales" ? <ArrowDown size={12} aria-hidden="true" /> : null}
                  </button>
                </div>
              </div>

              <div className="erp-client-calendar-client-list-body">
                {filteredCalendarClientSearchRows.length ? (
                  filteredCalendarClientSearchRows.map((row) => (
                    <button
                      key={row.client}
                      type="button"
                      className={`erp-client-calendar-client-row${filteredClient === normalizeClientCalendarName(row.client) ? " is-selected" : ""}`}
                      onClick={() => selectClientFromSearch(row)}
                    >
                      <div className="erp-client-calendar-client-row-inner">
                        <span className="erp-client-calendar-client-row-name">{row.client}</span>
                        <div className="erp-client-calendar-client-row-amounts">
                          <span className="erp-client-calendar-client-row-sales">
                            {row.monthCount > 0 ? formatKRW(row.monthBill) : "-"}
                          </span>
                          <span className="erp-client-calendar-client-row-sub">
                            {row.monthCount > 0 ? (
                              <>
                                {row.monthCount}건
                                {row.monthUnpaid > 0 ? (
                                  <span className="is-unpaid"> · 미수 {formatKRW(row.monthUnpaid)}</span>
                                ) : (
                                  <span className="is-paid"> · 입금완료</span>
                                )}
                              </>
                            ) : (
                              <span className="is-zero">이번 달 전표 없음</span>
                            )}
                          </span>
                        </div>
                      </div>
                    </button>
                  ))
                ) : (
                  <p className="col-span-full px-1 py-6 text-center text-sm text-slate-500">
                    {clientSearchQuery.trim() ? "검색 결과가 없습니다." : "표시할 거래처가 없습니다."}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className={`erp-calendar-summary-grid${filteredClient ? " is-client-filter-summary" : ""}`}>
        {filteredClient ? (
          <>
            <SummaryCard compact title="월간 전표" value={`${monthTotals.count}건`} sub={monthLabel} />
            <SummaryCard compact title="총 시공비" value={formatKRW(monthTotals.bill)} sub="청구 기준" />
            <SummaryCard compact title="입금액" value={formatKRW(monthTotals.paid)} sub="공급가 기준" tone="success" />
            <SummaryCard compact title="미수금" value={formatKRW(monthTotals.unpaid)} sub={monthTotals.unpaid > 0 ? "미수 포함" : "미수 없음"} tone={monthTotals.unpaid > 0 ? "danger" : "default"} />
            {clientFilterSelectedTotals ? (
              <SummaryCard
                compact
                title="선택 매출 합계"
                value={formatKRW(clientFilterSelectedTotals.bill)}
                sub={`${clientFilterSelectedTotals.days}일 · ${clientFilterSelectedTotals.count}건 · 입금 ${formatKRW(clientFilterSelectedTotals.paid)} · 미수 ${formatKRW(clientFilterSelectedTotals.unpaid)}`}
                tone="default"
              />
            ) : (
              <SummaryCard compact title="선택 일자" value="0일" sub="날짜를 눌러 선택" />
            )}
          </>
        ) : (
          <>
            <SummaryCard compact title="월간 전표" value={`${monthTotals.count}건`} sub={monthLabel} />
            <SummaryCard compact title="총 인원" value={`${monthTotals.staff}명`} sub="인원 합계" />
            <SummaryCard compact title="총 시공비" value={formatKRW(monthTotals.bill)} sub="청구 기준" />
            <SummaryCard compact title="시공자 지급" value={formatKRW(monthTotals.netPay)} sub="실지급" />
            <SummaryCard
              compact
              title="마진"
              value={formatKRW(monthTotals.margin)}
              sub={`마진율 ${formatMarginRate(monthTotals.margin, monthTotals.bill)}`}
              tone={monthTotals.margin >= 0 ? "success" : "danger"}
            />
          </>
        )}
      </div>

      <div className="erp-calendar-layout">
        <Card className="erp-calendar-card erp-calendar-main rounded-2xl shadow-sm">
          <CardContent className="p-3 md:p-5">
            <div className="erp-calendar-toolbar">
              {filteredClient ? (
                <div className="erp-calendar-toolbar-filter">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-xl"
                    onClick={goBackFromClientFilter}
                  >
                    <ArrowLeft size={16} className="mr-1" />
                    돌아가기
                  </Button>
                  <div className="erp-calendar-toolbar-filter-label">
                    <span
                      className="erp-calendar-toolbar-filter-name"
                      style={{ "--client-color": getCalendarClientColor(filteredClient) }}
                    >
                      {filteredClient}
                    </span>
                    <span className="erp-calendar-toolbar-filter-meta">거래처만 표시</span>
                  </div>
                  <Button type="button" variant="ghost" size="sm" className="rounded-xl" onClick={clearClientFilter}>
                    전체 보기
                  </Button>
                </div>
              ) : null}
              <div className="erp-calendar-toolbar-main">
                <button type="button" className="erp-calendar-nav-btn" onClick={() => shiftMonth(-1)} aria-label="이전 달">
                  <ChevronLeft size={18} />
                </button>
                <div className="erp-calendar-month-label">
                  <CalendarDays size={18} className="text-sky-600" />
                  <h2>{monthLabel}</h2>
                </div>
                <button type="button" className="erp-calendar-nav-btn" onClick={() => shiftMonth(1)} aria-label="다음 달">
                  <ChevronRight size={18} />
                </button>
              </div>
              <Button variant="outline" size="sm" className="erp-calendar-today-btn rounded-xl" onClick={() => setMonthKey(todayISO().slice(0, 7))}>
                이번 달
              </Button>
            </div>

            <p className="erp-calendar-mobile-hint">
              {filteredClient
                ? "날짜를 눌러 선택하고, 아래 버튼으로 시공비내역서·입금 처리를 진행하세요. 더블클릭하면 일자 상세를 볼 수 있습니다."
                : "날짜를 누르면 해당 일자의 전표 상세를 볼 수 있습니다."}
            </p>

            {busiestDay ? (
              <div className="erp-calendar-highlight">
                <span className="erp-calendar-highlight-label">이번 달 최다 시공비</span>
                <strong>{busiestDay.day}일</strong>
                <span className="erp-calendar-highlight-meta">
                  {busiestDay.stats.count}건 · {formatKRW(busiestDay.stats.bill)} · 마진 {formatKRW(busiestDay.stats.margin)} ({formatMarginRate(busiestDay.stats.margin, busiestDay.stats.bill)})
                </span>
              </div>
            ) : null}

            {filteredClient && selectedDates.length > 0 ? (
              <div className="erp-client-calendar-selected-bar" aria-label={`선택된 날짜 ${selectedDates.length}일`}>
                <div className="erp-client-calendar-selected-bar-summary">
                  <span className="erp-client-calendar-selected-bar-label">선택 {selectedDates.length}일</span>
                  {clientFilterSelectedTotals ? (
                    <span className="erp-client-calendar-selected-bar-amount">
                      매출 {formatKRW(clientFilterSelectedTotals.bill)}
                      <span className="is-paid"> · 입금 {formatKRW(clientFilterSelectedTotals.paid)}</span>
                      <span className={clientFilterSelectedTotals.unpaid > 0 ? "is-unpaid" : "is-zero"}>
                        {" "}
                        · 미수 {formatKRW(clientFilterSelectedTotals.unpaid)}
                      </span>
                    </span>
                  ) : null}
                </div>
                <div className="erp-client-calendar-selected-chips">
                  {selectedDates.map((date) => (
                    <button
                      key={date}
                      type="button"
                      className="erp-client-calendar-selected-chip"
                      onClick={() => toggleClientFilterDate(date)}
                      title={`${date} 선택 해제`}
                    >
                      {formatCalendarSelectedDateLabel(date)}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="erp-calendar-weekdays">
              {weekdayLabels.map((item) => (
                <div key={item.label} className={`erp-calendar-weekday is-${item.tone}`}>
                  {item.label}
                </div>
              ))}
            </div>

            {spotlightSummary && !filteredClient ? (
              <div
                className="erp-calendar-client-spotlight-bar"
                style={{ "--spotlight-client-color": spotlightSummary.color }}
                role="status"
                aria-live="polite"
              >
                <span className="erp-calendar-client-spotlight-dot" aria-hidden="true" />
                <strong>{spotlightSummary.client}</strong>
                <span className="erp-calendar-client-spotlight-meta">
                  이번 달 <em>{spotlightSummary.dayCount}일</em> · 전표 <em>{spotlightSummary.entryCount}건</em>
                  {spotlightDates.length > 1 ? (
                    <>
                      {" "}
                      · <em>{formatCalendarSelectedDateLabel(spotlightDates[spotlightDateIndex])}</em>
                    </>
                  ) : null}
                  {" "}
                  · 행 더블클릭 → 거래처만 보기
                </span>
                {spotlightDates.length > 1 ? (
                  <div className="erp-calendar-client-spotlight-nav">
                    <button
                      type="button"
                      className="erp-calendar-client-spotlight-nav-btn"
                      onClick={() => goSpotlightDate(-1)}
                      aria-label="이전 강조 일정으로 이동"
                    >
                      이전
                    </button>
                    <button
                      type="button"
                      className="erp-calendar-client-spotlight-nav-btn"
                      onClick={() => goSpotlightDate(1)}
                      aria-label="다음 강조 일정으로 이동"
                    >
                      다음
                    </button>
                  </div>
                ) : null}
                <button
                  type="button"
                  className="erp-calendar-client-spotlight-dismiss"
                  onClick={() => {
                    spotlightScrollAnchorRef.current = null;
                    setSpotlightDateIndex(0);
                    setSpotlightClient(null);
                  }}
                  aria-label="업체 강조 해제"
                >
                  해제
                </button>
              </div>
            ) : null}

            <div
              ref={calendarGridRef}
              className={[
                "erp-calendar-grid",
                "erp-calendar-grid--entries",
                spotlightClient && !filteredClient ? "has-client-spotlight" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {cells.map((cell, index) => {
                if (!cell) {
                  return <div key={`empty-${index}`} className="erp-calendar-cell is-placeholder" aria-hidden="true" />;
                }

                const weekday = new Date(`${cell.date}T12:00:00`).getDay();
                const isToday = cell.date === todayDate;
                const hasData = cell.stats.count > 0;
                const weekendTone = weekday === 0 ? "sun" : weekday === 6 ? "sat" : "default";
                const isSideSelected = selectedDate === cell.date;
                const isDateChecked = filteredClient && selectedDates.includes(cell.date);
                const isCellSelected = filteredClient ? isDateChecked : isSideSelected;
                const paymentTone = hasData ? getCalendarDayPaymentTone(cell.stats) : "";
                const cellHasSpotlightClient =
                  Boolean(spotlightClient) &&
                  !filteredClient &&
                  cell.stats.entries.some((entry) => entry.client === spotlightClient);

                const cellClassName = [
                  "erp-calendar-cell",
                  "erp-calendar-cell--entries",
                  `is-${weekendTone}`,
                  hasData ? "has-data" : "is-empty",
                  isToday ? "is-today" : "",
                  filteredClient && hasData ? "is-selectable" : "",
                  paymentTone && filteredClient ? `is-${paymentTone}` : "",
                  isCellSelected ? "is-selected" : "",
                  cellHasSpotlightClient ? "is-client-spotlight-cell" : "",
                  spotlightClient && !filteredClient && spotlightDates[spotlightDateIndex] === cell.date
                    ? "is-spotlight-nav-active"
                    : "",
                  spotlightClient && hasData && !cellHasSpotlightClient && !filteredClient ? "is-client-dimmed-cell" : "",
                ]
                  .filter(Boolean)
                  .join(" ");

                const cellBody = (
                  <>
                    <div className="erp-calendar-cell-head">
                      <div className="erp-calendar-cell-head-start">
                        <span className="erp-calendar-day">{cell.day}</span>
                        {hasData ? (
                          <span className="erp-calendar-cell-daily-sales" title="일매출">
                            {formatKRW(cell.stats.bill)}
                          </span>
                        ) : null}
                      </div>
                      {hasData ? (
                        <div className="erp-calendar-cell-badges">
                          {isDateChecked ? (
                            <span className="erp-client-calendar-selected-badge" aria-hidden="true">
                              <Check size={12} strokeWidth={3} />
                            </span>
                          ) : null}
                          <span className="erp-calendar-cell-badge is-staff">{cell.stats.staff}명</span>
                          <span className="erp-calendar-cell-badge is-count">{cell.stats.count}건</span>
                        </div>
                      ) : null}
                      {hasData ? (
                        <span className="erp-calendar-cell-mobile-count" aria-hidden="true">
                          {cell.stats.count}건
                        </span>
                      ) : null}
                    </div>
                    {hasData ? (
                      <ul className="erp-calendar-cell-entries" aria-label={`${cell.date} 일정`}>
                        {cell.stats.entries.map((entry) => {
                          const isEntrySpotlight = spotlightClient && !filteredClient && entry.client === spotlightClient;
                          return (
                          <li
                            key={`${cell.date}-${entry.saleId}`}
                            className={[
                              "erp-calendar-cell-entry",
                              entry.hasUnpaid ? "is-unpaid" : "is-paid",
                              filteredClient ? "erp-calendar-cell-entry--client-filter" : "",
                              !filteredClient ? "is-client-open" : "",
                              isEntrySpotlight ? "is-client-spotlight" : "",
                              spotlightClient && !filteredClient && !isEntrySpotlight ? "is-client-dimmed" : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            style={{
                              ...getCalendarEntryBorderStyle(entry),
                              "--client-color": entry.color,
                            }}
                            title={
                              filteredClient
                                ? `${entry.site}${entry.workerSummary ? ` · ${entry.workerSummary}` : ""}${entry.hasUnpaid ? ` · 미수 ${formatKRW(entry.unpaid)}` : " · 입금완료"}`
                                : `${entry.client} · ${entry.site}${entry.hasUnpaid ? ` · 미수 ${formatKRW(entry.unpaid)}` : " · 입금완료"} · 행 클릭: 강조 · 강조 상태에서 더블클릭: 거래처만 보기`
                            }
                            onClick={
                              filteredClient
                                ? undefined
                                : (event) => handleEntrySpotlightClick(event, entry.client, cell.date)
                            }
                            onDoubleClick={
                              filteredClient
                                ? undefined
                                : (event) => {
                                    clearTimeout(entrySpotlightClickTimerRef.current);
                                    event.stopPropagation();
                                    event.preventDefault();
                                    if (!spotlightClient || entry.client !== spotlightClient) return;
                                    suppressCellClickUntilRef.current = Date.now() + 400;
                                    enterClientFilterFromSpotlight(entry.client, cell.date);
                                  }
                            }
                          >
                            <span className="erp-calendar-cell-entry-label">
                              {filteredClient ? (
                                <>
                                  <span className="erp-calendar-cell-entry-site">{entry.site}</span>
                                  {entry.workerSummary ? (
                                    <span className="erp-calendar-cell-entry-workers">{entry.workerSummary}</span>
                                  ) : null}
                                </>
                              ) : (
                                <>
                                  <span
                                    className="erp-calendar-cell-entry-client"
                                    style={{ "--client-color": entry.color }}
                                  >
                                    {entry.client}
                                  </span>
                                  <span className="erp-calendar-cell-entry-sep"> / </span>
                                  <span className="erp-calendar-cell-entry-site">{entry.site}</span>
                                </>
                              )}
                            </span>
                            {entry.saleId ? (
                              <SalePaymentLinkBadge
                                saleId={entry.saleId}
                                autoLinkedSaleIds={autoLinkedSaleIds}
                                manualLinkedSaleIds={manualLinkedSaleIds}
                              />
                            ) : null}
                          </li>
                          );
                        })}
                      </ul>
                    ) : null}
                  </>
                );

                if (hasData || isToday) {
                  return (
                    <button
                      type="button"
                      key={cell.date}
                      onClick={() => {
                        if (Date.now() < suppressCellClickUntilRef.current) return;
                        if (filteredClient) {
                          if (hasData) toggleClientFilterDate(cell.date);
                          return;
                        }
                        selectDate(cell.date);
                      }}
                      onDoubleClick={
                        filteredClient && hasData
                          ? (event) => {
                              event.stopPropagation();
                              event.preventDefault();
                              suppressCellClickUntilRef.current = Date.now() + 400;
                              selectDate(cell.date);
                            }
                          : !filteredClient && spotlightClient && cellHasSpotlightClient
                            ? (event) => {
                                event.stopPropagation();
                                event.preventDefault();
                                suppressCellClickUntilRef.current = Date.now() + 400;
                                enterClientFilterFromSpotlight(spotlightClient, cell.date);
                              }
                            : undefined
                      }
                      aria-pressed={isCellSelected}
                      className={cellClassName}
                      data-calendar-date={cell.date}
                      style={cellHasSpotlightClient ? { "--client-color": getCalendarClientColor(spotlightClient) } : undefined}
                      aria-label={`${cell.date} · ${hasData ? `${cell.stats.count}건` : "일정 없음"}`}
                      title={
                        filteredClient && hasData
                          ? "클릭: 날짜 선택 · 더블클릭: 일자 상세"
                          : undefined
                      }
                    >
                      {cellBody}
                    </button>
                  );
                }

                return (
                  <div key={cell.date} className={cellClassName} data-calendar-date={cell.date} title={cell.date}>
                    {cellBody}
                  </div>
                );
              })}
            </div>

            <div className="erp-calendar-legend">
              <span className="erp-calendar-legend-item">
                <i className="erp-calendar-legend-dot is-today" /> 오늘
              </span>
              <span className="erp-calendar-legend-item">
                <i className="erp-client-calendar-legend-dot is-unpaid" /> 미수 전표
              </span>
              <span className="erp-calendar-legend-item">
                <i className="erp-client-calendar-legend-dot is-paid" /> 입금 전표
              </span>
              <span className="erp-calendar-legend-item">
                <i className="erp-calendar-legend-dot is-selected" /> {filteredClient ? "날짜 선택" : "날짜 클릭 · 상세"}
              </span>
              {filteredClient ? (
                <>
                  <span className="erp-calendar-legend-item erp-calendar-legend-item--desktop-only">날짜 테두리: 초록 입금 · 빨강 미수 · 주황 혼재</span>
                  <span className="erp-calendar-legend-item erp-calendar-legend-item--desktop-only">더블클릭 → 일자 상세</span>
                </>
              ) : (
                <>
                  <span className="erp-calendar-legend-item erp-calendar-legend-item--desktop-only">전표 행 클릭 → 같은 업체 강조</span>
                  <span className="erp-calendar-legend-item erp-calendar-legend-item--desktop-only">강조 상태에서 행 더블클릭 → 거래처만 보기</span>
                  <span className="erp-calendar-legend-item erp-calendar-legend-item--desktop-only">우측 전표 더블클릭 → 전표 수정</span>
                </>
              )}
            </div>

            {filteredClient && clientFilterNotice ? (
              <p className="erp-text-body mt-3 font-semibold text-sky-700">{clientFilterNotice}</p>
            ) : null}

            {filteredClient ? (
              <div className="erp-client-calendar-bottom-actions">
                <div className="erp-text-caption text-slate-500">
                  {selectedDates.length && clientFilterSelectedTotals
                    ? `${selectedDates.length}일 선택 · 매출 ${formatKRW(clientFilterSelectedTotals.bill)} · 입금 ${formatKRW(clientFilterSelectedTotals.paid)} · 미수 ${formatKRW(clientFilterSelectedTotals.unpaid)}`
                    : selectedDates.length
                      ? `${selectedDates.length}일 선택됨`
                      : "거래가 있는 날짜를 선택해 주세요."}
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-xl"
                    onClick={selectAllClientFilterDates}
                    disabled={!monthTransactionDates.length}
                  >
                    {allMonthDatesSelected ? "전체해제" : "전체선택"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="rounded-xl"
                    onClick={handleClientFilterExportStatement}
                    disabled={!selectedDates.length}
                  >
                    <FileText size={16} className="mr-1.5" />
                    시공비내역서 생성
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="rounded-xl"
                    onClick={openClientFilterPaymentConfirm}
                    disabled={!selectedDates.length}
                  >
                    <CreditCard size={16} className="mr-1.5" />
                    입금처리
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-xl border-red-200 text-red-600 hover:bg-red-50"
                    onClick={openClientFilterPaymentCancelConfirm}
                    disabled={!selectedDates.length}
                  >
                    <Undo2 size={16} className="mr-1.5" />
                    입금취소
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {selectedDate ? (
          <>
          <button
            type="button"
            className="erp-calendar-side-backdrop"
            aria-label="상세 패널 닫기"
            onClick={() => setSelectedDate("")}
          />
          <aside className="erp-calendar-side-panel" aria-label={`${selectedDate} 상세`}>
            <div className="erp-calendar-side-panel-head">
              <div className="erp-calendar-side-panel-nav">
                <button type="button" className="erp-calendar-nav-btn" onClick={() => shiftSelectedDate(-1)} aria-label="이전 날짜">
                  <ChevronLeft size={18} />
                </button>
                <strong className="erp-calendar-side-panel-date">
                  {formatCalendarDayLabel(selectedDate)}
                  {selectedDayStats && selectedDayStats.bill > 0 ? (
                    <span className="erp-calendar-side-panel-daily-sales"> · 일매출 {formatKRW(selectedDayStats.bill)}</span>
                  ) : null}
                </strong>
                <button type="button" className="erp-calendar-nav-btn" onClick={() => shiftSelectedDate(1)} aria-label="다음 날짜">
                  <ChevronRight size={18} />
                </button>
              </div>
              <Button variant="outline" size="sm" className="h-8 rounded-lg text-xs" onClick={() => setSelectedDate("")}>
                닫기
              </Button>
            </div>

            {selectedDayStats ? (
              <div className="erp-calendar-side-stats" aria-label="일자 요약">
                <div className="erp-calendar-side-stat">
                  <span className="erp-calendar-side-stat-label">인원</span>
                  <strong>{selectedDayStats.staff}명</strong>
                </div>
                <div className="erp-calendar-side-stat">
                  <span className="erp-calendar-side-stat-label">건수</span>
                  <strong>{selectedDayStats.count}건</strong>
                </div>
                <div className="erp-calendar-side-stat">
                  <span className="erp-calendar-side-stat-label">시공비합</span>
                  <strong>{formatKRW(selectedDayStats.bill)}</strong>
                </div>
                <div className="erp-calendar-side-stat">
                  <span className="erp-calendar-side-stat-label">지급</span>
                  <strong>{formatKRW(selectedDayStats.netPay)}</strong>
                </div>
                <div className={`erp-calendar-side-stat${selectedDayStats.margin < 0 ? " is-negative" : ""}`}>
                  <span className="erp-calendar-side-stat-label">마진</span>
                  <strong>{formatKRW(selectedDayStats.margin)}</strong>
                </div>
                <div className={`erp-calendar-side-stat${selectedDayStats.margin < 0 ? " is-negative" : ""}`}>
                  <span className="erp-calendar-side-stat-label">마진율</span>
                  <strong>{formatMarginRate(selectedDayStats.margin, selectedDayStats.bill)}</strong>
                </div>
              </div>
            ) : null}

            <div className="erp-calendar-side-panel-body">
              {voucherSaveMessage ? (
                <div className="erp-calendar-side-save-message mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                  {voucherSaveMessage}
                </div>
              ) : null}
              {selectedDaySales.length === 0 ? (
                <p className="erp-calendar-side-empty">해당 날짜에 등록된 전표가 없습니다.</p>
              ) : (
                <ul className="erp-calendar-side-list">
                  {selectedDaySales.map((sale) => {
                    const stats = aggregateSaleCalendarStats(sale, feeMap);
                    const workerLabel = sale.worker || formatWorkerNameSummary(getSaleWorkerLines(sale)) || "-";
                    const color = getCalendarClientColor(sale.client);
                    const unpaid = getUnpaid(sale);
                    const hasUnpaid = unpaid > 0;
                    return (
                      <li key={sale.id}>
                        <button
                          type="button"
                          className={`erp-calendar-side-card is-editable ${hasUnpaid ? "is-unpaid" : "is-paid"}${
                            !filteredClient && spotlightClient === normalizeCalendarClientName(sale.client) ? " is-client-spotlight" : ""
                          }`}
                          style={{ "--client-color": color }}
                          title={
                            filteredClient
                              ? `${hasUnpaid ? `미수 ${formatKRW(unpaid)}` : "입금완료"} · 더블클릭: 전표 수정`
                              : `${hasUnpaid ? `미수 ${formatKRW(unpaid)}` : "입금완료"} · 클릭: 같은 업체 일정 강조 · 더블클릭: 전표 수정`
                          }
                          onClick={() => {
                            if (filteredClient) return;
                            toggleSpotlightClient(sale.client, sale.date);
                          }}
                          onDoubleClick={(event) => {
                            event.stopPropagation();
                            event.preventDefault();
                            openVoucherEdit(sale);
                          }}
                        >
                          <span
                            className="erp-calendar-side-card-bar"
                            style={{ backgroundColor: color }}
                            aria-hidden="true"
                          />
                          <div className="erp-calendar-side-card-body">
                            <div className="erp-calendar-side-card-title">
                              <>
                                <span className="erp-calendar-side-card-client" style={{ "--client-color": color }}>
                                  {sale.client}
                                </span>
                                <span className="erp-calendar-side-card-title-sep"> · </span>
                                <span>{sale.site || "현장명 없음"}</span>
                              </>
                            </div>
                            <div className="erp-calendar-side-card-workers">{workerLabel}</div>
                            <div className="erp-calendar-side-card-meta">
                              <span className="erp-calendar-side-card-badge is-staff">{stats.staff}명</span>
                              <span className="erp-calendar-side-card-badge is-bill">시공비 {formatKRW(stats.bill)}</span>
                              <span className="erp-calendar-side-card-badge is-voucher">{getSaleVoucherLabel(sale)}</span>
                              <SalePaymentLinkBadge
                                saleId={sale.id}
                                autoLinkedSaleIds={autoLinkedSaleIds}
                                manualLinkedSaleIds={manualLinkedSaleIds}
                              />
                            </div>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </aside>
          </>
        ) : null}
      </div>

      {voucherDeleteConfirm ? (
        <div className="erp-ledger-modal-backdrop" onClick={() => setVoucherDeleteConfirm(null)}>
          <div className="erp-ledger-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="calendar-sale-delete-title">
            <h2 id="calendar-sale-delete-title" className="text-base font-bold text-slate-900 md:text-lg">
              전표 삭제
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              전표 {voucherDeleteConfirm.voucherNo || voucherDeleteConfirm.id} ({voucherDeleteConfirm.client} · {voucherDeleteConfirm.site})를 삭제할까요?
            </p>
            <p className="mt-4 text-sm font-semibold text-slate-700">삭제 후에는 복구할 수 없습니다.</p>
            <div className="mt-5 flex gap-2">
              <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setVoucherDeleteConfirm(null)}>
                아니오
              </Button>
              <Button className="flex-1 rounded-xl bg-red-600 hover:bg-red-700" onClick={confirmDeleteVoucherEdit}>
                삭제
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {statementModalDraft ? (
        <ClientStatementModal
          draft={statementModalDraft}
          onClose={() => setStatementModalDraft(null)}
          sales={sales}
          clientMaster={clients}
          companyProfile={companyProfile}
          statementGenerationLogs={statementGenerationLogs}
          setStatementGenerationLogs={setStatementGenerationLogs}
          statementFolders={statementFolders}
          setStatementFolders={setStatementFolders}
          currentUser={currentUser}
        />
      ) : null}

      {editingSale ? (
        <div className="erp-ledger-modal-backdrop" onClick={closeVoucherEdit}>
          <div
            className="erp-ledger-modal erp-ledger-modal--sale-edit"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="calendar-sale-edit-title"
          >
            <div className="erp-sale-form-page erp-sale-form-page--compact">
              <SaleFormCompactEditor
                title="매출전표 수정"
                desc={`${editingSale.client} · ${editingSale.site} · 시공자 ${voucherFilledWorkerCount}/${voucherForm.workers.length}명`}
                form={voucherForm}
                update={updateVoucherForm}
                updateWorkerLine={updateVoucherWorkerLine}
                addWorkerLine={addVoucherWorkerLine}
                removeWorkerLine={removeVoucherWorkerLine}
                clients={clients}
                workers={workers}
                totals={voucherFormTotals}
                filledWorkerCount={voucherFilledWorkerCount}
                canSave={canSaveVoucher}
                onSave={saveVoucherEdit}
                saveLabel="전표 저장"
                saveMessage={voucherSaveMessage}
                auditEntityId={editingSaleId}
                headerAction={(
                  <Button variant="outline" size="sm" className="h-8 rounded-lg text-xs" onClick={closeVoucherEdit}>
                    닫기
                  </Button>
                )}
                footerStartExtra={(
                  <>
                    <Button variant="outline" size="sm" className="h-8 rounded-lg text-xs" onClick={closeVoucherEdit}>
                      저장 안 하고 종료
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-lg border-red-200 text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
                      onClick={() => setVoucherDeleteConfirm(editingSale)}
                    >
                      <Trash2 size={13} />
                      전표 삭제
                    </Button>
                  </>
                )}
                onSharedMemoChange={updateVoucherSharedMemo}
                allowClientSiteUnlock
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PageTitle({ title, desc, action }) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between lg:gap-4">
      <div className="min-w-0">
        <h1 className="erp-text-page-title">{title}</h1>
        <p className="erp-text-body mt-1 text-slate-500 md:mt-2">{desc}</p>
      </div>
      {action}
    </div>
  );
}

function SimpleSalesTable({ rows, onRowClick, selectedRowId, exportFileName = "매출목록", exportTitle, isDuplicateRow, autoLinkedSaleIds = new Set(), manualLinkedSaleIds = new Set() }) {
  const title = exportTitle || exportFileName;
  return (
    <TableExportSection fileName={exportFileName} title={title} disabled={rows.length === 0}>
      <MobileRecordList>
        {rows.length ? (
          rows.map((row) => {
            const isSelected = selectedRowId != null && row.id === selectedRowId;
            const isDuplicate = isDuplicateRow?.(row);
            return (
              <MobileRecordCard
                key={row.id}
                title={row.client}
                subtitle={`${row.date} · ${row.site}${isDuplicate ? " · 중복" : ""}`}
                selected={isSelected}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                fields={[
                  { label: "매출액", value: formatKRW(getSaleTotalBill(row)) },
                  { label: "입금", value: formatKRW(row.paid), tone: "success" },
                  { label: "미수", value: formatKRW(getUnpaid(row)), tone: "danger" },
                  { label: "시공자", value: row.worker || "-", tone: "muted" },
                  ...(isSaleAutoLinkedPaid(row.id, autoLinkedSaleIds)
                    ? [{ label: "입금연결", value: "자동입금", tone: "default" as const }]
                    : isSaleManualLinkedPaid(row.id, manualLinkedSaleIds)
                      ? [{ label: "입금연결", value: "건별입금", tone: "default" as const }]
                      : []),
                ]}
              />
            );
          })
        ) : (
          <MobileRecordCard empty emptyLabel="표시할 매출이 없습니다." />
        )}
      </MobileRecordList>
      <DesktopTableWrap>
        <table className="erp-table erp-table--md">
        <thead>
          <tr>
            <th className="text-left">일자</th>
            <th className="text-left">거래처</th>
            <th className="text-left">현장</th>
            <th className="hidden text-left md:table-cell">시공자</th>
            <th className="text-right">매출액</th>
            <th className="text-right">입금</th>
            <th className="text-right">미수</th>
            <th className="hidden text-left xl:table-cell">등록자</th>
            <th className="hidden text-left xl:table-cell">등록일시</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isSelected = selectedRowId != null && row.id === selectedRowId;
            const isDuplicate = isDuplicateRow?.(row);
            return (
            <tr
              key={row.id}
              onClick={() => onRowClick?.(row)}
              className={`hover:bg-slate-50 ${onRowClick ? "cursor-pointer" : ""} ${isSelected ? "bg-sky-50 ring-1 ring-inset ring-sky-200" : ""} ${isDuplicate && !isSelected ? "bg-amber-50/80 ring-1 ring-inset ring-amber-200" : ""}`}
            >
              <td className="whitespace-nowrap">
                {row.date}
                {isDuplicate ? <span className="erp-duplicate-badge">중복</span> : null}
                <SalePaymentLinkBadge
                  saleId={row.id}
                  autoLinkedSaleIds={autoLinkedSaleIds}
                  manualLinkedSaleIds={manualLinkedSaleIds}
                />
              </td>
              <td className="font-semibold"><span className="erp-cell-truncate inline-block max-w-[7rem] md:max-w-none">{row.client}</span></td>
              <td><span className="erp-cell-truncate inline-block max-w-[8rem] md:max-w-none">{row.site}</span></td>
              <td className="hidden md:table-cell"><span className="erp-cell-truncate inline-block">{row.worker}</span></td>
              <td className="text-right font-bold whitespace-nowrap">{formatKRW(getSaleTotalBill(row))}</td>
              <td className="text-right text-emerald-600 whitespace-nowrap">{formatKRW(row.paid)}</td>
              <td className="text-right text-red-600 font-bold whitespace-nowrap">{formatKRW(getUnpaid(row))}</td>
              <td className="hidden xl:table-cell">{row.createdBy || "-"}</td>
              <td className="hidden whitespace-nowrap xl:table-cell">{formatDateTime(row.createdAt)}</td>
            </tr>
            );
          })}
        </tbody>
      </table>
      </DesktopTableWrap>
    </TableExportSection>
  );
}

function SalesRegistrationPage({ sales = [], setSales, setActive, clients, workers, currentUser }) {
  const { recordAudit } = useAudit();
  const salesRef = useRef(sales);
  const [form, setForm] = useState(() => compactSaleForm());
  const { message: saveMessage, setMessage: setSaveMessage, clearMessage: clearSaveMessage } = useSaveMessage();
  const [duplicateConfirm, setDuplicateConfirm] = useState(null);

  useEffect(() => {
    salesRef.current = sales;
  }, [sales]);
  const update = (key, value) => {
    clearSaveMessage();
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateSharedMemo = (value) => {
    clearSaveMessage();
    setForm((prev) => {
      const previousCommon = String(prev.memo || "").trim();
      return {
        ...prev,
        memo: value,
        workers: prev.workers.map((line) => {
          const lineMemo = String(line.memo || "").trim();
          if (lineMemo && lineMemo !== previousCommon) return line;
          return { ...line, memo: value };
        }),
      };
    });
  };

  const updateWorkerLine = (index, key, value) => {
    clearSaveMessage();
    setForm((prev) => ({
      ...prev,
      workers: prev.workers.map((line, lineIndex) => {
        if (lineIndex !== index) return line;
        let nextLine = applyWorkerLineFieldUpdate(line, key, value);
        if (key === "worker") {
          const selectedWorker = findActiveWorkerByName(workers, value);
          const selectedClient = clients.find((client) => client.name === prev.client);
          nextLine.quantity = nextLine.quantity || "1";
          nextLine.unitCost = selectedWorker?.constructionCost ? String(selectedWorker.constructionCost) : nextLine.unitCost;
          nextLine.chargeAmount = selectedWorker?.customChargeCost ? String(selectedWorker.customChargeCost) : selectedClient?.constructionCost ? String(selectedClient.constructionCost) : nextLine.chargeAmount;
          nextLine.overtimeCost = selectedClient?.overtimeCost ? String(selectedClient.overtimeCost) : selectedWorker?.overtimeCost ? String(selectedWorker.overtimeCost) : nextLine.overtimeCost || "30000";
          nextLine.feeRate = selectedWorker?.feeRate ?? nextLine.feeRate ?? "";
          nextLine = stripWorkerLineComputedMetrics(nextLine);
        }
        return nextLine;
      }),
    }));
  };

  const addWorkerLine = () => setForm((prev) => ({
    ...prev,
    workers: [...prev.workers, { ...createWorkerLine(prev.workers.length), memo: prev.memo || "" }],
  }));
  const removeWorkerLine = (index) => setForm((prev) => ({ ...prev, workers: prev.workers.length <= 1 ? prev.workers : prev.workers.filter((_, lineIndex) => lineIndex !== index) }));

  const totals = useMemo(() => sumWorkerFormTotals(form.workers, workers), [form.workers, workers]);
  const filledWorkerCount = useMemo(
    () => form.workers.filter((line) => String(line.worker || "").trim()).length,
    [form.workers]
  );
  const canSave = Boolean(
    form.client.trim()
    && form.site.trim()
    && totals.bill > 0
    && isSaleFormMasterRefsValid(form, clients, workers)
  );

  const commitSave = (payload) => {
    const { id: newId, voucherNo } = allocateNextSaleRecordIds(salesRef.current);
    recordAudit({
      entityType: "sale",
      entityId: newId,
      entityLabel: `${payload.client} · ${payload.site}`,
      screen: "매출등록",
      action: "create",
      after: snapshotSaleForAudit({ ...payload, id: newId, voucherNo }),
      fields: SALE_AUDIT_FIELDS,
      user: currentUser,
    });
    setSales((prev) => [{
      id: newId,
      voucherNo,
      ...payload,
      paid: 0,
      basePaid: 0,
    }, ...prev]);
    setForm(compactSaleForm());
    setSaveMessage(`${payload.client} · ${payload.site} 매출이 저장되었습니다. 계속 등록할 수 있습니다.`);
    setDuplicateConfirm(null);
  };

  const saveNewSale = () => {
    const masterRefError = validateSaleFormMasterRefs(form, clients, workers);
    if (masterRefError) {
      setSaveMessage(masterRefError);
      return;
    }

    const payload = buildSaleFromForm(form, currentUser, workers);
    if (!payload.client || !payload.site || payload.amount <= 0) return;

    const duplicates = findSalesWithSameClientWorkerDate(salesRef.current, payload);
    if (duplicates.length > 0) {
      const workerNames = getSaleWorkerLines(payload)
        .map((line) => String(line.worker || "").trim())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, "ko"))
        .join(", ");
      const existingSites = [...new Set(duplicates.map((row) => String(row.site || "").trim()).filter(Boolean))].join(", ");
      setDuplicateConfirm({ payload, workerNames, existingSites });
      return;
    }

    commitSave(payload);
  };

  const confirmDuplicateSave = () => {
    if (!duplicateConfirm?.payload) return;
    commitSave(duplicateConfirm.payload);
  };

  const resetForm = () => {
    clearSaveMessage();
    setDuplicateConfirm(null);
    setForm(compactSaleForm());
  };

  return (
    <div className="erp-page erp-sale-form-page erp-sale-form-page--compact">
      {duplicateConfirm ? (
        <div className="erp-ledger-modal-backdrop" onClick={() => setDuplicateConfirm(null)}>
          <div className="erp-ledger-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="sale-duplicate-title">
            <h2 id="sale-duplicate-title" className="text-base font-bold text-slate-900 md:text-lg">
              중복 전표 확인
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              같은 일자·거래처·시공자 전표가 이미 있습니다.
            </p>
            <div className="mt-4 space-y-1 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <div>일자: {duplicateConfirm.payload.date}</div>
              <div>거래처: {duplicateConfirm.payload.client}</div>
              <div>시공자: {duplicateConfirm.workerNames || "-"}</div>
              {duplicateConfirm.existingSites ? <div>기존 현장: {duplicateConfirm.existingSites}</div> : null}
            </div>
            <p className="mt-4 text-sm font-semibold text-slate-700">그래도 저장하시겠습니까?</p>
            <div className="mt-5 flex gap-2">
              <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setDuplicateConfirm(null)}>
                아니오
              </Button>
              <Button className="flex-1 rounded-xl" onClick={confirmDuplicateSave}>
                예, 저장
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      <SaleFormCompactEditor
        title="매출등록"
        form={form}
        update={update}
        updateWorkerLine={updateWorkerLine}
        addWorkerLine={addWorkerLine}
        removeWorkerLine={removeWorkerLine}
        clients={clients}
        workers={filterActiveWorkers(workers)}
        totals={totals}
        filledWorkerCount={filledWorkerCount}
        canSave={canSave}
        onSave={saveNewSale}
        onReset={resetForm}
        saveLabel="매출 저장"
        saveMessage={saveMessage}
        showPaidField={false}
        memoAfterWorkers={true}
        onSharedMemoChange={updateSharedMemo}
      />
    </div>
  );
}

function SearchBox({ query, setQuery, placeholder }) {
  return (
    <div className="flex max-w-xl items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm border">
      <Search size={18} className="text-slate-400" />
      <input lang="ko" className="erp-input w-full bg-transparent outline-none" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

const emptyVoucherSearchFilters = { client: "", site: "", worker: "" };

function SalesVoucherSearchPage({ sales, setSales, clients, workers, currentUser, setPaymentVouchers, pendingVoucherId, pendingSearchFilter, onPendingVoucherConsumed, onPendingSearchConsumed, autoLinkedSaleIds = new Set(), manualLinkedSaleIds = new Set() }) {
  const { recordAudit } = useAudit();
  const [searchFilters, setSearchFilters] = useState(emptyVoucherSearchFilters);
  const [dateFilter, setDateFilter] = useState({ startDate: "", endDate: "" });
  const [selectedRowId, setSelectedRowId] = useState(null);
  const [form, setForm] = useState(emptySaleForm);
  const { message: saveMessage, setMessage: setSaveMessage, clearMessage: clearSaveMessage } = useSaveMessage();
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const duplicateIndex = useMemo(() => buildSaleDuplicateIndex(sales), [sales]);
  const isDuplicateRow = (row) => isDuplicateSale(row, duplicateIndex.duplicateKeys);
  const matchedRows = useMemo(() => {
    return filterSalesVoucherRows(sales, searchFilters, dateFilter).sort((a, b) => {
      const dateCompare = String(b.date || "").localeCompare(String(a.date || ""));
      if (dateCompare !== 0) return dateCompare;
      return Number(b.id || 0) - Number(a.id || 0);
    });
  }, [sales, searchFilters, dateFilter]);
  const matchedDuplicateCount = useMemo(
    () => matchedRows.filter((row) => isDuplicateRow(row)).length,
    [matchedRows, duplicateIndex.duplicateKeys]
  );
  const selectedRow = sales.find((row) => row.id === selectedRowId);

  const update = (key, value) => {
    clearSaveMessage();
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateSharedMemo = (value) => {
    clearSaveMessage();
    setForm((prev) => {
      const previousCommon = String(prev.memo || "").trim();
      return {
        ...prev,
        memo: value,
        workers: prev.workers.map((line) => {
          const lineMemo = String(line.memo || "").trim();
          if (lineMemo && lineMemo !== previousCommon) return line;
          return { ...line, memo: value };
        }),
      };
    });
  };

  const closeEditor = () => {
    setSelectedRowId(null);
    setForm(emptySaleForm);
    clearSaveMessage();
    setDeleteConfirm(null);
  };

  const openVoucher = (row) => {
    setSelectedRowId(row.id);
    clearSaveMessage();
    setForm(saleRowToForm(row));
  };

  useEffect(() => {
    if (pendingVoucherId == null) return;
    const row = sales.find((item) => item.id === pendingVoucherId);
    if (!row) {
      onPendingVoucherConsumed?.();
      return;
    }
    setSearchFilters(emptyVoucherSearchFilters);
    setDateFilter({ startDate: row.date || "", endDate: row.date || "" });
    openVoucher(row);
    onPendingVoucherConsumed?.();
  }, [pendingVoucherId, sales, onPendingVoucherConsumed]);

  useEffect(() => {
    if (!pendingSearchFilter) return;
    setSearchFilters({
      client: pendingSearchFilter.client || "",
      site: "",
      worker: "",
    });
    setDateFilter({
      startDate: pendingSearchFilter.startDate || "",
      endDate: pendingSearchFilter.endDate || pendingSearchFilter.startDate || "",
    });
    closeEditor();
    onPendingSearchConsumed?.();
  }, [pendingSearchFilter, onPendingSearchConsumed]);

  const updateWorkerLine = (index, key, value) => {
    clearSaveMessage();
    setForm((prev) => ({
      ...prev,
      workers: prev.workers.map((line, lineIndex) => {
        if (lineIndex !== index) return line;
        let nextLine = applyWorkerLineFieldUpdate(line, key, value);
        if (key === "worker") {
          const selectedWorker = findActiveWorkerByName(workers, value);
          const selectedClient = clients.find((client) => client.name === prev.client);
          nextLine.quantity = nextLine.quantity || "1";
          nextLine.unitCost = selectedWorker?.constructionCost ? String(selectedWorker.constructionCost) : nextLine.unitCost;
          nextLine.chargeAmount = selectedWorker?.customChargeCost ? String(selectedWorker.customChargeCost) : selectedClient?.constructionCost ? String(selectedClient.constructionCost) : nextLine.chargeAmount;
          nextLine.overtimeCost = selectedClient?.overtimeCost ? String(selectedClient.overtimeCost) : selectedWorker?.overtimeCost ? String(selectedWorker.overtimeCost) : nextLine.overtimeCost || "30000";
          nextLine.feeRate = selectedWorker?.feeRate ?? nextLine.feeRate ?? "";
          nextLine = stripWorkerLineComputedMetrics(nextLine);
        }
        return nextLine;
      }),
    }));
  };

  const addWorkerLine = () => setForm((prev) => ({
    ...prev,
    workers: [...prev.workers, { ...createWorkerLine(prev.workers.length), memo: prev.memo || "" }],
  }));
  const removeWorkerLine = (index) => setForm((prev) => ({ ...prev, workers: prev.workers.length <= 1 ? prev.workers : prev.workers.filter((_, lineIndex) => lineIndex !== index) }));

  const formTotals = useMemo(() => sumWorkerFormTotals(form.workers, workers), [form.workers, workers]);
  const filledWorkerCount = useMemo(
    () => form.workers.filter((line) => String(line.worker || "").trim()).length,
    [form.workers]
  );
  const canSave = Boolean(
    form.client.trim()
    && form.site.trim()
    && formTotals.bill > 0
    && isSaleFormMasterRefsValid(form, clients, workers)
  );

  const saveVoucher = () => {
    if (!selectedRow) return;
    const masterRefError = validateSaleFormMasterRefs(form, clients, workers);
    if (masterRefError) {
      setSaveMessage(masterRefError);
      return;
    }
    const payload = buildSaleFromForm(form, currentUser, workers);
    if (!payload.client || !payload.site || payload.amount <= 0) return;

    recordAudit({
      entityType: "sale",
      entityId: selectedRow.id,
      entityLabel: `${payload.client} · ${payload.site}`,
      screen: "매출전표검색",
      action: "update",
      before: snapshotSaleForAudit(selectedRow),
      after: snapshotSaleForAudit({ ...selectedRow, ...payload }),
      fields: SALE_AUDIT_FIELDS,
      user: currentUser,
    });

    setSales((prev) => prev.map((row) => row.id === selectedRow.id ? { ...row, ...payload, createdBy: row.createdBy, createdByEmail: row.createdByEmail, createdAt: row.createdAt } : row));
    if (setPaymentVouchers && (payload.client !== selectedRow.client || payload.site !== selectedRow.site)) {
      setPaymentVouchers((prev) => syncLinkedPaymentVouchersForSale(prev, selectedRow.id, { client: payload.client, site: payload.site }));
    }
    setSaveMessage(`${payload.client} · ${payload.site} 전표가 저장되었습니다.`);
    setSelectedRowId(null);
    setForm(emptySaleForm);
  };

  const confirmDeleteVoucher = () => {
    if (!deleteConfirm) return;
    const sale = deleteConfirm;

    recordAudit({
      entityType: "sale",
      entityId: sale.id,
      entityLabel: `${sale.client} · ${sale.site}`,
      screen: "매출전표검색",
      action: "delete",
      before: snapshotSaleForAudit(sale),
      fields: SALE_AUDIT_FIELDS,
      user: currentUser,
    });

    setSales((prev) => prev.filter((row) => row.id !== sale.id));
    setDeleteConfirm(null);
    setSelectedRowId(null);
    setForm(emptySaleForm);
    setSaveMessage(`전표 ${sale.voucherNo || sale.id} (${sale.client} · ${sale.site})가 삭제되었습니다.`);
  };

  return (
    <div className={`erp-page erp-sales-sheet-page ${selectedRow ? "erp-sale-form-page erp-sale-form-page--compact" : ""}`}>
      {deleteConfirm ? (
        <div className="erp-ledger-modal-backdrop" onClick={() => setDeleteConfirm(null)}>
          <div className="erp-ledger-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="sale-delete-title">
            <h2 id="sale-delete-title" className="text-base font-bold text-slate-900 md:text-lg">
              전표 삭제
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              전표 {deleteConfirm.voucherNo || deleteConfirm.id} ({deleteConfirm.client} · {deleteConfirm.site})를 삭제할까요?
            </p>
            <p className="mt-4 text-sm font-semibold text-slate-700">삭제 후에는 복구할 수 없습니다.</p>
            <div className="mt-5 flex gap-2">
              <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setDeleteConfirm(null)}>
                아니오
              </Button>
              <Button className="flex-1 rounded-xl bg-red-600 hover:bg-red-700" onClick={confirmDeleteVoucher}>
                삭제
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      {selectedRow ? (
        <SaleFormCompactEditor
          title="매출전표 수정"
          desc={`${selectedRow.client} · ${selectedRow.site} · 시공자 ${filledWorkerCount}/${form.workers.length}명`}
          form={form}
          update={update}
          updateWorkerLine={updateWorkerLine}
          addWorkerLine={addWorkerLine}
          removeWorkerLine={removeWorkerLine}
          clients={clients}
          workers={workers}
          totals={formTotals}
          filledWorkerCount={filledWorkerCount}
          canSave={canSave}
          onSave={saveVoucher}
          saveLabel="전표 저장"
          saveMessage={saveMessage}
          auditEntityId={selectedRowId}
          headerAction={(
            <Button variant="outline" size="sm" className="h-8 rounded-lg text-xs" onClick={closeEditor}>
              닫기
            </Button>
          )}
          footerStartExtra={(
            <>
              <Button variant="outline" size="sm" className="h-8 rounded-lg text-xs" onClick={closeEditor}>
                저장 안 하고 종료
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-lg border-red-200 text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
                onClick={() => setDeleteConfirm(selectedRow)}
              >
                <Trash2 size={13} />
                전표 삭제
              </Button>
            </>
          )}
          onSharedMemoChange={updateSharedMemo}
          allowClientSiteUnlock
        />
      ) : (
        <PageTitle title="매출전표검색" desc="전표를 클릭해 열고, 매출등록과 같은 화면에서 수정합니다." />
      )}

      {saveMessage && !selectedRow && (
        <div className="erp-sale-form-footer-status mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5">
          <CheckCircle2 size={14} className="text-emerald-600" />
          <span className="text-emerald-700">{saveMessage}</span>
        </div>
      )}

      <div className="erp-sales-voucher-search mb-3">
        <div className="erp-sales-voucher-search-fields">
          <label className="erp-sales-voucher-search-field">
            <span className="erp-text-caption font-semibold text-slate-500">거래처</span>
            <input
              lang="ko"
              className="erp-input erp-input-compact w-full"
              value={searchFilters.client}
              onChange={(e) => setSearchFilters((prev) => ({ ...prev, client: e.target.value }))}
              placeholder="거래처명"
            />
          </label>
          <label className="erp-sales-voucher-search-field">
            <span className="erp-text-caption font-semibold text-slate-500">현장</span>
            <input
              lang="ko"
              className="erp-input erp-input-compact w-full"
              value={searchFilters.site}
              onChange={(e) => setSearchFilters((prev) => ({ ...prev, site: e.target.value }))}
              placeholder="현장명"
            />
          </label>
          <label className="erp-sales-voucher-search-field">
            <span className="erp-text-caption font-semibold text-slate-500">시공자</span>
            <input
              lang="ko"
              className="erp-input erp-input-compact w-full"
              value={searchFilters.worker}
              onChange={(e) => setSearchFilters((prev) => ({ ...prev, worker: e.target.value }))}
              placeholder="시공자명"
            />
          </label>
        </div>
        <p className="erp-text-caption mt-2 text-slate-500">
          거래처 · 현장 · 시공자 · 기간 조건을 <strong className="font-semibold text-slate-600">모두</strong> 만족하는 전표만 표시합니다.
        </p>
        <div className="erp-sales-sheet-toolbar erp-sales-voucher-search-toolbar">
          <KoreanDateInput
            className="erp-input-compact"
            value={dateFilter.startDate}
            onChange={(e) => setDateFilter((prev) => ({ ...prev, startDate: e.target.value }))}
            aria-label="검색 시작일"
          />
          <span className="erp-text-caption text-slate-400">~</span>
          <KoreanDateInput
            className="erp-input-compact"
            value={dateFilter.endDate}
            onChange={(e) => setDateFilter((prev) => ({ ...prev, endDate: e.target.value }))}
            aria-label="검색 종료일"
          />
          <Button
            variant="outline"
            size="sm"
            className="rounded-lg"
            onClick={() => {
              setSearchFilters(emptyVoucherSearchFilters);
              setDateFilter({ startDate: "", endDate: "" });
            }}
          >
            초기화
          </Button>
          {matchedDuplicateCount > 0 ? (
            <span className="erp-text-caption font-semibold text-amber-700">중복 {matchedDuplicateCount}건</span>
          ) : null}
          <span className="erp-text-caption ml-auto font-semibold text-slate-500">{matchedRows.length}건</span>
        </div>
      </div>
      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-4 md:p-5">
          {selectedRow && (
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-bold text-slate-700">전표 목록</h2>
              <span className="text-xs text-slate-400">{matchedRows.length}건 · 다른 전표 클릭 시 바로 전환</span>
            </div>
          )}
          <SimpleSalesTable
            rows={matchedRows}
            onRowClick={openVoucher}
            selectedRowId={selectedRowId}
            exportFileName="매출전표검색"
            exportTitle="매출전표 검색"
            isDuplicateRow={isDuplicateRow}
            autoLinkedSaleIds={autoLinkedSaleIds}
            manualLinkedSaleIds={manualLinkedSaleIds}
          />
        </CardContent>
      </Card>
    </div>
  );
}


function daysSinceClientSaleDate(dateStr: string) {
  const saleDate = new Date(`${dateStr}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (Number.isNaN(saleDate.getTime())) return Number.POSITIVE_INFINITY;
  return Math.floor((today.getTime() - saleDate.getTime()) / (1000 * 60 * 60 * 24));
}

function getClientActivityTone(lastSaleDate?: string | null) {
  if (!lastSaleDate) return "red";
  const days = daysSinceClientSaleDate(lastSaleDate);
  if (days <= 30) return "green";
  if (days <= 90) return "yellow";
  return "red";
}

function getClientActivityLabel(tone: "green" | "yellow" | "red") {
  if (tone === "green") return "최근 1개월 내 거래";
  if (tone === "yellow") return "최근 2~3개월 내 거래";
  return "최근 3개월 거래 없음";
}

function ClientActivityIcon({ lastSaleDate }: { lastSaleDate?: string }) {
  const tone = getClientActivityTone(lastSaleDate);
  const label = getClientActivityLabel(tone);
  return (
    <span className={`erp-client-activity-icon is-${tone} erp-table-export-skip`} title={label} aria-label={label}>
      <Circle size={10} fill="currentColor" strokeWidth={0} />
    </span>
  );
}

function ClientsPage({ clients, setClients, sales = [], companyProfile }) {
  const { recordAudit } = useAudit();
  const emptyClientForm = {
    name: "",
    businessNo: "",
    manager: "",
    phone: "",
    constructionCost: "",
    overtimeCost: "30000",
    vat: "Y",
    mealIncluded: "Y",
    depositNameAliases: "",
    memo: "",
  };

  const [form, setForm] = useState(emptyClientForm);
  const [editingId, setEditingId] = useState(null);
  const [query, setQuery] = useState("");
  const [formError, setFormError] = useState("");

  const filteredClients = useMemo(
    () => clients.filter((client) => Object.values(client).join(" ").toLowerCase().includes(query.toLowerCase())),
    [clients, query]
  );

  const sortedClients = useMemo(() => {
    const salesByClient = new Map();
    for (const sale of sales) {
      const name = String(sale.client || "").trim();
      if (!name) continue;
      salesByClient.set(name, (salesByClient.get(name) || 0) + getSaleTotalBill(sale));
    }
    return [...filteredClients].sort((a, b) => {
      const diff = (salesByClient.get(b.name) || 0) - (salesByClient.get(a.name) || 0);
      return diff || String(a.name || "").localeCompare(String(b.name || ""), "ko");
    });
  }, [filteredClients, sales]);

  const clientLastSaleDate = useMemo(() => buildClientLastSaleDateMap(sales), [sales]);

  const updateForm = (key, value) => {
    setFormError("");
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const saveClient = () => {
    const name = form.name.trim();
    if (!name) {
      setFormError("거래처명을 입력해 주세요.");
      return;
    }

    const constructionCostRaw = String(form.constructionCost ?? "").trim();
    if (!constructionCostRaw) {
      setFormError("시공비를 입력해 주세요.");
      return;
    }
    const constructionCost = parseMoney(constructionCostRaw);
    if (!Number.isFinite(constructionCost) || constructionCost < 0) {
      setFormError("시공비를 올바르게 입력해 주세요.");
      return;
    }

    const duplicateClient = clients.find(
      (client) => String(client.name || "").trim() === name && client.id !== editingId
    );
    if (duplicateClient) {
      setFormError("이미 등록된 거래처명입니다. 다른 이름을 사용해 주세요.");
      return;
    }

    const existingClient = editingId ? clients.find((client) => client.id === editingId) : null;
    const payload = {
      id: editingId || Date.now(),
      name,
      businessNo: form.businessNo.trim(),
      manager: form.manager.trim(),
      phone: form.phone.trim(),
      constructionCost,
      customChargeCost: parseMoney(form.customChargeCost || form.constructionCost),
      chargeCost: parseMoney(form.chargeCost || form.constructionCost),
      overtimeCost: parseMoney(form.overtimeCost),
      vat: form.vat,
      mealIncluded: form.mealIncluded,
      depositNameAliases: form.depositNameAliases.trim(),
      memo: form.memo.trim(),
    };

    recordAudit({
      entityType: "client",
      entityId: payload.id,
      entityLabel: payload.name,
      screen: "거래처",
      action: editingId ? "update" : "create",
      before: existingClient ? snapshotClientForAudit(existingClient) : undefined,
      after: snapshotClientForAudit(payload),
      fields: CLIENT_AUDIT_FIELDS,
    });

    setClients((prev) => editingId ? prev.map((client) => client.id === editingId ? payload : client) : [payload, ...prev]);

    setForm(emptyClientForm);
    setEditingId(null);
    setFormError("");
  };

  const editClient = (client) => {
    setFormError("");
    setEditingId(client.id);
    setForm({
      name: client.name || "",
      businessNo: client.businessNo || "",
      manager: client.manager || "",
      phone: client.phone || "",
      constructionCost: String(client.constructionCost || ""),
      customChargeCost: String(client.customChargeCost || client.chargeCost || ""),
      overtimeCost: String(client.overtimeCost || "30000"),
      vat: client.vat || "Y",
      mealIncluded: client.mealIncluded || "Y",
      depositNameAliases: client.depositNameAliases || "",
      memo: client.memo || "",
    });
  };

  const deleteClient = (id) => {
    const client = clients.find((item) => item.id === id);
    if (!client) return;
    if (!confirmDelete(`거래처 "${client.name}"을(를) 삭제할까요?`)) return;

    recordAudit({
        entityType: "client",
        entityId: id,
        entityLabel: client.name,
        screen: "거래처",
        action: "delete",
        before: snapshotClientForAudit(client),
        fields: CLIENT_AUDIT_FIELDS,
    });
    setClients((prev) => prev.filter((item) => item.id !== id));
  };

  return (
    <div className="erp-page">
      <PageTitle title="거래처" desc="엑셀 거래처정보 시트를 기준으로 거래처를 관리합니다." />

      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <AuditField label="거래처명" entityType="client" entityId={editingId} field="name"><Input value={form.name} onChange={(e) => updateForm("name", e.target.value)} placeholder="거래처명 (필수)" required /></AuditField>
            <AuditField label="사업자번호" entityType="client" entityId={editingId} field="businessNo"><Input value={form.businessNo} onChange={(e) => updateForm("businessNo", e.target.value)} placeholder="사업자번호" /></AuditField>
            <AuditField label="담당자" entityType="client" entityId={editingId} field="manager"><Input value={form.manager} onChange={(e) => updateForm("manager", e.target.value)} placeholder="담당자" /></AuditField>
            <AuditField label="연락처" entityType="client" entityId={editingId} field="phone"><Input value={form.phone} onChange={(e) => updateForm("phone", e.target.value)} placeholder="연락처" /></AuditField>
            <AuditField label="시공비" entityType="client" entityId={editingId} field="constructionCost"><Input inputMode="numeric" value={form.constructionCost} onChange={(e) => updateForm("constructionCost", e.target.value)} placeholder="시공비 (필수)" required /></AuditField>
            <AuditField label="개별청구단가(선택)" entityType="client" entityId={editingId} field="customChargeCost"><Input inputMode="numeric" value={form.customChargeCost} onChange={(e) => updateForm("customChargeCost", e.target.value)} placeholder="특정 시공자만 별도 청구시 입력" /></AuditField>
            <AuditField label="야근비" entityType="client" entityId={editingId} field="overtimeCost"><Input inputMode="numeric" value={form.overtimeCost} onChange={(e) => updateForm("overtimeCost", e.target.value)} placeholder="야근비" /></AuditField>
            <AuditField label="부가세" entityType="client" entityId={editingId} field="vat">
              <select
                className="erp-input w-full rounded-xl px-3 py-2 text-sm font-semibold"
                value={form.vat}
                onChange={(e) => updateForm("vat", e.target.value)}
              >
                {YES_NO_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </AuditField>
            <AuditField label="식대" entityType="client" entityId={editingId} field="mealIncluded">
              <select
                className="erp-input w-full rounded-xl px-3 py-2 text-sm font-semibold"
                value={form.mealIncluded}
                onChange={(e) => updateForm("mealIncluded", e.target.value)}
              >
                {YES_NO_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </AuditField>
            <div className="md:col-span-2">
              <AuditField label="예금주 별칭" entityType="client" entityId={editingId} field="depositNameAliases">
                <Input value={form.depositNameAliases} onChange={(e) => updateForm("depositNameAliases", e.target.value)} placeholder="통장 입금 시 표시 이름 (쉼표로 구분). 담당자명은 자동 매칭됩니다." />
              </AuditField>
            </div>
            <div className="md:col-span-4">
              <AuditField label="비고" entityType="client" entityId={editingId} field="memo">
                <Input value={form.memo} onChange={(e) => updateForm("memo", e.target.value)} placeholder="거래처 비고" />
              </AuditField>
            </div>
          </div>

          <div className="mt-5 flex flex-col items-end gap-2 sm:flex-row sm:justify-end">
            {formError ? <p className="mr-auto erp-text-caption font-semibold text-red-600">{formError}</p> : null}
            <Button variant="outline" className="rounded-2xl" onClick={() => { setForm(emptyClientForm); setEditingId(null); setFormError(""); }}>초기화</Button>
            <Button className="rounded-2xl" onClick={saveClient}>{editingId ? "거래처 수정" : "거래처 저장"}</Button>
          </div>
        </CardContent>
      </Card>

      <SearchBox query={query} setQuery={setQuery} placeholder="거래처명, 담당자, 연락처, 예금주 별칭 검색" />

      <p className="erp-text-caption erp-client-activity-legend mb-3 flex flex-wrap items-center gap-3 text-slate-500">
        <span className="inline-flex items-center gap-1"><Circle size={10} fill="currentColor" strokeWidth={0} className="text-emerald-500" /> 1개월 내 거래</span>
        <span className="inline-flex items-center gap-1"><Circle size={10} fill="currentColor" strokeWidth={0} className="text-amber-500" /> 2~3개월 내 거래</span>
        <span className="inline-flex items-center gap-1"><Circle size={10} fill="currentColor" strokeWidth={0} className="text-red-500" /> 3개월 이상 거래 없음</span>
      </p>

      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-4 md:p-5">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <h2 className="erp-text-section">거래처 목록</h2>
            <ClientListExport
              clients={sortedClients}
              lastSaleByClient={clientLastSaleDate}
              companyProfile={companyProfile}
              disabled={sortedClients.length === 0}
            />
          </div>
          <div className="erp-table-wrap">
            <table className="erp-table erp-table--lg">
              <thead className="bg-slate-100 text-slate-600">
                <tr>
                  <th className="text-left">거래처명</th>
                  <th className="text-left">사업자번호</th>
                  <th className="text-left">담당자</th>
                  <th className="text-left">연락처</th>
                  <th className="text-right">시공비</th>
                  <th className="text-right">야근비</th>
                  <th className="text-center">부가세</th>
                  <th className="text-center">식대</th>
                  <th className="text-left">예금주 별칭</th>
                  <th className="text-left">비고</th>
                  <th className="text-center erp-table-export-skip">관리</th>
                </tr>
              </thead>
              <tbody>
                {sortedClients.map((client) => (
                  <tr key={client.id} className="border-t hover:bg-slate-50">
                    <td className="font-bold text-left">
                      <span className="inline-flex items-center gap-1.5">
                        <ClientActivityIcon lastSaleDate={clientLastSaleDate.get(client.name)} />
                        {client.name}
                      </span>
                    </td>
                    <td>{client.businessNo || "-"}</td>
                    <td>{client.manager || "-"}</td>
                    <td>{client.phone || "-"}</td>
                    <td className="text-right font-semibold">{formatKRW(client.constructionCost)}</td>
                    <td className="text-right">{formatKRW(client.overtimeCost)}</td>
                    <td className="text-center">{client.vat}</td>
                    <td className="text-center">{client.mealIncluded}</td>
                    <td className="max-w-[180px] truncate text-slate-600" title={formatDepositNameAliases(client.depositNameAliases)}>
                      {formatDepositNameAliases(client.depositNameAliases) || "-"}
                    </td>
                    <td>{client.memo || "-"}</td>
                    <td className="erp-table-export-skip">
                      <div className="flex justify-center gap-2">
                        <Button size="sm" variant="outline" className="rounded-xl" onClick={() => editClient(client)}><Pencil size={14} /></Button>
                        <Button size="sm" className="rounded-xl bg-red-600 hover:bg-red-700" onClick={() => deleteClient(client.id)}><Trash2 size={14} /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function WorkerStatusBadge({ active }: { active: boolean }) {
  return (
    <span className={`erp-worker-status-badge ${active ? "is-active" : "is-inactive"}`}>
      {active ? "활성" : "비활성"}
    </span>
  );
}

function WorkerCategorySelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const category = normalizeWorkerCategory(value);
  return (
    <select
      className={`erp-worker-category-select is-${category === "외주" ? "outsource" : "team"}`}
      value={category}
      onChange={(e) => onChange(e.target.value)}
    >
      {WORKER_CATEGORY_OPTIONS.map((option) => (
        <option key={option} value={option}>{option}</option>
      ))}
    </select>
  );
}

function WorkerGradeSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const grade = normalizeWorkerGrade(value);
  return (
    <select
      className={`erp-worker-grade-select${grade ? ` is-${grade.toLowerCase()}` : " is-empty"}`}
      value={grade}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">-</option>
      {WORKER_GRADE_OPTIONS.map((option) => (
        <option key={option} value={option}>{option}</option>
      ))}
    </select>
  );
}

function WorkerListSortHeader({
  label,
  column,
  sort,
  onSort,
  align = "left",
}: {
  label: string;
  column: WorkerListSortColumn;
  sort: { column: WorkerListSortColumn | null; direction: SortDirection };
  onSort: (column: WorkerListSortColumn) => void;
  align?: "left" | "center";
}) {
  const isActive = sort.column === column;
  const SortIcon = !isActive ? ArrowUpDown : sort.direction === "asc" ? ArrowUp : ArrowDown;
  const alignClass = align === "center" ? "text-center" : "text-left";

  return (
    <th className={alignClass}>
      <button
        type="button"
        className={`erp-pivot-sort-btn erp-workers-sort-btn ${alignClass} ${isActive ? "is-active" : ""}`}
        onClick={() => onSort(column)}
        aria-label={`${label} ${isActive ? (sort.direction === "asc" ? "오름차순" : "내림차순") : "정렬"}`}
      >
        <span>{label}</span>
        <span className="erp-pivot-sort-icon" aria-hidden="true">
          <SortIcon size={12} />
        </span>
      </button>
    </th>
  );
}

function WorkersPage({ workers, setWorkers, companyProfile }) {
  const { recordAudit } = useAudit();
  const emptyWorkerForm = {
    name: "",
    grade: "",
    category: "팀원",
    bank: "",
    account: "",
    phone: "",
    businessNo: "",
    address: "",
    vehicleNo: "",
    constructionCost: "",
    customChargeCost: "",
    overtimeCost: "30000",
    feeRate: "10",
    depositNameAliases: "",
    memo: "",
  };

  const [form, setForm] = useState(emptyWorkerForm);
  const [editingId, setEditingId] = useState(null);
  const [query, setQuery] = useState("");
  const [listSort, setListSort] = useState<{ column: WorkerListSortColumn | null; direction: SortDirection }>({
    column: null,
    direction: "asc",
  });
  const [inlineChargeDrafts, setInlineChargeDrafts] = useState({});
  const [constructionCostEdit, setConstructionCostEdit] = useState(null);
  const [formError, setFormError] = useState("");

  const handleWorkerListSort = (column: WorkerListSortColumn) => {
    setListSort((prev) => {
      if (prev.column !== column) {
        return { column, direction: "asc" };
      }
      if (prev.direction === "asc") {
        return { column, direction: "desc" };
      }
      return { column: null, direction: "asc" };
    });
  };

  const activeWorkers = useMemo(() => filterActiveWorkers(workers), [workers]);

  const displayedWorkers = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = q ? activeWorkers : workers;
    return pool
      .filter((worker) => !q || Object.values(worker).join(" ").toLowerCase().includes(q))
      .sort((a, b) => (
        listSort.column
          ? compareWorkersByColumn(a, b, listSort.column, listSort.direction)
          : compareWorkersDefault(a, b)
      ));
  }, [workers, activeWorkers, query, listSort.column, listSort.direction]);

  const exportableWorkers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return activeWorkers.filter((worker) => !q || Object.values(worker).join(" ").toLowerCase().includes(q));
  }, [activeWorkers, query]);

  const workerListSortHint = useMemo(() => {
    if (!listSort.column) {
      return "활성 · 팀원/외주 · 비활성 순으로 정렬됩니다. 검색·리스트 출력에는 활성 시공자만 포함됩니다.";
    }
    const label = listSort.column === "name" ? "시공자명" : listSort.column === "grade" ? "시공등급" : "구분";
    const direction = listSort.direction === "asc" ? "오름차순" : "내림차순";
    return `${label} ${direction}으로 정렬 중입니다. 같은 헤더를 다시 클릭하면 정렬이 해제됩니다.`;
  }, [listSort.column, listSort.direction]);

  const workerStats = useMemo(() => {
    const activeRows = displayedWorkers.filter((worker) => isWorkerActive(worker));
    return {
      total: displayedWorkers.length,
      active: activeRows.length,
      inactive: displayedWorkers.length - activeRows.length,
      team: activeRows.filter((worker) => normalizeWorkerCategory(worker.category) === "팀원").length,
      outsource: activeRows.filter((worker) => normalizeWorkerCategory(worker.category) === "외주").length,
    };
  }, [displayedWorkers]);

  const updateForm = (key, value) => {
    setFormError("");
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const saveWorker = () => {
    const name = form.name.trim();
    if (!name) {
      setFormError("시공자명을 입력해 주세요.");
      return;
    }

    const constructionCostRaw = String(form.constructionCost ?? "").trim();
    if (!constructionCostRaw) {
      setFormError("시공비를 입력해 주세요.");
      return;
    }
    const constructionCost = parseMoney(constructionCostRaw);
    if (!Number.isFinite(constructionCost) || constructionCost < 0) {
      setFormError("시공비를 올바르게 입력해 주세요.");
      return;
    }

    const category = String(form.category || "").trim();
    if (!WORKER_CATEGORY_OPTIONS.includes(category)) {
      setFormError("팀원/외주 구분을 선택해 주세요.");
      return;
    }

    const existingWorker = editingId ? workers.find((worker) => worker.id === editingId) : null;
    const feeNumber = Number(String(form.feeRate).replace(/[^0-9.]/g, ""));
    const payload = {
      id: editingId || Date.now(),
      name,
      grade: normalizeWorkerGrade(form.grade),
      category: normalizeWorkerCategory(category),
      bank: form.bank.trim(),
      account: form.account.trim(),
      phone: form.phone.trim(),
      businessNo: form.businessNo.trim(),
      address: form.address.trim(),
      vehicleNo: form.vehicleNo.trim(),
      constructionCost,
      customChargeCost: parseMoney(form.customChargeCost),
      overtimeCost: parseMoney(form.overtimeCost),
      feeRate: feeNumber > 1 ? feeNumber / 100 : feeNumber,
      depositNameAliases: form.depositNameAliases.trim(),
      memo: form.memo.trim(),
      isActive: editingId ? isWorkerActive(existingWorker) : true,
    };

    recordAudit({
      entityType: "worker",
      entityId: payload.id,
      entityLabel: payload.name,
      screen: "시공자",
      action: editingId ? "update" : "create",
      before: existingWorker ? snapshotWorkerForAudit(existingWorker) : undefined,
      after: snapshotWorkerForAudit(payload),
      fields: WORKER_AUDIT_FIELDS,
    });

    setWorkers((prev) => editingId ? prev.map((worker) => worker.id === editingId ? payload : worker) : [payload, ...prev]);
    setForm(emptyWorkerForm);
    setEditingId(null);
    setFormError("");
  };

  const editWorker = (worker) => {
    setFormError("");
    setEditingId(worker.id);
    setForm({
      name: worker.name || "",
      grade: normalizeWorkerGrade(worker.grade),
      category: normalizeWorkerCategory(worker.category),
      bank: worker.bank || "",
      account: worker.account || "",
      phone: worker.phone || "",
      businessNo: worker.businessNo || "",
      address: worker.address || "",
      vehicleNo: worker.vehicleNo || "",
      constructionCost: String(worker.constructionCost || ""),
      customChargeCost: String(worker.customChargeCost || ""),
      overtimeCost: String(worker.overtimeCost || "30000"),
      feeRate: String(Math.round((worker.feeRate || 0) * 100)),
      depositNameAliases: worker.depositNameAliases || "",
      memo: worker.memo || "",
    });
    setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 0);
  };

  const deleteWorker = (id) => {
    const worker = workers.find((item) => item.id === id);
    if (!worker) return;
    if (!confirmDelete(`시공자 "${worker.name}"을(를) 삭제할까요?`)) return;

    recordAudit({
        entityType: "worker",
        entityId: id,
        entityLabel: worker.name,
        screen: "시공자",
        action: "delete",
        before: snapshotWorkerForAudit(worker),
        fields: WORKER_AUDIT_FIELDS,
    });
    setWorkers((prev) => prev.filter((item) => item.id !== id));
  };

  const updateWorkerInline = (worker, value) => {
    const parsed = parseMoney(value);
    if (parsed === (worker.customChargeCost || 0)) return;

    recordAudit({
      entityType: "worker",
      entityId: worker.id,
      entityLabel: worker.name,
      screen: "시공자",
      action: "update",
      before: snapshotWorkerForAudit(worker),
      after: snapshotWorkerForAudit({ ...worker, customChargeCost: parsed }),
      fields: WORKER_AUDIT_FIELDS.filter((field) => field.key === "customChargeCost"),
    });

    setWorkers((prev) => prev.map((item) => (
      item.id === worker.id
        ? { ...item, customChargeCost: parsed }
        : item
    )));
  };

  const updateWorkerConstructionInline = (worker, value) => {
    const parsed = parseMoney(value);
    if (parsed === (worker.constructionCost || 0)) return;

    recordAudit({
      entityType: "worker",
      entityId: worker.id,
      entityLabel: worker.name,
      screen: "시공자",
      action: "update",
      before: snapshotWorkerForAudit(worker),
      after: snapshotWorkerForAudit({ ...worker, constructionCost: parsed }),
      fields: WORKER_AUDIT_FIELDS.filter((field) => field.key === "constructionCost"),
    });

    setWorkers((prev) => prev.map((item) => (
      item.id === worker.id
        ? { ...item, constructionCost: parsed }
        : item
    )));
  };

  const openConstructionCostEdit = (worker) => {
    setConstructionCostEdit({
      worker,
      value: String(worker.constructionCost ?? ""),
    });
  };

  const closeConstructionCostEdit = () => {
    setConstructionCostEdit(null);
  };

  const confirmConstructionCostEdit = () => {
    if (!constructionCostEdit?.worker) return;
    updateWorkerConstructionInline(constructionCostEdit.worker, constructionCostEdit.value);
    setConstructionCostEdit(null);
  };

  const updateWorkerCategoryInline = (worker, value) => {
    const category = normalizeWorkerCategory(value);
    if (category === normalizeWorkerCategory(worker.category)) return;

    recordAudit({
      entityType: "worker",
      entityId: worker.id,
      entityLabel: worker.name,
      screen: "시공자",
      action: "update",
      before: snapshotWorkerForAudit(worker),
      after: snapshotWorkerForAudit({ ...worker, category }),
      fields: WORKER_AUDIT_FIELDS.filter((field) => field.key === "category"),
    });

    setWorkers((prev) => prev.map((item) => (
      item.id === worker.id
        ? { ...item, category }
        : item
    )));
  };

  const updateWorkerGradeInline = (worker, value) => {
    const grade = normalizeWorkerGrade(value);
    if (grade === normalizeWorkerGrade(worker.grade)) return;

    recordAudit({
      entityType: "worker",
      entityId: worker.id,
      entityLabel: worker.name,
      screen: "시공자",
      action: "update",
      before: snapshotWorkerForAudit(worker),
      after: snapshotWorkerForAudit({ ...worker, grade }),
      fields: WORKER_AUDIT_FIELDS.filter((field) => field.key === "grade"),
    });

    setWorkers((prev) => prev.map((item) => (
      item.id === worker.id
        ? { ...item, grade }
        : item
    )));
  };

  const toggleWorkerActive = (worker) => {
    const nextIsActive = !isWorkerActive(worker);
    if (nextIsActive === isWorkerActive(worker)) return;

    recordAudit({
      entityType: "worker",
      entityId: worker.id,
      entityLabel: worker.name,
      screen: "시공자",
      action: "update",
      before: snapshotWorkerForAudit(worker),
      after: snapshotWorkerForAudit({ ...worker, isActive: nextIsActive }),
      fields: WORKER_AUDIT_FIELDS.filter((field) => field.key === "isActive"),
    });

    setWorkers((prev) => prev.map((item) => (
      item.id === worker.id
        ? { ...item, isActive: nextIsActive }
        : item
    )));
  };

  return (
    <div className="erp-page">
      {constructionCostEdit ? (
        <div className="erp-ledger-modal-backdrop" onClick={closeConstructionCostEdit}>
          <div
            className="erp-ledger-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="worker-construction-cost-title"
          >
            <h2 id="worker-construction-cost-title" className="text-base font-bold text-slate-900 md:text-lg">
              시공비 수정
            </h2>
            <p className="mt-2 text-sm text-slate-600">{constructionCostEdit.worker.name}</p>
            <div className="mt-4">
              <Input
                inputMode="numeric"
                value={constructionCostEdit.value}
                onChange={(event) => setConstructionCostEdit((prev) => (
                  prev ? { ...prev, value: event.target.value } : null
                ))}
                onKeyDown={(event) => {
                  if (event.key === "Enter") confirmConstructionCostEdit();
                  if (event.key === "Escape") closeConstructionCostEdit();
                }}
                placeholder="시공비"
                autoFocus
              />
            </div>
            <div className="mt-5 flex gap-2">
              <Button variant="outline" className="flex-1 rounded-xl" onClick={closeConstructionCostEdit}>
                취소
              </Button>
              <Button className="flex-1 rounded-xl" onClick={confirmConstructionCostEdit}>
                저장
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      <PageTitle title="시공자" desc="엑셀 기본정보 시트를 기준으로 시공자 정보를 관리합니다." />

      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <AuditField label="시공자명" entityType="worker" entityId={editingId} field="name"><Input value={form.name} onChange={(e) => updateForm("name", e.target.value)} placeholder="시공자명 (필수)" required /></AuditField>
            <AuditField label="시공등급" entityType="worker" entityId={editingId} field="grade">
              <select
                className="erp-input w-full rounded-xl px-3 py-2 text-sm font-semibold"
                value={form.grade}
                onChange={(e) => updateForm("grade", e.target.value)}
              >
                <option value="">선택 안 함</option>
                {WORKER_GRADE_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </AuditField>
            <AuditField label="구분" entityType="worker" entityId={editingId} field="category">
              <select
                className="erp-input w-full rounded-xl px-3 py-2 text-sm font-semibold"
                value={form.category}
                onChange={(e) => updateForm("category", e.target.value)}
                required
              >
                {WORKER_CATEGORY_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </AuditField>
            <AuditField label="은행명" entityType="worker" entityId={editingId} field="bank"><Input value={form.bank} onChange={(e) => updateForm("bank", e.target.value)} placeholder="은행명" /></AuditField>
            <AuditField label="계좌번호" entityType="worker" entityId={editingId} field="account"><Input value={form.account} onChange={(e) => updateForm("account", e.target.value)} placeholder="계좌번호" /></AuditField>
            <div className="sm:col-span-2">
              <AuditField label="예금주 별칭" entityType="worker" entityId={editingId} field="depositNameAliases">
                <Input value={form.depositNameAliases} onChange={(e) => updateForm("depositNameAliases", e.target.value)} placeholder="통장 입·출금 시 표시 이름 (쉼표로 구분)" />
              </AuditField>
            </div>
            <AuditField label="연락처" entityType="worker" entityId={editingId} field="phone"><Input value={form.phone} onChange={(e) => updateForm("phone", e.target.value)} placeholder="연락처" /></AuditField>
            <AuditField label="사업자등록번호" entityType="worker" entityId={editingId} field="businessNo"><Input value={form.businessNo} onChange={(e) => updateForm("businessNo", e.target.value)} placeholder="123-45-67890" /></AuditField>
            <AuditField label="차량번호" entityType="worker" entityId={editingId} field="vehicleNo"><Input value={form.vehicleNo} onChange={(e) => updateForm("vehicleNo", e.target.value)} placeholder="12가3456" /></AuditField>
            <div className="sm:col-span-2 xl:col-span-4">
              <AuditField label="주소" entityType="worker" entityId={editingId} field="address"><Input value={form.address} onChange={(e) => updateForm("address", e.target.value)} placeholder="주소" /></AuditField>
            </div>
            <AuditField label="시공비" entityType="worker" entityId={editingId} field="constructionCost"><Input inputMode="numeric" value={form.constructionCost} onChange={(e) => updateForm("constructionCost", e.target.value)} placeholder="시공비 (필수)" required /></AuditField>
            <AuditField label="개별청구단가" entityType="worker" entityId={editingId} field="customChargeCost"><Input inputMode="numeric" value={form.customChargeCost} onChange={(e) => updateForm("customChargeCost", e.target.value)} placeholder="비워두면 거래처 기본단가 적용" /></AuditField>
            <AuditField label="야근비" entityType="worker" entityId={editingId} field="overtimeCost"><Input inputMode="numeric" value={form.overtimeCost} onChange={(e) => updateForm("overtimeCost", e.target.value)} placeholder="야근비" /></AuditField>
            <AuditField label="수수료율(%)" entityType="worker" entityId={editingId} field="feeRate"><Input inputMode="decimal" value={form.feeRate} onChange={(e) => updateForm("feeRate", e.target.value)} placeholder="10" /></AuditField>
            <div className="md:col-span-1"><AuditField label="비고" entityType="worker" entityId={editingId} field="memo"><Input value={form.memo} onChange={(e) => updateForm("memo", e.target.value)} placeholder="비고" /></AuditField></div>
          </div>

          <div className="mt-5 flex flex-col items-end gap-2 sm:flex-row sm:justify-end">
            {formError ? <p className="mr-auto erp-text-caption font-semibold text-red-600">{formError}</p> : null}
            <Button variant="outline" className="rounded-2xl" onClick={() => { setForm(emptyWorkerForm); setEditingId(null); setFormError(""); }}>초기화</Button>
            <Button className="rounded-2xl" onClick={saveWorker}>{editingId ? "시공자 수정" : "시공자 저장"}</Button>
          </div>
        </CardContent>
      </Card>

      <SearchBox query={query} setQuery={setQuery} placeholder="시공자명, 시공등급, 구분, 연락처, 예금주 별칭, 사업자등록번호, 주소, 차량번호, 은행, 계좌 검색" />

      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-4 md:p-5">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="erp-text-section">시공자 목록</h2>
              <p className="erp-text-caption mt-1 text-slate-500">{workerListSortHint}</p>
            </div>
            <div className="flex flex-col items-stretch gap-3 sm:items-end">
              <WorkerListExport
                workers={exportableWorkers}
                companyProfile={companyProfile}
                disabled={exportableWorkers.length === 0}
              />
              <div className="erp-workers-summary">
                <span>전체 <b>{workerStats.total}</b></span>
                <span>활성 <b className="text-emerald-700">{workerStats.active}</b></span>
                <span>팀원 <b>{workerStats.team}</b></span>
                <span>외주 <b className="text-amber-700">{workerStats.outsource}</b></span>
                <span>비활성 <b className="text-slate-500">{workerStats.inactive}</b></span>
              </div>
            </div>
          </div>

          <div className="erp-table-wrap erp-workers-table-wrap">
            <table className="erp-table erp-workers-table">
              <colgroup>
                <col className="col-name" />
                <col className="col-grade" />
                <col className="col-status" />
                <col className="col-category" />
                <col className="col-contact" />
                <col className="col-account" />
                <col className="col-meta" />
                <col className="col-money" />
                <col className="col-money" />
                <col className="col-money" />
                <col className="col-rate" />
                <col className="col-memo" />
                <col className="col-actions" />
              </colgroup>
              <thead className="bg-slate-100 text-slate-600">
                <tr>
                  <WorkerListSortHeader label="시공자" column="name" sort={listSort} onSort={handleWorkerListSort} />
                  <WorkerListSortHeader label="시공등급" column="grade" sort={listSort} onSort={handleWorkerListSort} align="center" />
                  <th className="text-center">상태</th>
                  <WorkerListSortHeader label="구분" column="category" sort={listSort} onSort={handleWorkerListSort} align="center" />
                  <th className="text-left">연락처</th>
                  <th className="text-left">계좌</th>
                  <th className="text-left">예금주 별칭</th>
                  <th className="text-left">차량 · 사업자</th>
                  <th className="text-right">시공비</th>
                  <th className="text-right">개별청구단가</th>
                  <th className="text-right">야근비</th>
                  <th className="text-right">수수료</th>
                  <th className="text-left">비고</th>
                  <th className="text-center erp-table-export-skip">관리</th>
                </tr>
              </thead>
              <tbody>
                {displayedWorkers.length === 0 ? (
                  <tr>
                    <td colSpan={14} className="p-10 text-center text-slate-500">
                      표시할 시공자가 없습니다.
                    </td>
                  </tr>
                ) : displayedWorkers.map((worker) => {
                  const active = isWorkerActive(worker);
                  const category = normalizeWorkerCategory(worker.category);
                  return (
                  <tr key={worker.id} className={`erp-workers-row border-t hover:bg-slate-50${active ? "" : " is-inactive"}`}>
                    <td className="erp-workers-name-cell">
                      <div className={`erp-workers-name${active ? "" : " is-muted"}`}>{worker.name}</div>
                      {worker.address ? (
                        <div className="erp-workers-sub truncate" title={worker.address}>{worker.address}</div>
                      ) : null}
                    </td>
                    <td className="text-center">
                      <WorkerGradeSelect
                        value={normalizeWorkerGrade(worker.grade)}
                        onChange={(value) => updateWorkerGradeInline(worker, value)}
                      />
                      <AuditCellHint entityType="worker" entityId={worker.id} field="grade" fieldLabel="시공등급" />
                    </td>
                    <td className="text-center">
                      <WorkerStatusBadge active={active} />
                    </td>
                    <td className="text-center">
                      <WorkerCategorySelect
                        value={category}
                        onChange={(value) => updateWorkerCategoryInline(worker, value)}
                      />
                      <AuditCellHint entityType="worker" entityId={worker.id} field="category" fieldLabel="구분" />
                    </td>
                    <td className="whitespace-nowrap">{worker.phone || "-"}</td>
                    <td className="erp-workers-account-cell">
                      <div>{worker.bank || "-"}</div>
                      {worker.account ? <div className="erp-workers-sub truncate" title={worker.account}>{worker.account}</div> : null}
                    </td>
                    <td className="max-w-[160px] truncate text-slate-600" title={formatDepositNameAliases(worker.depositNameAliases)}>
                      {formatDepositNameAliases(worker.depositNameAliases) || "-"}
                    </td>
                    <td className="erp-workers-meta-cell">
                      <div>{worker.vehicleNo || "-"}</div>
                      {worker.businessNo ? <div className="erp-workers-sub">{worker.businessNo}</div> : null}
                    </td>
                    <td className="text-right erp-workers-charge-cell">
                      <div className="erp-workers-cost-display">
                        <span className="font-semibold text-blue-600">{formatKRW(worker.constructionCost || 0)}</span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="erp-workers-cost-edit-btn"
                          onClick={() => openConstructionCostEdit(worker)}
                          title="시공비 수정"
                          aria-label="시공비 수정"
                        >
                          <Pencil size={12} />
                        </Button>
                      </div>
                      <AuditCellHint entityType="worker" entityId={worker.id} field="constructionCost" fieldLabel="시공비" />
                    </td>
                    <td className="text-right erp-workers-charge-cell">
                      <Input
                        inputMode="numeric"
                        value={inlineChargeDrafts[worker.id] ?? worker.customChargeCost ?? ""}
                        onChange={(e) => setInlineChargeDrafts((prev) => ({ ...prev, [worker.id]: e.target.value }))}
                        onBlur={(e) => {
                          updateWorkerInline(worker, e.target.value);
                          setInlineChargeDrafts((prev) => {
                            const next = { ...prev };
                            delete next[worker.id];
                            return next;
                          });
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") e.currentTarget.blur();
                        }}
                        placeholder="기본단가"
                        className="erp-input-compact erp-workers-charge-input text-right"
                      />
                      <AuditCellHint entityType="worker" entityId={worker.id} field="customChargeCost" fieldLabel="개별청구단가" />
                    </td>
                    <td className="text-right whitespace-nowrap text-slate-600">{formatKRW(worker.overtimeCost || 30000)}</td>
                    <td className="text-right whitespace-nowrap">{Math.round((worker.feeRate || 0) * 100)}%</td>
                    <td className="erp-workers-memo-cell">
                      <span className="erp-cell-truncate block" title={worker.memo || ""}>{worker.memo || "-"}</span>
                    </td>
                    <td className="erp-table-export-skip">
                      <div className="erp-workers-actions">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className={`erp-workers-action-btn ${active ? "is-deactivate" : "is-activate"}`}
                          onClick={() => toggleWorkerActive(worker)}
                          title={active ? "비활성화" : "활성화"}
                          aria-label={active ? "비활성화" : "활성화"}
                        >
                          {active ? <UserMinus size={14} /> : <UserCheck size={14} />}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="erp-workers-action-btn"
                          onClick={() => editWorker(worker)}
                          title="수정"
                          aria-label="수정"
                        >
                          <Pencil size={14} />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="erp-workers-action-btn is-delete"
                          onClick={() => deleteWorker(worker.id)}
                          title="삭제"
                          aria-label="삭제"
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function GenericTablePage({ title, desc, rows, columns, labels }) {
  return (
    <div className="erp-page">
      <PageTitle title={title} desc={desc} />
      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-4 md:p-5">
          <div className="erp-table-wrap">
            <table className="erp-table">
              <thead className="bg-slate-100 text-slate-600">
                <tr>{labels.map((label) => <th key={label} className="text-left">{label}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t hover:bg-slate-50">
                    {columns.map((column) => (
                      <td key={column} className="p-3">
                        {typeof row[column] === "number" && column !== "feeRate" ? formatKRW(row[column]) : column === "feeRate" ? `${Math.round((row[column] || 0) * 100)}%` : row[column] || "-"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function formatPivotCount(value) {
  const amount = Number(value) || 0;
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(1);
}

function getMarginRate(margin, bill) {
  const base = Number(bill) || 0;
  if (!base) return null;
  return (Number(margin) || 0) / base;
}

function formatMarginRate(margin, bill) {
  const rate = getMarginRate(margin, bill);
  if (rate == null) return "-";
  return `${(rate * 100).toFixed(1)}%`;
}

function getPaymentRate(totalPaid, bill) {
  const base = Number(bill) || 0;
  if (!base) return null;
  return (Number(totalPaid) || 0) / base;
}

function formatPaymentRate(totalPaid, bill) {
  const rate = getPaymentRate(totalPaid, bill);
  if (rate == null) return "-";
  return `${(rate * 100).toFixed(1)}%`;
}

function usePivotTableSort(defaultColumn, defaultDirection = "desc") {
  const [sort, setSort] = useState({ column: defaultColumn, direction: defaultDirection });

  const toggleSort = (column) => {
    setSort((prev) => {
      if (prev.column !== column) return { column, direction: "desc" };
      return { column, direction: prev.direction === "desc" ? "asc" : "desc" };
    });
  };

  return { sort, toggleSort };
}

function PivotSortHeader({ label, column, activeColumn, direction, onSort, align = "right" }) {
  const isActive = activeColumn === column;
  const SortIcon = !isActive ? ArrowUpDown : direction === "asc" ? ArrowUp : ArrowDown;

  return (
    <th className={align === "left" ? "text-left" : "text-right"}>
      <button
        type="button"
        className={`erp-pivot-sort-btn ${align === "left" ? "text-left" : "text-right"} ${isActive ? "is-active" : ""}`}
        onClick={() => onSort(column)}
      >
        <span>{label}</span>
        <span className="erp-pivot-sort-icon" aria-hidden="true">
          <SortIcon size={12} />
        </span>
      </button>
    </th>
  );
}

function getPivotReportSortValue(row, column) {
  switch (column) {
    case "label":
      return row.label;
    case "staffCount":
      return row.staffCount;
    case "bill":
      return row.bill;
    case "spend":
      return row.spend;
    case "margin":
      return row.margin;
    case "marginRate":
      return getMarginRate(row.margin, row.bill) ?? -Infinity;
    case "avgPaid":
      return row.avgPaid || 0;
    case "paidVat":
      return row.paidVat || 0;
    case "totalPaid":
      return row.totalPaid || 0;
    case "paymentRate":
      return getPaymentRate(row.totalPaid, row.bill) ?? -Infinity;
    default:
      return 0;
  }
}

function getPeriodPivotSortValue(row, column) {
  switch (column) {
    case "label":
      return row.key;
    case "voucherCount":
      return row.voucherCount;
    case "staffCount":
      return row.staffCount;
    case "bill":
      return row.bill;
    case "spend":
      return row.spend;
    case "margin":
      return row.margin;
    case "marginRate":
      return getMarginRate(row.margin, row.bill) ?? -Infinity;
    case "paid":
      return row.paid;
    default:
      return 0;
  }
}

function PivotValueCell({ value, tone = "default" }) {
  const toneClass =
    tone === "positive" ? "text-emerald-600" : tone === "negative" ? "text-red-600" : tone === "muted" ? "text-slate-600" : "text-slate-900";
  return <td className={`text-right font-medium ${toneClass}`}>{formatKRW(value)}</td>;
}

function PivotMarginRateCell({ margin, bill }) {
  const rate = getMarginRate(margin, bill);
  const tone = rate == null ? "muted" : rate >= 0 ? "positive" : "negative";
  const toneClass =
    tone === "positive" ? "text-emerald-600" : tone === "negative" ? "text-red-600" : "text-slate-500";
  return <td className={`text-right font-medium ${toneClass}`}>{formatMarginRate(margin, bill)}</td>;
}

function PivotPaymentRateCell({ totalPaid, bill }) {
  const rate = getPaymentRate(totalPaid, bill);
  const tone = rate == null ? "muted" : rate >= 1 ? "positive" : "default";
  const toneClass =
    tone === "positive" ? "text-emerald-600" : tone === "muted" ? "text-slate-500" : "text-slate-900";
  return <td className={`text-right font-medium ${toneClass}`}>{formatPaymentRate(totalPaid, bill)}</td>;
}

function PivotReportTable({ title, labelHeader, rows, totals, showAvgPaid = false, showStaffCount = true, clientExpand = null, clientStatement = null, autoLinkedSaleIds = new Set(), manualLinkedSaleIds = new Set() }) {
  const [expandedClientKey, setExpandedClientKey] = useState("");
  const { sort, toggleSort } = usePivotTableSort("bill", "desc");
  const sortedRows = useMemo(
    () => sortRowsByColumn(rows, (row) => getPivotReportSortValue(row, sort.column), sort.direction),
    [rows, sort.column, sort.direction]
  );
  const isClientExpandable = labelHeader === "거래처" && clientExpand;
  const showClientStatement = labelHeader === "거래처" && clientStatement;
  const columnCount = 1 + (showStaffCount ? 1 : 0) + 4 + (showAvgPaid ? 4 : 0);

  const toggleClientExpand = (key) => {
    setExpandedClientKey((prev) => (prev === key ? "" : key));
  };

  /** @returns {import("@/utils/pivotReports").PivotSaleRecord[]} */
  const getClientVouchers = (clientKey) => {
    if (!clientExpand) return [];
    return filterSalesByClient(clientExpand.sales, clientKey, clientExpand.dateFilter)
      .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  };

  const formatSaleWorkerLabel = (sale) => {
    if (sale.workers?.length) {
      return sale.workers.map((line) => String(line.worker || "").trim()).filter(Boolean).join(", ");
    }
    return String(sale.worker || "").trim() || "-";
  };

  return (
    <Card className={`erp-pivot-card rounded-2xl shadow-sm${labelHeader === "거래처" ? " erp-pivot-card--full-width" : ""}`}>
      <CardContent className="p-3 md:p-4">
        <h2 className="erp-text-section">{title}</h2>
        <TableExportSection fileName={`보고서_${title}`} title={title} disabled={rows.length === 0}>
        <div className={`erp-table-wrap erp-pivot-table-wrap${labelHeader === "거래처" ? " erp-pivot-table-wrap--full" : ""}`}>
          <table className="erp-table erp-pivot-table erp-pivot-table--compact">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <PivotSortHeader label={labelHeader} column="label" activeColumn={sort.column} direction={sort.direction} onSort={toggleSort} align="left" />
                {showStaffCount && <PivotSortHeader label="시공인원" column="staffCount" activeColumn={sort.column} direction={sort.direction} onSort={toggleSort} />}
                <PivotSortHeader label="총시공비" column="bill" activeColumn={sort.column} direction={sort.direction} onSort={toggleSort} />
                <PivotSortHeader label="지출액" column="spend" activeColumn={sort.column} direction={sort.direction} onSort={toggleSort} />
                <PivotSortHeader label="마진" column="margin" activeColumn={sort.column} direction={sort.direction} onSort={toggleSort} />
                <PivotSortHeader label="마진율" column="marginRate" activeColumn={sort.column} direction={sort.direction} onSort={toggleSort} />
                {showAvgPaid && <PivotSortHeader label="입금액 합계" column="avgPaid" activeColumn={sort.column} direction={sort.direction} onSort={toggleSort} />}
                {showAvgPaid && <PivotSortHeader label="부가세" column="paidVat" activeColumn={sort.column} direction={sort.direction} onSort={toggleSort} />}
                {showAvgPaid && <PivotSortHeader label="총입금액 합계" column="totalPaid" activeColumn={sort.column} direction={sort.direction} onSort={toggleSort} />}
                {showAvgPaid && <PivotSortHeader label="입금률" column="paymentRate" activeColumn={sort.column} direction={sort.direction} onSort={toggleSort} />}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => {
                const isExpanded = isClientExpandable && expandedClientKey === row.key;
                const vouchers = isExpanded ? getClientVouchers(row.key) : [];
                const unpaidCount = showClientStatement ? clientStatement.getUnpaidCount(row.key) : 0;

                return (
                  <React.Fragment key={row.key}>
                    <tr
                      className={`border-t hover:bg-slate-50 ${isClientExpandable ? "cursor-pointer" : ""} ${isExpanded ? "bg-slate-100" : ""}`}
                      onClick={isClientExpandable ? () => toggleClientExpand(row.key) : undefined}
                    >
                      <td className="erp-pivot-label font-semibold text-left">
                        <div className="erp-pivot-label-row">
                          <span className="erp-pivot-label-text">
                            {isClientExpandable && (
                              <span className="erp-pivot-expand-icon inline-flex shrink-0 align-middle" aria-hidden="true">
                                {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                              </span>
                            )}
                            <span className="erp-pivot-label-name">{row.label}</span>
                          </span>
                          {showClientStatement && (
                            <span className="erp-pivot-label-statement-slot">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className={`erp-pivot-statement-btn rounded-md${unpaidCount === 0 ? " erp-pivot-statement-btn--empty" : ""}`}
                                title={unpaidCount === 0 ? "미수 전표 없음" : `미수 ${unpaidCount}건 내역서`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  clientStatement.onRequest(row.key, row.label);
                                }}
                              >
                                <FileText size={10} className="shrink-0" />
                                <span className="erp-pivot-statement-btn-label">내역서</span>
                              </Button>
                            </span>
                          )}
                        </div>
                      </td>
                      {showStaffCount && <td className="text-right">{formatPivotCount(row.staffCount)}</td>}
                      <PivotValueCell value={row.bill} />
                      <PivotValueCell value={row.spend} tone="muted" />
                      <PivotValueCell value={row.margin} tone={row.margin >= 0 ? "positive" : "negative"} />
                      <PivotMarginRateCell margin={row.margin} bill={row.bill} />
                      {showAvgPaid && <PivotValueCell value={row.avgPaid} tone="muted" />}
                      {showAvgPaid && <PivotValueCell value={row.paidVat} tone="muted" />}
                      {showAvgPaid && <PivotValueCell value={row.totalPaid} tone="muted" />}
                      {showAvgPaid && <PivotPaymentRateCell totalPaid={row.totalPaid} bill={row.bill} />}
                    </tr>
                    {isExpanded && (
                      <tr className="erp-pivot-expand-row erp-table-export-skip">
                        <td colSpan={columnCount} className="p-0">
                          {vouchers.length ? (
                            <div className="erp-pivot-expand-inner">
                              <table className="erp-table erp-pivot-voucher-table w-full">
                                <thead>
                                  <tr className="text-slate-600">
                                    <th className="text-left">일자</th>
                                    <th className="text-left">현장</th>
                                    <th className="text-left">시공자</th>
                                    <th className="text-right">매출액</th>
                                    <th className="text-right">입금</th>
                                    <th className="text-right">미수</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {vouchers.map((sale) => (
                                    <tr key={sale.id ?? `${sale.date}-${sale.site}-${sale.amount}`}>
                                      <td className="whitespace-nowrap">
                                        {sale.date || "-"}
                                        <SalePaymentLinkBadge
                                          saleId={sale.id}
                                          autoLinkedSaleIds={autoLinkedSaleIds}
                                          manualLinkedSaleIds={manualLinkedSaleIds}
                                        />
                                      </td>
                                      <td><span className="erp-cell-truncate inline-block max-w-[8rem] md:max-w-none">{sale.site || "-"}</span></td>
                                      <td><span className="erp-cell-truncate inline-block max-w-[10rem] md:max-w-none">{formatSaleWorkerLabel(sale)}</span></td>
                                      <td className="text-right font-medium whitespace-nowrap">{formatKRW(sale.amount)}</td>
                                      <td className="text-right text-emerald-600 whitespace-nowrap">{formatKRW(sale.paid)}</td>
                                      <td className="text-right text-red-600 font-medium whitespace-nowrap">{formatKRW(getUnpaid(sale))}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <p className="erp-pivot-expand-empty text-center text-slate-500">해당 거래처 전표가 없습니다.</p>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              <tr className="erp-pivot-total border-t">
                <td className="text-left">총합계</td>
                {showStaffCount && <td className="text-right">{formatPivotCount(totals.staffCount)}</td>}
                <PivotValueCell value={totals.bill} />
                <PivotValueCell value={totals.spend} tone="muted" />
                <PivotValueCell value={totals.margin} tone={totals.margin >= 0 ? "positive" : "negative"} />
                <PivotMarginRateCell margin={totals.margin} bill={totals.bill} />
                {showAvgPaid && <PivotValueCell value={totals.avgPaid} tone="muted" />}
                {showAvgPaid && <PivotValueCell value={totals.paidVat} tone="muted" />}
                {showAvgPaid && <PivotValueCell value={totals.totalPaid} tone="muted" />}
                {showAvgPaid && <PivotPaymentRateCell totalPaid={totals.totalPaid} bill={totals.bill} />}
              </tr>
            </tbody>
          </table>
        </div>
        </TableExportSection>
        <p className="erp-text-caption mt-3 text-slate-500">
          {isClientExpandable ? "거래처 행을 클릭하면 전표 목록을 펼칩니다. " : ""}
          {showClientStatement ? "거래처명 옆 내역서 버튼은 미수 전표만 모아 내역서 페이지로 이동합니다. " : ""}
          열 제목을 클릭하면 오름차순·내림차순으로 정렬됩니다.
        </p>
      </CardContent>
    </Card>
  );
}

function PeriodPivotTable({ title, rows, totals, selectedKey, onSelect }) {
  const { sort, toggleSort } = usePivotTableSort("label", "asc");
  const sortedRows = useMemo(
    () => sortRowsByColumn(rows, (row) => getPeriodPivotSortValue(row, sort.column), sort.direction),
    [rows, sort.column, sort.direction]
  );

  return (
    <Card className="erp-pivot-card rounded-2xl shadow-sm">
      <CardContent className="p-3 md:p-4">
        <h2 className="erp-text-section">{title}</h2>
        <TableExportSection fileName={`보고서_${title}`} title={title} disabled={rows.length === 0}>
        <div className="erp-table-wrap erp-pivot-table-wrap">
          <table className="erp-table erp-pivot-table erp-pivot-table--compact">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <PivotSortHeader label="기간" column="label" activeColumn={sort.column} direction={sort.direction} onSort={toggleSort} align="left" />
                <PivotSortHeader label="전표" column="voucherCount" activeColumn={sort.column} direction={sort.direction} onSort={toggleSort} />
                <PivotSortHeader label="시공인원" column="staffCount" activeColumn={sort.column} direction={sort.direction} onSort={toggleSort} />
                <PivotSortHeader label="총시공비" column="bill" activeColumn={sort.column} direction={sort.direction} onSort={toggleSort} />
                <PivotSortHeader label="지출액" column="spend" activeColumn={sort.column} direction={sort.direction} onSort={toggleSort} />
                <PivotSortHeader label="마진" column="margin" activeColumn={sort.column} direction={sort.direction} onSort={toggleSort} />
                <PivotSortHeader label="마진율" column="marginRate" activeColumn={sort.column} direction={sort.direction} onSort={toggleSort} />
                <PivotSortHeader label="입금액" column="paid" activeColumn={sort.column} direction={sort.direction} onSort={toggleSort} />
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => (
                <tr
                  key={row.key}
                  className={`border-t cursor-pointer hover:bg-slate-50 ${selectedKey === row.key ? "bg-slate-100" : ""}`}
                  onClick={() => onSelect?.(row.key)}
                >
                  <td className="erp-pivot-label font-semibold text-left">{row.label}</td>
                  <td className="text-right">{row.voucherCount}</td>
                  <td className="text-right">{formatPivotCount(row.staffCount)}</td>
                  <PivotValueCell value={row.bill} />
                  <PivotValueCell value={row.spend} tone="muted" />
                  <PivotValueCell value={row.margin} tone={row.margin >= 0 ? "positive" : "negative"} />
                  <PivotMarginRateCell margin={row.margin} bill={row.bill} />
                  <PivotValueCell value={row.paid} tone="muted" />
                </tr>
              ))}
              <tr className="erp-pivot-total border-t">
                <td className="text-left">총합계</td>
                <td className="text-right">{totals.voucherCount}</td>
                <td className="text-right">{formatPivotCount(totals.staffCount)}</td>
                <PivotValueCell value={totals.bill} />
                <PivotValueCell value={totals.spend} tone="muted" />
                <PivotValueCell value={totals.margin} tone={totals.margin >= 0 ? "positive" : "negative"} />
                <PivotMarginRateCell margin={totals.margin} bill={totals.bill} />
                <PivotValueCell value={totals.paid} tone="muted" />
              </tr>
            </tbody>
          </table>
        </div>
        </TableExportSection>
        {onSelect && <p className="erp-text-caption mt-3 text-slate-500">행을 클릭하면 해당 기간의 거래처·시공자 Pivot을 아래에서 확인할 수 있습니다. 열 제목을 클릭하면 정렬됩니다.</p>}
      </CardContent>
    </Card>
  );
}

function AnalysisBoard({ report }) {
  return (
    <div className="erp-analysis-grid">
      <Card className="erp-pivot-card rounded-2xl shadow-sm">
        <CardContent className="p-3 md:p-4">
          <h2 className="erp-text-section">거래처 분석</h2>
          <TableExportSection fileName="보고서_거래처분석" title="거래처 분석" disabled={report.clients.length === 0}>
          <div className="erp-table-wrap erp-pivot-table-wrap">
            <table className="erp-table erp-pivot-table erp-pivot-table--compact">
              <thead className="bg-slate-100 text-slate-600">
                <tr>
                  <th className="text-left">거래처</th>
                  <th className="text-right">총시공비</th>
                  <th className="text-right">지출액</th>
                  <th className="text-right">마진</th>
                  <th className="text-right">마진율</th>
                </tr>
              </thead>
              <tbody>
                {report.clients.map((row) => (
                  <tr key={row.key} className="border-t hover:bg-slate-50">
                    <td className="erp-pivot-label font-semibold text-left">{row.label}</td>
                    <PivotValueCell value={row.bill} />
                    <PivotValueCell value={row.spend} tone="muted" />
                    <PivotValueCell value={row.margin} tone={row.margin >= 0 ? "positive" : "negative"} />
                    <PivotMarginRateCell margin={row.margin} bill={row.bill} />
                  </tr>
                ))}
                <tr className="erp-pivot-total border-t">
                  <td className="text-left">총합계</td>
                  <PivotValueCell value={report.totals.client.bill} />
                  <PivotValueCell value={report.totals.client.spend} tone="muted" />
                  <PivotValueCell value={report.totals.client.margin} tone={report.totals.client.margin >= 0 ? "positive" : "negative"} />
                  <PivotMarginRateCell margin={report.totals.client.margin} bill={report.totals.client.bill} />
                </tr>
              </tbody>
            </table>
          </div>
          </TableExportSection>
        </CardContent>
      </Card>

      <Card className="erp-pivot-card rounded-2xl shadow-sm">
        <CardContent className="p-3 md:p-4">
          <h2 className="erp-text-section">시공자 분석</h2>
          <TableExportSection fileName="보고서_시공자분석" title="시공자 분석" disabled={report.workers.length === 0}>
          <div className="erp-table-wrap erp-pivot-table-wrap">
            <table className="erp-table erp-pivot-table erp-pivot-table--compact">
              <thead className="bg-slate-100 text-slate-600">
                <tr>
                  <th className="text-left">시공자</th>
                  <th className="text-right">총시공비</th>
                  <th className="text-right">지출액</th>
                  <th className="text-right">마진</th>
                  <th className="text-right">마진율</th>
                </tr>
              </thead>
              <tbody>
                {report.workers.map((row) => (
                  <tr key={row.key} className="border-t hover:bg-slate-50">
                    <td className="erp-pivot-label font-semibold text-left">{row.label}</td>
                    <PivotValueCell value={row.bill} />
                    <PivotValueCell value={row.spend} tone="muted" />
                    <PivotValueCell value={row.margin} tone={row.margin >= 0 ? "positive" : "negative"} />
                    <PivotMarginRateCell margin={row.margin} bill={row.bill} />
                  </tr>
                ))}
                <tr className="erp-pivot-total border-t">
                  <td className="text-left">총합계</td>
                  <PivotValueCell value={report.totals.worker.bill} />
                  <PivotValueCell value={report.totals.worker.spend} tone="muted" />
                  <PivotValueCell value={report.totals.worker.margin} tone={report.totals.worker.margin >= 0 ? "positive" : "negative"} />
                  <PivotMarginRateCell margin={report.totals.worker.margin} bill={report.totals.worker.bill} />
                </tr>
              </tbody>
            </table>
          </div>
          </TableExportSection>
        </CardContent>
      </Card>

      <Card className="erp-pivot-card rounded-2xl shadow-sm">
        <CardContent className="p-3 md:p-4">
          <h2 className="erp-text-section">시공자 인원</h2>
          <TableExportSection fileName="보고서_시공자인원" title="시공자 인원" disabled={report.workerStaff.length === 0}>
          <div className="erp-table-wrap erp-pivot-table-wrap">
            <table className="erp-table erp-pivot-table erp-pivot-table--compact">
              <thead className="bg-slate-100 text-slate-600">
                <tr>
                  <th className="text-left">시공자</th>
                  <th className="text-right">시공인원</th>
                </tr>
              </thead>
              <tbody>
                {report.workerStaff.map((row) => (
                  <tr key={row.key} className="border-t hover:bg-slate-50">
                    <td className="erp-pivot-label font-semibold text-left">{row.label}</td>
                    <td className="text-right font-medium">{formatPivotCount(row.staffCount)}</td>
                  </tr>
                ))}
                <tr className="erp-pivot-total border-t">
                  <td className="text-left">총합계</td>
                  <td className="text-right font-bold">{formatPivotCount(report.totals.staffCount)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          </TableExportSection>
        </CardContent>
      </Card>
    </div>
  );
}

function getMonthDateRange(monthKey) {
  const [yearText, monthText] = monthKey.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const startDate = `${monthKey}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${monthKey}-${String(lastDay).padStart(2, "0")}`;
  return { startDate, endDate };
}

function getQuarterDateRange(quarterKey) {
  const [yearText, quarterText] = quarterKey.split("-Q");
  const year = Number(yearText);
  const quarter = Number(quarterText);
  const startMonth = (quarter - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  const startDate = `${year}-${String(startMonth).padStart(2, "0")}-01`;
  const lastDay = new Date(year, endMonth, 0).getDate();
  const endDate = `${year}-${String(endMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { startDate, endDate };
}

const REPORT_TABS = [
  ["pivot", "Pivot"],
  ["monthly", "월별"],
  ["quarterly", "분기별"],
  ["analysis", "데이터분석"],
];

function ReportsPage({ sales, workers = [], paymentVouchers = [], onRequestClientStatement, autoLinkedSaleIds = new Set(), manualLinkedSaleIds = new Set() }) {
  const [reportTab, setReportTab] = useState("pivot");
  const [dateFilter, setDateFilter] = useState(() => monthRangeISO(0));
  const [selectedPeriodKey, setSelectedPeriodKey] = useState("");
  const [statementNotice, setStatementNotice] = useState("");

  useEffect(() => {
    if (!statementNotice) return undefined;
    const timer = window.setTimeout(() => setStatementNotice(""), 3200);
    return () => window.clearTimeout(timer);
  }, [statementNotice]);

  const pivotContext = useMemo(
    () => ({ workerFeeRates: buildWorkerFeeMap(workers), paymentVouchers }),
    [workers, paymentVouchers]
  );

  const buildClientStatementActions = (periodFilter) => ({
    getUnpaidCount: (clientKey) =>
      filterSalesByClient(sales, clientKey, periodFilter).filter((sale) => getUnpaid(sale) > 0).length,
    onRequest: (clientKey, clientLabel = clientKey) => {
      const unpaidSales = filterSalesByClient(sales, clientKey, periodFilter).filter((sale) => getUnpaid(sale) > 0);
      if (unpaidSales.length === 0) {
        setStatementNotice(`${clientLabel} · 선택 기간에 미수 전표가 없어 내역서를 만들 수 없습니다.`);
        return;
      }
      setStatementNotice("");
      const draft = createUnpaidClientStatementDraft(clientKey, unpaidSales, periodFilter);
      stashStatementDraft(draft);
      onRequestClientStatement?.(draft);
    },
  });

  const clientReport = useMemo(() => buildClientPivotReport(sales, dateFilter, pivotContext), [sales, dateFilter, pivotContext]);
  const workerReport = useMemo(() => buildWorkerPivotReport(sales, dateFilter, pivotContext), [sales, dateFilter, pivotContext]);
  const monthlyReport = useMemo(() => buildMonthlyPivotReport(sales, dateFilter, pivotContext), [sales, dateFilter, pivotContext]);
  const quarterlyReport = useMemo(() => buildQuarterlyPivotReport(sales, dateFilter, pivotContext), [sales, dateFilter, pivotContext]);
  const analysisReport = useMemo(() => buildAnalysisReport(sales, dateFilter, pivotContext), [sales, dateFilter, pivotContext]);

  const drilldownFilter = useMemo(() => {
    if (!selectedPeriodKey) return null;
    if (reportTab === "monthly") return getMonthDateRange(selectedPeriodKey);
    if (reportTab === "quarterly") return getQuarterDateRange(selectedPeriodKey);
    return null;
  }, [selectedPeriodKey, reportTab]);

  const drilldownClientReport = useMemo(
    () => (drilldownFilter ? buildClientPivotReport(sales, drilldownFilter, pivotContext) : null),
    [sales, drilldownFilter, pivotContext]
  );
  const drilldownWorkerReport = useMemo(
    () => (drilldownFilter ? buildWorkerPivotReport(sales, drilldownFilter, pivotContext) : null),
    [sales, drilldownFilter, pivotContext]
  );

  const periodLabel =
    dateFilter.startDate || dateFilter.endDate
      ? `${dateFilter.startDate || "전체"} ~ ${dateFilter.endDate || "전체"}`
      : "전체 기간";

  const setMonthRange = (offset = 0) => {
    setDateFilter(monthRangeISO(offset));
    setSelectedPeriodKey("");
  };

  const handleTabChange = (tab) => {
    setReportTab(tab);
    setSelectedPeriodKey("");
  };

  return (
    <div className="erp-page erp-reports-page">
      <PageTitle title="보고서" desc="엑셀 Pivot·데이터분석 시트처럼 거래처·시공자·기간별 집계를 확인합니다." />

      {statementNotice ? (
        <div className="erp-reports-notice mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          {statementNotice}
        </div>
      ) : null}

      <Card className="erp-reports-toolbar rounded-xl shadow-sm">
        <CardContent className="p-3 md:p-3.5">
          <div className="flex flex-col gap-2 xl:flex-row xl:items-end xl:justify-between">
            <div className="erp-reports-filters grid grid-cols-1 gap-2 sm:grid-cols-2 md:max-w-lg">
              <Field label="시작일자">
                <Input type="date" className="erp-input-compact" value={dateFilter.startDate} onChange={(event) => { setDateFilter((prev) => ({ ...prev, startDate: event.target.value })); setSelectedPeriodKey(""); }} />
              </Field>
              <Field label="종료일자">
                <Input type="date" className="erp-input-compact" value={dateFilter.endDate} onChange={(event) => { setDateFilter((prev) => ({ ...prev, endDate: event.target.value })); setSelectedPeriodKey(""); }} />
              </Field>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button variant="outline" className="erp-reports-btn rounded-lg" onClick={() => setMonthRange(0)}>이번 달</Button>
              <Button variant="outline" className="erp-reports-btn rounded-lg" onClick={() => setMonthRange(-1)}>지난 달</Button>
              <Button variant="outline" className="erp-reports-btn rounded-lg" onClick={() => { setDateFilter({ startDate: "", endDate: "" }); setSelectedPeriodKey(""); }}>전체</Button>
            </div>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-slate-100 pt-2.5">
            {REPORT_TABS.map(([key, label]) => (
              <Button
                key={key}
                variant={reportTab === key ? "default" : "outline"}
                className="erp-reports-btn rounded-lg"
                onClick={() => handleTabChange(key)}
              >
                {label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="erp-reports-summary-grid grid grid-cols-1 gap-2 sm:grid-cols-2 md:gap-2.5 xl:grid-cols-4">
        <SummaryCard compact title="총 시공인원" value={formatPivotCount(clientReport.totals.staffCount)} sub={periodLabel} icon={Users} />
        <SummaryCard compact title="총시공비" value={formatKRW(clientReport.totals.bill)} sub="거래처 청구 합계" icon={WalletCards} />
        <SummaryCard compact title="총 지출액" value={formatKRW(clientReport.totals.spend)} sub="시공자 지급 합계" icon={CreditCard} />
        <SummaryCard compact title="총 마진" value={formatKRW(clientReport.totals.margin)} sub={`마진율 ${formatMarginRate(clientReport.totals.margin, clientReport.totals.bill)} · 총입금 ${formatKRW(clientReport.totals.totalPaid)} · 입금률 ${formatPaymentRate(clientReport.totals.totalPaid, clientReport.totals.bill)}`} tone={clientReport.totals.margin >= 0 ? "success" : "danger"} icon={BarChart3} />
      </div>

      {reportTab === "pivot" && (
        <div className="erp-pivot-layout">
          <PivotReportTable title="거래처 Pivot" labelHeader="거래처" rows={clientReport.rows} totals={clientReport.totals} showAvgPaid clientExpand={{ sales, dateFilter }} clientStatement={buildClientStatementActions(dateFilter)} autoLinkedSaleIds={autoLinkedSaleIds} manualLinkedSaleIds={manualLinkedSaleIds} />
          <PivotReportTable title="시공자 Pivot" labelHeader="시공자" rows={workerReport.rows} totals={workerReport.totals} />
        </div>
      )}

      {reportTab === "monthly" && (
        <>
          <PeriodPivotTable title="월별 Pivot" rows={monthlyReport.rows} totals={monthlyReport.totals} selectedKey={selectedPeriodKey} onSelect={setSelectedPeriodKey} />
          {drilldownClientReport && drilldownWorkerReport && (
            <div className="erp-pivot-layout">
              <PivotReportTable title={`${monthlyReport.rows.find((row) => row.key === selectedPeriodKey)?.label || selectedPeriodKey} · 거래처`} labelHeader="거래처" rows={drilldownClientReport.rows} totals={drilldownClientReport.totals} showAvgPaid clientExpand={{ sales, dateFilter: drilldownFilter }} clientStatement={buildClientStatementActions(drilldownFilter)} autoLinkedSaleIds={autoLinkedSaleIds} manualLinkedSaleIds={manualLinkedSaleIds} />
              <PivotReportTable title={`${monthlyReport.rows.find((row) => row.key === selectedPeriodKey)?.label || selectedPeriodKey} · 시공자`} labelHeader="시공자" rows={drilldownWorkerReport.rows} totals={drilldownWorkerReport.totals} />
            </div>
          )}
        </>
      )}

      {reportTab === "quarterly" && (
        <>
          <PeriodPivotTable title="분기별 Pivot" rows={quarterlyReport.rows} totals={quarterlyReport.totals} selectedKey={selectedPeriodKey} onSelect={setSelectedPeriodKey} />
          {drilldownClientReport && drilldownWorkerReport && (
            <div className="erp-pivot-layout">
              <PivotReportTable title={`${quarterlyReport.rows.find((row) => row.key === selectedPeriodKey)?.label || selectedPeriodKey} · 거래처`} labelHeader="거래처" rows={drilldownClientReport.rows} totals={drilldownClientReport.totals} showAvgPaid clientExpand={{ sales, dateFilter: drilldownFilter }} clientStatement={buildClientStatementActions(drilldownFilter)} autoLinkedSaleIds={autoLinkedSaleIds} manualLinkedSaleIds={manualLinkedSaleIds} />
              <PivotReportTable title={`${quarterlyReport.rows.find((row) => row.key === selectedPeriodKey)?.label || selectedPeriodKey} · 시공자`} labelHeader="시공자" rows={drilldownWorkerReport.rows} totals={drilldownWorkerReport.totals} />
            </div>
          )}
        </>
      )}

      {reportTab === "analysis" && <AnalysisBoard report={analysisReport} />}
    </div>
  );
}

export default function TeammillimeterErpMvp() {
  const apiMode = isApiModeEnabled();
  const storedData = apiMode ? null : loadStoredData();
  const sessionOnMount = loadSessionUser();
  const [currentUser, setCurrentUser] = useState(() => sessionOnMount);
  const [dataReady, setDataReady] = useState(() => !apiMode || !sessionOnMount);
  const [syncStatus, setSyncStatus] = useState("");
  const [erpVersion, setErpVersion] = useState(0);
  const erpVersionRef = useRef(0);
  const skipSaveRef = useRef(true);
  const [active, setActive] = useState(() => {
    if (typeof window === "undefined") return "dashboard";
    const stored = window.sessionStorage.getItem(ACTIVE_TAB_KEY) || "dashboard";
    const migrated = migrateActivePageKey(stored);
    if (migrated.accountingTab) storeAccountingTab(migrated.accountingTab);
    if (migrated.page !== stored && typeof window !== "undefined") {
      window.sessionStorage.setItem(ACTIVE_TAB_KEY, migrated.page);
    }
    return migrated.page;
  });
  const [sales, setSales] = useState(() => {
    if (apiMode && sessionOnMount) return [];
    return storedData?.sales || initialSales;
  });
  const [paymentVouchers, setPaymentVouchers] = useState(() => {
    if (apiMode && sessionOnMount) return [];
    return storedData?.paymentVouchers || initialPaymentVouchers;
  });
  const [paymentInputLogs, setPaymentInputLogs] = useState(() => {
    if (apiMode && sessionOnMount) return [];
    return Array.isArray(storedData?.paymentInputLogs) ? storedData.paymentInputLogs : [];
  });
  const [clients, setClients] = useState(() => {
    if (apiMode && sessionOnMount) return [];
    return storedData?.clients?.length >= initialClients.length ? storedData.clients : initialClients;
  });
  const [workers, setWorkers] = useState(() => {
    if (apiMode && sessionOnMount) return [];
    return storedData?.workers?.length >= initialWorkers.length ? storedData.workers : initialWorkers;
  });
  const normalizedSales = useMemo(() => normalizeSalesRecords(sales, workers), [sales, workers]);
  const appliedPaymentData = useMemo(() => applyPaymentVouchers(normalizedSales, paymentVouchers), [normalizedSales, paymentVouchers]);
  const appliedSales = appliedPaymentData.sales;
  const [auditLogs, setAuditLogs] = useState(() => {
    if (apiMode && sessionOnMount) return [];
    return resolveInitialLogs(storedData).auditLogs;
  });
  const [loginLogs, setLoginLogs] = useState(() => {
    if (apiMode && sessionOnMount) return [];
    return resolveInitialLogs(storedData).loginLogs;
  });
  const [workerPaymentRecords, setWorkerPaymentRecords] = useState(() => {
    if (apiMode && sessionOnMount) return [];
    return Array.isArray(storedData?.workerPaymentRecords) ? storedData.workerPaymentRecords : [];
  });
  const [workerPayoutVouchers, setWorkerPayoutVouchers] = useState(() => {
    if (apiMode && sessionOnMount) return [];
    return normalizeWorkerPayoutVouchers(storedData?.workerPayoutVouchers);
  });
  const [companyExpenses, setCompanyExpenses] = useState(() => {
    if (apiMode && sessionOnMount) return [];
    return Array.isArray(storedData?.companyExpenses) ? storedData.companyExpenses : [];
  });
  const [attendanceRecords, setAttendanceRecords] = useState(() => {
    if (apiMode && sessionOnMount) return [];
    return normalizeAttendanceRecords(storedData?.attendanceRecords);
  });
  const [fixedExpenses, setFixedExpenses] = useState(() => {
    if (apiMode && sessionOnMount) return [];
    return Array.isArray(storedData?.fixedExpenses) ? storedData.fixedExpenses : [];
  });
  const [fixedExpensePayments, setFixedExpensePayments] = useState(() => {
    if (apiMode && sessionOnMount) return [];
    return Array.isArray(storedData?.fixedExpensePayments) ? storedData.fixedExpensePayments : [];
  });
  const [bankLedgerRules, setBankLedgerRules] = useState(() => {
    if (apiMode && sessionOnMount) return [];
    return normalizeBankLedgerMatchRules(storedData?.bankLedgerRules);
  });
  const [expenseCategories, setExpenseCategories] = useState(() => {
    if (apiMode && sessionOnMount) return normalizeExpenseCategories([], []);
    return normalizeExpenseCategories(storedData?.expenseCategories, storedData?.companyExpenses);
  });
  const [fixedExpenseCategories, setFixedExpenseCategories] = useState(() => {
    if (apiMode && sessionOnMount) return normalizeFixedExpenseCategories([], []);
    return normalizeFixedExpenseCategories(storedData?.fixedExpenseCategories, storedData?.fixedExpenses);
  });
  const [companyProfile, setCompanyProfile] = useState(() => {
    if (apiMode && sessionOnMount) return DEFAULT_COMPANY_PROFILE;
    return normalizeCompanyProfile(storedData?.companyProfile);
  });
  const [companyNotices, setCompanyNotices] = useState(() => {
    if (apiMode && sessionOnMount) return [];
    return normalizeCompanyNotices(storedData?.companyNotices);
  });
  const [workPosts, setWorkPosts] = useState(() => {
    if (apiMode && sessionOnMount) return [];
    return normalizeWorkPosts(storedData?.workPosts);
  });
  const [taxInvoices, setTaxInvoices] = useState(() => {
    if (apiMode && sessionOnMount) return [];
    return normalizeTaxInvoices(storedData?.taxInvoices);
  });
  const [bankTransactions, setBankTransactions] = useState(() => {
    if (apiMode && sessionOnMount) return [];
    return normalizeBankTransactions(storedData?.bankTransactions);
  });
  const autoLinkedSaleIds = useMemo(
    () => buildAutoLinkedSaleIdSet(paymentVouchers, bankTransactions),
    [paymentVouchers, bankTransactions]
  );
  const manualLinkedSaleIds = useMemo(
    () => buildManualLinkedSaleIdSet(paymentVouchers, bankTransactions),
    [paymentVouchers, bankTransactions]
  );
  const [bankTransactionFolders, setBankTransactionFolders] = useState(() => {
    if (apiMode && sessionOnMount) return normalizeBankTransactionFolders([]);
    return normalizeBankTransactionFolders(storedData?.bankTransactionFolders);
  });
  const [statementGenerationLogs, setStatementGenerationLogs] = useState(() => {
    if (apiMode && sessionOnMount) return [];
    return normalizeStatementGenerationLogs(storedData?.statementGenerationLogs);
  });
  const [statementFolders, setStatementFolders] = useState(() => {
    if (apiMode && sessionOnMount) return [];
    return normalizeStatementFolders(storedData?.statementFolders);
  });
  const [statementDraft, setStatementDraft] = useState<StatementDraft | null>(null);
  const [pendingVoucherEditId, setPendingVoucherEditId] = useState(null);
  const [pendingVoucherSearchFilter, setPendingVoucherSearchFilter] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [myAccountOpen, setMyAccountOpen] = useState(false);
  const [sidebarMenuOrderOpen, setSidebarMenuOrderOpen] = useState(false);
  const [sidebarOrder, setSidebarOrder] = useState(() => resolveSidebarOrder(currentUser));
  const receivableRowsFromSales = useMemo(() => buildReceivableRowsFromSales(appliedSales, clients), [appliedSales, clients]);

  const applyFetchedErpData = (data) => {
    const nextWorkers = data.workers?.length ? data.workers : initialWorkers;
    setSales(normalizeSalesRecords(data.sales || [], nextWorkers));
    setPaymentVouchers(data.paymentVouchers || []);
    setPaymentInputLogs(Array.isArray(data.paymentInputLogs) ? data.paymentInputLogs : []);
    setClients(data.clients?.length ? data.clients : initialClients);
    setWorkers(nextWorkers);
    const migratedLogs = migrateErpLoginLogs({
      auditLogs: Array.isArray(data.auditLogs) ? data.auditLogs : [],
      loginLogs: Array.isArray(data.loginLogs) ? data.loginLogs : [],
    });
    setAuditLogs(migratedLogs.auditLogs);
    setLoginLogs(migratedLogs.loginLogs);
    setWorkerPaymentRecords(Array.isArray(data.workerPaymentRecords) ? data.workerPaymentRecords : []);
    setWorkerPayoutVouchers(normalizeWorkerPayoutVouchers(data.workerPayoutVouchers));
    setCompanyExpenses(Array.isArray(data.companyExpenses) ? data.companyExpenses : []);
    setAttendanceRecords(normalizeAttendanceRecords(data.attendanceRecords));
    setFixedExpenses(Array.isArray(data.fixedExpenses) ? data.fixedExpenses : []);
    setFixedExpensePayments(Array.isArray(data.fixedExpensePayments) ? data.fixedExpensePayments : []);
    setBankLedgerRules(normalizeBankLedgerMatchRules(data.bankLedgerRules));
    setExpenseCategories(
      normalizeExpenseCategories(data.expenseCategories, Array.isArray(data.companyExpenses) ? data.companyExpenses : []),
    );
    setFixedExpenseCategories(
      normalizeFixedExpenseCategories(
        data.fixedExpenseCategories,
        Array.isArray(data.fixedExpenses) ? data.fixedExpenses : [],
      ),
    );
    setCompanyNotices(normalizeCompanyNotices(data.companyNotices));
    setWorkPosts(normalizeWorkPosts(data.workPosts));
    setTaxInvoices(normalizeTaxInvoices(data.taxInvoices));
    setBankTransactions(normalizeBankTransactions(data.bankTransactions));
    setBankTransactionFolders(normalizeBankTransactionFolders(data.bankTransactionFolders));
    setStatementGenerationLogs(normalizeStatementGenerationLogs(data.statementGenerationLogs));
    setStatementFolders(normalizeStatementFolders(data.statementFolders));
    setCompanyProfile(normalizeCompanyProfile(data.companyProfile));
    erpVersionRef.current = data.version ?? 0;
    setErpVersion(data.version ?? 0);
    skipSaveRef.current = true;
  };

  useEffect(() => {
    if (!apiMode || !currentUser?.id) return;
    let cancelled = false;
    setDataReady(false);
    (async () => {
      try {
        const data = await fetchErpData();
        if (cancelled) return;
        applyFetchedErpData(data);
        setSyncStatus("");
        setDataReady(true);
      } catch (error) {
        console.error(error);
        clearAuthSession();
        saveSessionUser(null);
        setCurrentUser(null);
        setDataReady(true);
        window.alert("서버에서 데이터를 불러오지 못했습니다. 다시 로그인해 주세요.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentUser?.id, apiMode]);

  useEffect(() => {
    if (!apiMode) {
      saveStoredData({ sales, paymentVouchers, paymentInputLogs, clients, workers, auditLogs, loginLogs, workerPaymentRecords, workerPayoutVouchers, companyExpenses, attendanceRecords, fixedExpenses, fixedExpensePayments, bankLedgerRules, expenseCategories, fixedExpenseCategories, companyNotices, workPosts, taxInvoices, bankTransactions, bankTransactionFolders, statementGenerationLogs, statementFolders, companyProfile });
      return;
    }
    if (!currentUser || !dataReady) return;
    if (skipSaveRef.current) {
      skipSaveRef.current = false;
      return;
    }
    setSyncStatus("저장 중...");
    const timer = window.setTimeout(async () => {
      const savePayload = {
        sales,
        paymentVouchers,
        paymentInputLogs,
        clients,
        workers,
        auditLogs,
        loginLogs,
        workerPaymentRecords,
        workerPayoutVouchers,
        companyExpenses,
        attendanceRecords,
        fixedExpenses,
        fixedExpensePayments,
        bankLedgerRules,
        expenseCategories,
        fixedExpenseCategories,
        companyNotices,
        workPosts,
        taxInvoices,
        bankTransactions,
        bankTransactionFolders,
        statementGenerationLogs,
        statementFolders,
        companyProfile,
        version: erpVersionRef.current,
      };
      try {
        const result = await saveErpData(savePayload);
        erpVersionRef.current = result.version;
        setErpVersion(result.version);
        setSyncStatus("저장됨");
      } catch (error) {
        const err = error as Error & { status?: number };
        if (err.status === 409) {
          try {
            const latest = await fetchErpData();
            erpVersionRef.current = latest.version ?? 0;
            if (Array.isArray(latest.loginLogs)) {
              setLoginLogs(latest.loginLogs);
              savePayload.loginLogs = latest.loginLogs;
            }
            const serverAudits = Array.isArray(latest.auditLogs) ? latest.auditLogs : [];
            const mergedAudits = mergeAuditLogs(serverAudits, savePayload.auditLogs);
            savePayload.auditLogs = mergedAudits;
            setAuditLogs(mergedAudits);
            savePayload.version = erpVersionRef.current;
            skipSaveRef.current = true;
            const retry = await saveErpData(savePayload);
            erpVersionRef.current = retry.version;
            setErpVersion(retry.version);
            setSyncStatus("저장됨");
          } catch (retryError) {
            console.error(retryError);
            setSyncStatus("충돌 — 새로고침 필요");
            window.alert("다른 사용자가 먼저 저장했습니다. 새로고침(F5) 후 다시 시도해 주세요.");
          }
        } else {
          setSyncStatus("저장 실패");
        }
      }
    }, 900);
    return () => window.clearTimeout(timer);
  }, [sales, paymentVouchers, paymentInputLogs, clients, workers, auditLogs, loginLogs, workerPaymentRecords, workerPayoutVouchers, companyExpenses, attendanceRecords, fixedExpenses, fixedExpensePayments, bankLedgerRules, expenseCategories, fixedExpenseCategories, companyNotices, workPosts, taxInvoices, bankTransactions, bankTransactionFolders, statementGenerationLogs, statementFolders, companyProfile, currentUser, dataReady, apiMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(ACTIVE_TAB_KEY, active);
  }, [active]);

  useEffect(() => {
    if (active === "paymentInput") setActive("receivables");
    if (active === "clientCalendar") setActive("calendar");
    const migrated = migrateActivePageKey(active);
    if (migrated.page !== active) {
      if (migrated.accountingTab) storeAccountingTab(migrated.accountingTab);
      setActive(migrated.page);
    }
  }, [active]);

  const backupData = () => {
    downloadBackup({ sales, paymentVouchers, paymentInputLogs, clients, workers, auditLogs, loginLogs, workerPaymentRecords, workerPayoutVouchers, companyExpenses, attendanceRecords, fixedExpenses, fixedExpensePayments, bankLedgerRules, expenseCategories, fixedExpenseCategories, companyNotices, workPosts, taxInvoices, bankTransactions, bankTransactionFolders, statementGenerationLogs, statementFolders, companyProfile });
  };

  const restoreBackup = (file) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = normalizeBackupPayload(JSON.parse(String(reader.result || "{}")));
        if (!window.confirm("백업 파일로 현재 데이터를 덮어씁니다. 계속할까요?")) return;
        setSales(normalizeSalesRecords(parsed.sales, parsed.workers || workers));
        setPaymentVouchers(parsed.paymentVouchers);
        setPaymentInputLogs(parsed.paymentInputLogs || []);
        setClients(parsed.clients);
        setWorkers(parsed.workers);
        setAuditLogs(parsed.auditLogs || []);
        setLoginLogs(parsed.loginLogs || []);
        setWorkerPaymentRecords(parsed.workerPaymentRecords || []);
        setWorkerPayoutVouchers(normalizeWorkerPayoutVouchers(parsed.workerPayoutVouchers));
        setCompanyExpenses(parsed.companyExpenses || []);
        setAttendanceRecords(normalizeAttendanceRecords(parsed.attendanceRecords));
        setFixedExpenses(parsed.fixedExpenses || []);
        setFixedExpensePayments(parsed.fixedExpensePayments || []);
        setBankLedgerRules(normalizeBankLedgerMatchRules(parsed.bankLedgerRules));
        setExpenseCategories(normalizeExpenseCategories(parsed.expenseCategories, parsed.companyExpenses || []));
        setFixedExpenseCategories(
          normalizeFixedExpenseCategories(parsed.fixedExpenseCategories, parsed.fixedExpenses || []),
        );
        setCompanyNotices(normalizeCompanyNotices(parsed.companyNotices));
        setWorkPosts(normalizeWorkPosts(parsed.workPosts));
        setTaxInvoices(normalizeTaxInvoices(parsed.taxInvoices));
        setBankTransactions(normalizeBankTransactions(parsed.bankTransactions));
        setBankTransactionFolders(normalizeBankTransactionFolders(parsed.bankTransactionFolders));
        setStatementGenerationLogs(normalizeStatementGenerationLogs(parsed.statementGenerationLogs));
        setStatementFolders(normalizeStatementFolders(parsed.statementFolders));
        setCompanyProfile(normalizeCompanyProfile(parsed.companyProfile));
        window.alert("백업 데이터를 불러왔습니다.");
      } catch (error) {
        console.error(error);
        window.alert("백업 파일 형식이 올바르지 않습니다.");
      }
    };
    reader.readAsText(file, "utf-8");
  };

  const applyErpImport = (payload, source = "데이터 적용") => {
    if (!payload) return;
    payload = migrateClientName(payload);
    const clientCount = payload.clients?.length || 0;
    const workerCount = payload.workers?.length || 0;
    const salesCount = payload.sales?.length || 0;
    const paymentCount = payload.paymentVouchers?.length || 0;
    const dates = (payload.sales || []).map((row) => row.date).filter(Boolean).sort();
    const dateRange = dates.length ? `${dates[0]} ~ ${dates[dates.length - 1]}` : "없음";
    if (!window.confirm(`거래처 ${clientCount}곳, 시공자 ${workerCount}명, 매출 ${salesCount}건, 입금 ${paymentCount}건 (${dateRange})을 적용합니다. 기존 데이터를 덮어씁니다. 계속할까요?`)) return;
    if (clientCount) setClients(payload.clients);
    if (workerCount) setWorkers(payload.workers);
    if (salesCount) setSales(normalizeSalesRecords(payload.sales, payload.workers || workers));
    setPaymentVouchers(payload.paymentVouchers?.length ? payload.paymentVouchers : []);
    setWorkerPaymentRecords(Array.isArray(payload.workerPaymentRecords) ? payload.workerPaymentRecords : []);
    setWorkerPayoutVouchers(normalizeWorkerPayoutVouchers(payload.workerPayoutVouchers));
    setCompanyExpenses(Array.isArray(payload.companyExpenses) ? payload.companyExpenses : []);
    setAttendanceRecords(normalizeAttendanceRecords(payload.attendanceRecords));
    setFixedExpenses(Array.isArray(payload.fixedExpenses) ? payload.fixedExpenses : []);
    setFixedExpensePayments(Array.isArray(payload.fixedExpensePayments) ? payload.fixedExpensePayments : []);
    setBankLedgerRules(normalizeBankLedgerMatchRules(payload.bankLedgerRules));
    setExpenseCategories(normalizeExpenseCategories(payload.expenseCategories, payload.companyExpenses || []));
    setFixedExpenseCategories(
      normalizeFixedExpenseCategories(payload.fixedExpenseCategories, payload.fixedExpenses || []),
    );
    setCompanyNotices(normalizeCompanyNotices(payload.companyNotices));
    setWorkPosts(normalizeWorkPosts(payload.workPosts));
    setTaxInvoices(normalizeTaxInvoices(payload.taxInvoices));
    setBankTransactions(normalizeBankTransactions(payload.bankTransactions));
    setBankTransactionFolders(normalizeBankTransactionFolders(payload.bankTransactionFolders));
    setStatementGenerationLogs(normalizeStatementGenerationLogs(payload.statementGenerationLogs));
    setStatementFolders(normalizeStatementFolders(payload.statementFolders));
    setCompanyProfile(normalizeCompanyProfile(payload.companyProfile));
    setAuditLogs((prev) => appendAuditLogs(prev, buildAuditEntries({
      entityType: "system",
      entityId: "import",
      entityLabel: "ERP 데이터",
      screen: source,
      user: currentUser,
      action: "import",
      changes: [{
        field: "dataset",
        fieldLabel: "일괄 적용",
        before: "-",
        after: `매출 ${salesCount}건 · 입금 ${paymentCount}건 · ${dateRange}`,
      }],
    })));
    window.alert(`데이터를 불러왔습니다.\n매출 ${salesCount}건 · 입금 ${paymentCount}건 · 기간 ${dateRange}`);
  };

  const handleExcelImport = async (file) => {
    try {
      const payload = await parseErpExcelFile(file);
      applyErpImport(payload, "엑셀 불러오기");
    } catch (error) {
      console.error(error);
      window.alert("엑셀 파일을 읽는 중 오류가 발생했습니다.");
    }
  };

  const handleLoadBundledSeed = async () => {
    const payload = await fetchBundledErpSeed();
    if (!payload) {
      window.alert("번들 seed 파일(erp-seed.json)을 찾을 수 없습니다.");
      return;
    }
    applyErpImport(payload, "번들 데이터 적용");
  };

  const handleLogin = async (user, erpVersion = null) => {
    let nextUser = user;
    if (apiMode) {
      if (typeof erpVersion === "number") {
        erpVersionRef.current = erpVersion;
        skipSaveRef.current = true;
      }
      nextUser = await syncLocalSidebarOrderIfNeeded(user, updateSidebarOrderApi);
    } else {
      setLoginLogs((prev) => appendLoginLogs(prev, [buildLoginLogEntry(user)]));
    }
    setCurrentUser(nextUser);
    const order = resolveSidebarOrder(nextUser);
    setSidebarOrder(order);
    cacheSidebarOrderFromUser(nextUser);
    if (!apiMode) saveSessionUser(nextUser);
  };

  const handleLogout = () => {
    if (apiMode) clearAuthSession();
    else saveSessionUser(null);
    setCurrentUser(null);
    setSyncStatus("");
    setDataReady(!apiMode);
  };

  useEffect(() => {
    const order = resolveSidebarOrder(currentUser);
    setSidebarOrder(order);
    cacheSidebarOrderFromUser(currentUser);
  }, [currentUser?.id, currentUser?.sidebarOrder]);

  useEffect(() => {
    if (!apiMode || !currentUser?.id) return;
    let cancelled = false;
    (async () => {
      const synced = await syncLocalSidebarOrderIfNeeded(currentUser, updateSidebarOrderApi);
      if (cancelled || synced === currentUser) return;
      setCurrentUser(synced);
    })();
    return () => {
      cancelled = true;
    };
  }, [apiMode, currentUser?.id]);

  useEffect(() => {
    if (!dataReady || !currentUser) return;
    const result = syncFixedExpenseAutomation({
      fixedExpenses,
      fixedExpensePayments,
      bankTransactions,
      bankLedgerRules,
      companyExpenses,
      createdBy: currentUser.name || currentUser.loginId || "",
    });
    if (!result.generatedCount && !result.linkedCount && !result.removedDuplicateCount) return;
    setFixedExpensePayments(result.fixedExpensePayments);
    setBankTransactions(result.bankTransactions);
    const parts: string[] = [];
    if (result.generatedCount) parts.push(`\uACE0\uC815\uBE44 \uB0A9\uBD80 ${result.generatedCount}\uAC74 \uC0DD\uC131`);
    if (result.linkedCount) parts.push(`\uD1B5\uC7A5 ${result.linkedCount}\uAC74 \uC5F0\uACB0`);
    setAuditLogs((prev) =>
      appendAuditLogs(
        prev,
        buildAuditEntries({
          entityType: "system",
          entityId: "fixed-expense-automation",
          entityLabel: "\uACE0\uC815\uBE44 \uC790\uB3D9\uD654",
          screen: "\uC790\uB3D9\uCC98\uB9AC",
          user: null,
          action: "import",
          changes: [
            {
              field: "summary",
              fieldLabel: "\uC790\uB3D9 \uCC98\uB9AC",
              before: "-",
              after: parts.join(" \u00B7 "),
            },
          ],
        }),
      ),
    );
  }, [dataReady, currentUser, fixedExpenses, fixedExpensePayments, bankTransactions, bankLedgerRules]);

  const applyRemoteBankSnapshot = React.useCallback((snapshot: BankSyncSnapshot) => {
    skipSaveRef.current = true;
    const nextVersion = snapshot.version ?? erpVersionRef.current;
    erpVersionRef.current = nextVersion;
    setErpVersion(nextVersion);
    if (Array.isArray(snapshot.bankTransactions)) {
      setBankTransactions(normalizeBankTransactions(snapshot.bankTransactions));
    }
    if (Array.isArray(snapshot.bankTransactionFolders)) {
      setBankTransactionFolders(normalizeBankTransactionFolders(snapshot.bankTransactionFolders));
    }
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    if (!canUserAccessPage(currentUser, active)) {
      setActive(getDefaultPageForUser(currentUser));
    }
  }, [currentUser, active]);

  if (!currentUser) return <LoginScreen onLogin={handleLogin} />;

  if (apiMode && !dataReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-700" lang="ko">
        <div className="text-center">
          <p className="erp-text-section font-bold">서버에서 데이터를 불러오는 중...</p>
          <p className="erp-text-body mt-2 text-slate-500">잠시만 기다려 주세요.</p>
        </div>
      </div>
    );
  }

  const activeLabel = getPageLabel(active);

  return (
    <AuditProvider auditLogs={auditLogs} setAuditLogs={setAuditLogs} currentUser={currentUser}>
    <SalePaymentLinkProvider paymentVouchers={paymentVouchers} bankTransactions={bankTransactions}>
    <div className="erp-app-shell flex min-h-screen bg-slate-50 text-slate-900" lang="ko">
      <Sidebar
        active={active}
        setActive={setActive}
        currentUser={currentUser}
        sidebarOrder={sidebarOrder}
        onLogout={handleLogout}
        onOpenMyAccount={() => {
          setMyAccountOpen(true);
          setSidebarOpen(false);
        }}
        onOpenMenuOrder={() => {
          setSidebarMenuOrderOpen(true);
          setSidebarOpen(false);
        }}
        mobileOpen={sidebarOpen}
        onMobileClose={() => setSidebarOpen(false)}
        syncStatus={apiMode ? syncStatus : ""}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white/95 px-3 py-3 backdrop-blur lg:hidden erp-mobile-header">
          <button
            type="button"
            className="erp-touch-target rounded-xl border border-slate-200 p-2 text-slate-700"
            onClick={() => setSidebarOpen(true)}
            aria-label="메뉴 열기"
          >
            <Menu size={20} />
          </button>
          <div className="min-w-0">
            <div className="truncate erp-text-body font-black">TeamMillimeter ERP</div>
            <div className="truncate erp-text-caption text-slate-500">{activeLabel}</div>
          </div>
        </header>
        <main className="min-w-0 flex-1 p-3 sm:p-4 lg:p-6">
        <PageKeepAlive pageKey="dashboard" active={active}>
          <Dashboard sales={appliedSales} paymentVouchers={paymentVouchers} workers={workers} />
        </PageKeepAlive>
        <PageKeepAlive pageKey="calendar" active={active}>
          <CalendarPage
            sales={appliedSales}
            setSales={setSales}
            clients={clients}
            workers={workers}
            currentUser={currentUser}
            paymentVouchers={paymentVouchers}
            setPaymentVouchers={setPaymentVouchers}
            setPaymentInputLogs={setPaymentInputLogs}
            companyProfile={companyProfile}
            statementGenerationLogs={statementGenerationLogs}
            setStatementGenerationLogs={setStatementGenerationLogs}
            statementFolders={statementFolders}
            setStatementFolders={setStatementFolders}
            autoLinkedSaleIds={autoLinkedSaleIds}
            manualLinkedSaleIds={manualLinkedSaleIds}
          />
        </PageKeepAlive>
        <PageKeepAlive pageKey="attendance" active={active}>
          <AttendancePage
            attendanceRecords={attendanceRecords}
            setAttendanceRecords={setAttendanceRecords}
            currentUser={currentUser}
          />
        </PageKeepAlive>
        <PageKeepAlive pageKey="salesInput" active={active}>
          <SalesRegistrationPage sales={sales} setSales={setSales} setActive={setActive} clients={clients} workers={workers} currentUser={currentUser} />
        </PageKeepAlive>
        <PageKeepAlive pageKey="sales" active={active}>
          <SalesManagementPage sales={appliedSales} paymentVouchers={paymentVouchers} workers={workers} setSales={setSales} setActive={setActive} currentUser={currentUser} />
        </PageKeepAlive>
        <PageKeepAlive pageKey="salesVoucherSearch" active={active}>
          <SalesVoucherSearchPage
            sales={appliedSales}
            setSales={setSales}
            clients={clients}
            workers={workers}
            currentUser={currentUser}
            setPaymentVouchers={setPaymentVouchers}
            pendingVoucherId={pendingVoucherEditId}
            pendingSearchFilter={pendingVoucherSearchFilter}
            onPendingVoucherConsumed={() => setPendingVoucherEditId(null)}
            onPendingSearchConsumed={() => setPendingVoucherSearchFilter(null)}
            autoLinkedSaleIds={autoLinkedSaleIds}
            manualLinkedSaleIds={manualLinkedSaleIds}
          />
        </PageKeepAlive>
        <PageKeepAlive pageKey="receivables" active={active}>
          <PaymentReceivablesPage
            sales={appliedSales}
            receivableRows={receivableRowsFromSales}
            clients={clients}
            paymentVouchers={paymentVouchers}
            setPaymentVouchers={setPaymentVouchers}
            paymentInputLogs={paymentInputLogs}
            setPaymentInputLogs={setPaymentInputLogs}
            currentUser={currentUser}
            autoLinkedSaleIds={autoLinkedSaleIds}
            manualLinkedSaleIds={manualLinkedSaleIds}
          />
        </PageKeepAlive>
        <PageKeepAlive pageKey="workerPayments" active={active}>
          <WorkerPaymentsPage
            workers={workers}
            sales={appliedSales}
            workerPaymentRecords={workerPaymentRecords}
            setWorkerPaymentRecords={setWorkerPaymentRecords}
            bankTransactions={bankTransactions}
            bankTransactionFolders={bankTransactionFolders}
            workerPayoutVouchers={workerPayoutVouchers}
            setWorkerPayoutVouchers={setWorkerPayoutVouchers}
            currentUser={currentUser}
          />
        </PageKeepAlive>
        <PageKeepAlive pageKey="accounting" active={active}>
          <AccountingHubPage
            isHubActive={active === "accounting"}
            bank={{
              bankTransactions,
              setBankTransactions,
              bankTransactionFolders,
              setBankTransactionFolders,
              apiMode,
              erpVersion,
              onApplyRemoteBankSnapshot: applyRemoteBankSnapshot,
              clients,
              setClients,
              workers,
              receivableRows: receivableRowsFromSales,
              sales: appliedSales,
              paymentVouchers,
              setPaymentVouchers,
              setPaymentInputLogs,
              companyExpenses,
              setCompanyExpenses,
              fixedExpenses,
              setFixedExpenses,
              fixedExpensePayments,
              setFixedExpensePayments,
              bankLedgerRules,
              setBankLedgerRules,
              expenseCategories,
              setExpenseCategories,
              fixedExpenseCategories,
              setFixedExpenseCategories,
              currentUser,
            }}
            ledger={{
              companyExpenses,
              setCompanyExpenses,
              expenseCategories,
              setExpenseCategories,
              fixedExpenseCategories,
              setFixedExpenseCategories,
              fixedExpenses,
              setFixedExpenses,
              fixedExpensePayments,
              setFixedExpensePayments,
              bankTransactions,
              setBankTransactions,
              bankLedgerRules,
              setBankLedgerRules,
              currentUser,
            }}
            tax={{
              taxInvoices,
              setTaxInvoices,
              clients,
              currentUser,
            }}
          />
        </PageKeepAlive>
        <PageKeepAlive pageKey="companyNotices" active={active}>
          <CompanyNoticeBoardPage
            companyNotices={companyNotices}
            setCompanyNotices={setCompanyNotices}
            workPosts={workPosts}
            setWorkPosts={setWorkPosts}
            currentUser={currentUser}
          />
        </PageKeepAlive>
        <PageKeepAlive pageKey="clients" active={active}>
          <ClientsPage clients={clients} setClients={setClients} sales={appliedSales} companyProfile={companyProfile} />
        </PageKeepAlive>
        <PageKeepAlive pageKey="workers" active={active}>
          <WorkersPage workers={workers} setWorkers={setWorkers} companyProfile={companyProfile} />
        </PageKeepAlive>
        <PageKeepAlive pageKey="companyProfile" active={active}>
          <CompanyProfilePage companyProfile={companyProfile} setCompanyProfile={setCompanyProfile} />
        </PageKeepAlive>
        <PageKeepAlive pageKey="reports" active={active}>
          <ReportsPage
            sales={appliedSales}
            workers={workers}
            paymentVouchers={paymentVouchers}
            onRequestClientStatement={(draft) => {
              setStatementDraft(draft);
              setActive("statements");
            }}
            autoLinkedSaleIds={autoLinkedSaleIds}
            manualLinkedSaleIds={manualLinkedSaleIds}
          />
        </PageKeepAlive>
        <PageKeepAlive pageKey="auditLog" active={active}>
          <AuditLogPage />
        </PageKeepAlive>
        {canUserAccessPage(currentUser, "loginHistory") ? (
          <PageKeepAlive pageKey="loginHistory" active={active}>
            <LoginHistoryPage loginLogs={loginLogs} />
          </PageKeepAlive>
        ) : null}
        <PageKeepAlive pageKey="statements" active={active}>
          <StatementsPage
            sales={appliedSales}
            clientMaster={clients}
            workerMaster={workers}
            companyProfile={companyProfile}
            statementGenerationLogs={statementGenerationLogs}
            setStatementGenerationLogs={setStatementGenerationLogs}
            statementFolders={statementFolders}
            setStatementFolders={setStatementFolders}
            currentUser={currentUser}
            draft={statementDraft}
            onDraftConsumed={() => setStatementDraft(null)}
          />
        </PageKeepAlive>
        <PageKeepAlive pageKey="pdfArchive" active={active}>
          <PdfArchivePage isActive={active === "pdfArchive"} bankTransactions={bankTransactions} />
        </PageKeepAlive>
        {canUserAccessPage(currentUser, "usersAdmin") ? (
          <PageKeepAlive pageKey="usersAdmin" active={active}>
            <UsersAdminPage
              currentUser={currentUser}
              onBackup={backupData}
              onRestore={restoreBackup}
              onExcelImport={handleExcelImport}
              onLoadBundledSeed={handleLoadBundledSeed}
            />
          </PageKeepAlive>
        ) : null}
        </main>
      </div>
      <MyAccountModal
        open={myAccountOpen}
        currentUser={currentUser}
        apiMode={apiMode}
        onClose={() => setMyAccountOpen(false)}
        onUserUpdated={(user) => {
          setCurrentUser(user);
          if (!apiMode) saveSessionUser(user);
        }}
      />
      <SidebarMenuOrderModal
        open={sidebarMenuOrderOpen}
        pages={getAccessiblePageDefs(currentUser)}
        savedOrder={sidebarOrder}
        apiMode={apiMode}
        onClose={() => setSidebarMenuOrderOpen(false)}
        onSave={async (order) => {
          if (currentUser?.id == null) return;
          saveSidebarOrder(currentUser.id, order);
          setSidebarOrder(order);
          if (apiMode) {
            const user = await updateSidebarOrderApi(order);
            setCurrentUser(user);
            cacheSidebarOrderFromUser(user);
            return;
          }
          const nextUser = { ...currentUser, sidebarOrder: order };
          setCurrentUser(nextUser);
          saveSessionUser(nextUser);
        }}
      />
    </div>
    </SalePaymentLinkProvider>
    </AuditProvider>
  );
}
