import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BarChart3,
  Building2,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  Download,
  FileSpreadsheet,
  History,
  Home,
  Layers,
  LockKeyhole,
  LogOut,
  MapPin,
  Menu,
  Pencil,
  Plus,
  Save,
  Search,
  Trash2,
  Users,
  WalletCards,
  FileText,
  X,
  Archive,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createPdfPreviewWindow, downloadPdfFromHtmlElement, revokePdfBlobUrl } from "@/utils/statementPdf";
import { fetchBundledErpSeed, parseErpExcelFile } from "@/utils/excelImport";
import { buildAnalysisReport, buildClientPivotReport, buildMonthlyPivotReport, buildQuarterlyPivotReport, buildWorkerPivotReport } from "@/utils/pivotReports";
import { sortRowsByColumn } from "@/utils/pivotSort";
import { AuditProvider, useAudit } from "@/context/AuditContext";
import { AuditField, AuditCellHint, EntityAuditButton } from "@/components/AuditField";
import { AuditLogPage } from "@/components/AuditLogPage";
import { SalesManagementPage } from "@/components/SalesManagementPage";
import { PaymentReceivablesPage } from "@/components/PaymentReceivablesPage";
import { WorkerPaymentsPage } from "@/components/WorkerPaymentsPage";
import { PdfArchivePage } from "@/components/PdfArchivePage";
import { TableExportSection } from "@/components/TableExportSection";
import { ClientStatementSheet } from "@/components/ClientStatementSheet";
import { WorkerStatementSheet } from "@/components/WorkerStatementSheet";
import {
  buildClientStatementDetailDisplayRows,
  buildClientStatementRows,
  buildClientStatementSummary,
  buildClientStatementSummaryDisplayRows,
} from "@/utils/statementSheets";
import { buildWorkerStatementSummary } from "@/utils/workerPayments";
import { buildReceivableRowsFromSales, getStatus, getUnpaid, parseMoney } from "@/utils/receivables";
import { getSaleStaffCount, getSaleTotalBill, normalizeSalesRecords } from "@/utils/saleBilling";
import { archiveGeneratedPdf } from "@/utils/pdfArchive";
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
} from "@/utils/auditLog";
import {
  buildWorkerFeeMap,
  calculateWorkerLineAmounts,
  enrichWorkerLineWithMetrics,
  resolveWorkerFeeRate,
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
} from "@/utils/erpApi";

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

function normalizeBackupPayload(raw) {
  if (!raw || typeof raw !== "object") throw new Error("invalid backup");
  return migrateClientName({
    sales: Array.isArray(raw.sales) ? raw.sales : initialSales,
    paymentVouchers: Array.isArray(raw.paymentVouchers) ? raw.paymentVouchers : [],
    clients: Array.isArray(raw.clients) && raw.clients.length ? raw.clients : initialClients,
    workers: Array.isArray(raw.workers) && raw.workers.length ? raw.workers : initialWorkers,
    auditLogs: Array.isArray(raw.auditLogs) ? raw.auditLogs : [],
  });
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
  workers: Array.from({ length: 5 }, (_, index) => createWorkerLine(index)),
};

const compactSaleForm = () => ({
  ...emptySaleForm,
  workers: Array.from({ length: 8 }, (_, index) => createWorkerLine(index)),
});

function saleRowToForm(row, minWorkerRows = 8) {
  const workerLines = row.workers?.length
    ? row.workers.map((line, index) => ({ ...createWorkerLine(index), ...line }))
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
}) {
  const footerStatus = saveMessage || statusMessage || (canSave
    ? `${form.client}${form.site ? ` · ${form.site}` : ""} · ${formatKRW(totals.bill)}`
    : null);

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
          <div className="erp-sale-form-compact-metrics">
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
        </div>
      </div>

      <Card className="erp-sale-form-card erp-sale-form-card--compact rounded-xl border-slate-200/80 shadow-sm">
        <CardContent className="p-3 md:p-4">
          <div className="erp-sale-form-inline-grid">
            <SaleFormField label="일자" icon={CalendarDays}>
              <Input type="date" className="erp-input-compact" value={form.date} onChange={(e) => update("date", e.target.value)} />
            </SaleFormField>
            <SaleFormField label="거래처" icon={Building2}>
              <AutocompleteInput
                value={form.client}
                options={clients}
                onChange={(value) => update("client", value)}
                placeholder="거래처"
                inputProps={{ className: "erp-input-compact" }}
                renderSub={(client) => `${client.manager || "담당자 없음"} · ${formatKRW(client.constructionCost || 0)}`}
              />
            </SaleFormField>
            <SaleFormField label="현장" icon={MapPin}>
              <Input className="erp-input-compact" value={form.site} onChange={(e) => update("site", e.target.value)} placeholder="현장명" />
            </SaleFormField>
            <SaleFormField label="입금" icon={CreditCard}>
              <Input className="erp-input-compact" inputMode="numeric" value={form.paid} onChange={(e) => update("paid", e.target.value)} placeholder="0" />
            </SaleFormField>
            <SaleFormField label="비고" icon={FileText}>
              <Input className="erp-input-compact" value={form.memo} onChange={(e) => update("memo", e.target.value)} placeholder="메모" />
            </SaleFormField>
          </div>

          <div className="erp-sale-form-table-toolbar">
            <span className="erp-text-caption font-semibold text-slate-500">시공자 내역</span>
            <Button variant="outline" size="sm" className="h-7 rounded-lg px-2 text-xs" onClick={addWorkerLine}>
              <Plus size={12} />
              행 추가
            </Button>
          </div>

          <TableExportSection fileName="매출등록_시공자" title="매출등록 시공자 내역" disabled={form.workers.length === 0}>
          <div className="erp-sale-form-table-wrap erp-sale-form-table-wrap--compact">
            <table className="erp-table erp-worker-grid-table erp-sale-form-table erp-sale-form-table--compact">
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
                      <td className="text-center">
                        <span className={`erp-sale-form-row-no ${hasWorker ? "is-active" : ""}`}>{index + 1}</span>
                      </td>
                      <td className="erp-grid-worker p-1">
                        <WorkerGridWorkerInput rowIndex={index} rowCount={form.workers.length} workers={workers} value={line.worker} onChange={(value) => updateWorkerLine(index, "worker", value)} placeholder="시공자" className="erp-grid-input erp-input-compact" />
                      </td>
                      <td className="erp-grid-qty p-1"><WorkerGridInput rowIndex={index} columnKey="quantity" rowCount={form.workers.length} className="erp-grid-input erp-input-compact" value={line.quantity} onChange={(e) => updateWorkerLine(index, "quantity", e.target.value)} placeholder="1" /></td>
                      <td className="erp-grid-num p-1"><WorkerGridInput rowIndex={index} columnKey="unitCost" rowCount={form.workers.length} className="erp-grid-input erp-input-compact" value={line.unitCost} onChange={(e) => updateWorkerLine(index, "unitCost", e.target.value)} /></td>
                      <td className="erp-grid-num p-1"><WorkerGridInput rowIndex={index} columnKey="chargeAmount" rowCount={form.workers.length} className="erp-grid-input erp-input-compact" value={line.chargeAmount} onChange={(e) => updateWorkerLine(index, "chargeAmount", e.target.value)} /></td>
                      <td className="erp-grid-num p-1"><WorkerGridInput rowIndex={index} columnKey="meal" rowCount={form.workers.length} className="erp-grid-input erp-input-compact" value={line.meal} onChange={(e) => updateWorkerLine(index, "meal", e.target.value)} /></td>
                      <td className="erp-grid-num p-1"><WorkerGridInput rowIndex={index} columnKey="lodging" rowCount={form.workers.length} className="erp-grid-input erp-input-compact" value={line.lodging} onChange={(e) => updateWorkerLine(index, "lodging", e.target.value)} /></td>
                      <td className="erp-grid-num p-1"><WorkerGridInput rowIndex={index} columnKey="expense" rowCount={form.workers.length} className="erp-grid-input erp-input-compact" value={line.expense} onChange={(e) => updateWorkerLine(index, "expense", e.target.value)} /></td>
                      <td className="erp-grid-num p-1"><WorkerGridInput rowIndex={index} columnKey="overtimeHours" rowCount={form.workers.length} className="erp-grid-input erp-input-compact" value={line.overtimeHours} onChange={(e) => updateWorkerLine(index, "overtimeHours", e.target.value)} /></td>
                      <td className="erp-grid-num p-1"><WorkerGridInput rowIndex={index} columnKey="overtimeCost" rowCount={form.workers.length} className="erp-grid-input erp-input-compact" value={line.overtimeCost} onChange={(e) => updateWorkerLine(index, "overtimeCost", e.target.value)} /></td>
                      <td className="p-1"><WorkerGridInput rowIndex={index} columnKey="memo" rowCount={form.workers.length} className="erp-grid-input erp-input-compact" value={line.memo} onChange={(e) => updateWorkerLine(index, "memo", e.target.value)} placeholder="비고" /></td>
                      <td className="p-1 erp-table-export-skip text-center">
                        <button type="button" className="erp-sale-form-row-delete" onClick={() => removeWorkerLine(index)} disabled={form.workers.length <= 1} aria-label="행 삭제">
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

          <div className="erp-sale-form-footer erp-sale-form-footer--compact">
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
                  <span>거래처·현장·청구액 입력 필요</span>
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
    </>
  );
}

function formatKRW(value) {
  return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 }).format(Number(value) || 0);
}

function getSaleWorkerHeadcount(sale) {
  return getSaleStaffCount(sale);
}

function buildCalendarDays(monthKey, sales) {
  const [yearText, monthText] = monthKey.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const startOffset = firstDay.getDay();
  const daysInMonth = lastDay.getDate();

  const statsByDate = sales.reduce((acc, sale) => {
    if (!String(sale.date || "").startsWith(monthKey)) return acc;
    const key = sale.date;
    if (!acc[key]) acc[key] = { staff: 0, salesAmount: 0, spendAmount: 0, count: 0 };
    acc[key].staff += getSaleWorkerHeadcount(sale);
    acc[key].salesAmount += getSaleTotalBill(sale);
    acc[key].spendAmount += (sale.workers || []).reduce((sum, line) => sum + calculateWorkerLine(line).spend, 0);
    acc[key].count += 1;
    return acc;
  }, {});

  const cells = [];
  for (let i = 0; i < startOffset; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${monthKey}-${String(day).padStart(2, "0")}`;
    cells.push({ date, day, stats: statsByDate[date] || { staff: 0, salesAmount: 0, spendAmount: 0, count: 0 } });
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
    .map((line) => enrichWorkerLineWithMetrics(line, resolveWorkerFeeRate(line, feeMap)));
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
    memo: form.memo,
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
      const target = copied.find((row) => row.id === voucher.salesId);
      if (target) remaining = applyToRow(target, remaining);
      if (remaining > 0) {
        clientCredits[voucher.client] = (clientCredits[voucher.client] || 0) + remaining;
      }
      return;
    }

    copied
      .filter((row) => row.client === voucher.client && !row.manualPaidCleared)
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
  const { className = "", lang, type, inputMode, value, onChange, onCompositionStart, onCompositionEnd, ...rest } = props;
  const isNumericField = type === "number" || type === "date" || inputMode === "numeric" || inputMode === "decimal";
  const composingRef = useRef(false);
  const [localValue, setLocalValue] = useState(value ?? "");

  useEffect(() => {
    if (!composingRef.current) setLocalValue(value ?? "");
  }, [value]);

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
        setLocalValue(event.target.value);
        if (!composingRef.current) onChange?.(event);
      }}
      onCompositionStart={(event) => {
        composingRef.current = true;
        erpInputComposing = true;
        onCompositionStart?.(event);
      }}
      onCompositionEnd={(event) => {
        composingRef.current = false;
        erpInputComposing = false;
        setLocalValue(event.currentTarget.value);
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
  const q = String(query || "").trim().toLowerCase();
  if (!q) return [];

  return workers
    .filter((worker) => String(worker.name || "").toLowerCase().includes(q))
    .sort((a, b) => {
      const aName = String(a.name || "");
      const bName = String(b.name || "");
      const aStarts = aName.toLowerCase().startsWith(q);
      const bStarts = bName.toLowerCase().startsWith(q);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      return aName.localeCompare(bName, "ko-KR");
    })
    .slice(0, limit);
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

function WorkerGridInput({ rowIndex, columnKey, rowCount, className = "", ...props }) {
  const isNumeric = workerGridNumericColumns.has(columnKey);

  return (
    <Input
      {...props}
      type="text"
      data-worker-row={rowIndex}
      data-worker-col={columnKey}
      className={`erp-grid-input ${isNumeric ? "erp-grid-input--num" : ""} ${className}`.trim()}
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
  const query = value ?? "";
  const suggestions = useMemo(() => filterWorkerSuggestions(workers, query), [workers, query]);
  const canPick = menuOpen && suggestions.length > 0 && query.length > 0;

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
        onChange={(event) => {
          onChange(event.target.value);
          setMenuOpen(true);
          setHighlightIndex(0);
        }}
        onFocus={(event) => {
          event.currentTarget.setAttribute("lang", "ko");
          event.currentTarget.removeAttribute("inputmode");
          if (String(value ?? "").length > 0) setMenuOpen(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setTimeout(() => setMenuOpen(false), 150);
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
        }}
      />

      {canPick && (
        <div className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-2xl border bg-white shadow-xl">
          {suggestions.map((worker, index) => (
            <button
              key={String(worker.id ?? worker.name)}
              type="button"
              className={`w-full border-b px-4 py-3 text-left hover:bg-slate-50 ${highlightIndex === index ? "bg-slate-50" : ""}`}
              onMouseEnter={() => setHighlightIndex(index)}
              onMouseDown={(event) => {
                event.preventDefault();
                pickWorker(worker);
              }}
            >
              <div className="font-semibold text-slate-900">{worker.name}</div>
              <div className="erp-text-caption mt-1 text-slate-500">
                {`${worker.phone || "연락처 없음"} · ${formatKRW(worker.constructionCost || 0)}`}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AutocompleteInput({
  value,
  onChange,
  options = [],
  placeholder = "",
  renderSub,
  inputProps = {},
  limit = 12,
  freeSolo = true,
  showOptionsOnFocus,
}) {
  const [focused, setFocused] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [inputText, setInputText] = useState("");
  const openOnFocus = showOptionsOnFocus ?? !inputProps.excelGrid;

  const passthroughInputProps = Object.fromEntries(
    Object.entries(inputProps).filter(([key]) => !["onKeyDown", "excelGrid", "showOptionsOnFocus"].includes(key))
  );

  const normalizedOptions = options.map((item) =>
    typeof item === "string"
      ? { label: item, value: item, raw: item }
      : {
          label: item.label ?? item.name ?? String(item.value ?? ""),
          value: item.value ?? item.name ?? item.label ?? "",
          raw: item,
        }
  );

  const selectedOption = normalizedOptions.find((item) => item.value === value);
  const resolvedLabel = selectedOption?.label ?? String(value ?? "");

  useEffect(() => {
    if (!focused) setInputText(resolvedLabel);
  }, [resolvedLabel, focused]);

  const commitInputText = (nextText) => {
    setInputText(nextText);
    if (freeSolo) onChange(nextText);
    setHighlightedIndex(0);
  };

  const filtered = normalizedOptions
    .filter((item) => item.label.toLowerCase().includes(String(inputText || "").toLowerCase()))
    .sort((a, b) => {
      const query = String(inputText || "").toLowerCase();
      const aStarts = query && a.label.toLowerCase().startsWith(query);
      const bStarts = query && b.label.toLowerCase().startsWith(query);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      return a.label.localeCompare(b.label, "ko-KR");
    })
    .slice(0, limit);

  const selectItem = (item) => {
    if (!item) return;
    setInputText(item.label);
    onChange(item.value, item.raw);
    setFocused(false);
  };

  const canShowDropdown = focused && filtered.length > 0 && (inputText.length > 0 || openOnFocus);
  const canPickFromDropdown = canShowDropdown && inputText.length > 0;

  return (
    <div className="relative">
      <Input
        value={inputText}
        onChange={(e) => commitInputText(e.target.value)}
        placeholder={placeholder}
        lang="ko"
        inputMode="text"
        onFocus={() => {
          setFocused(true);
          setHighlightedIndex(0);
        }}
        onBlur={() => {
          setTimeout(() => {
            setFocused(false);
            if (!freeSolo) setInputText(resolvedLabel);
          }, 150);
        }}
        onKeyDown={(e) => {
          if (isImeActive(e)) return;

          const dropdownUsesVerticalKeys = canPickFromDropdown;

          if (dropdownUsesVerticalKeys && e.key === "ArrowDown") {
            e.preventDefault();
            setHighlightedIndex((prev) => (prev + 1) % filtered.length);
            return;
          }

          if (dropdownUsesVerticalKeys && e.key === "ArrowUp") {
            e.preventDefault();
            setHighlightedIndex((prev) => (prev - 1 + filtered.length) % filtered.length);
            return;
          }

          if (canPickFromDropdown && e.key === "Enter") {
            e.preventDefault();
            selectItem(filtered[highlightedIndex] || filtered[0]);
            return;
          }

          if (canPickFromDropdown && e.key === "Tab") {
            selectItem(filtered[highlightedIndex] || filtered[0]);
            return;
          }

          inputProps.onKeyDown?.(e);
        }}
        {...passthroughInputProps}
      />

      {canShowDropdown && (
        <div className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-2xl border bg-white shadow-xl">
          {filtered.map((item, index) => (
            <button
              key={`${item.value}-${index}`}
              type="button"
              className={`w-full border-b px-4 py-3 text-left hover:bg-slate-50 ${highlightedIndex === index ? "bg-slate-50" : ""}`}
              onMouseEnter={() => setHighlightedIndex(index)}
              onMouseDown={(e) => {
                e.preventDefault();
                selectItem(item);
              }}
            >
              <div className="font-semibold text-slate-900">{item.label}</div>
              {renderSub && (
                <div className="erp-text-caption mt-1 text-slate-500">
                  {renderSub(item.raw)}
                </div>
              )}
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

function AutocompleteSelect({ value, onChange, options, placeholder = "선택", renderSub, inputProps = {} }) {
  return (
    <AutocompleteInput
      value={value}
      onChange={onChange}
      options={options}
      placeholder={placeholder}
      renderSub={renderSub}
      freeSolo={false}
      limit={8}
      inputProps={inputProps}
    />
  );
}

function SummaryCard({ title, value, sub, tone = "default", icon: Icon }) {
  const toneClass = tone === "danger" ? "text-red-600" : tone === "success" ? "text-emerald-600" : "text-slate-900";
  return (
    <Card className="erp-summary-card rounded-2xl shadow-sm">
      <CardContent className="p-4 md:p-5">
        <div className="flex items-start justify-between gap-2 md:gap-3">
          <div className="min-w-0 flex-1">
            <div className="erp-text-caption font-semibold text-slate-500">{title}</div>
            <div className={`erp-text-stat mt-1.5 md:mt-2 ${toneClass}`}>{value}</div>
            <div className="erp-text-caption mt-1 text-slate-400">{sub}</div>
          </div>
          {Icon && <div className="hidden shrink-0 rounded-2xl bg-slate-100 p-2.5 text-slate-700 xl:block md:p-3"><Icon size={20} /></div>}
        </div>
      </CardContent>
    </Card>
  );
}

function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState("admin@teammillimeter.com");
  const [password, setPassword] = useState("1234");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const apiMode = isApiModeEnabled();

  const submitLogin = async () => {
    if (apiMode) {
      setLoading(true);
      setError("");
      try {
        const user = await loginWithApi(email.trim(), password);
        onLogin(user);
      } catch (err) {
        setError(err instanceof Error ? err.message : "로그인에 실패했습니다.");
      } finally {
        setLoading(false);
      }
      return;
    }
    if (email.trim() === "admin@teammillimeter.com" && password === "1234") {
      setError("");
      onLogin({ name: "관리자", email: email.trim() });
      return;
    }
    setError("이메일 또는 비밀번호가 맞지 않습니다.");
  };

  return (
    <div className="min-h-screen bg-slate-950 p-4 text-white sm:p-6" lang="ko">
      <div className="mx-auto grid min-h-[calc(100vh-32px)] max-w-6xl grid-cols-1 items-center gap-8 lg:min-h-[calc(100vh-48px)] lg:grid-cols-2 lg:gap-10">
        <div>
          <div className="erp-text-body mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-slate-200 sm:mb-6">
            <LockKeyhole size={16} /> TeamMillimeter ERP
          </div>
          <h1 className="erp-text-page-title">팀밀리미터 업무를 한 곳에서 관리하세요.</h1>
          <p className="erp-text-body mt-4 max-w-xl text-slate-300 sm:mt-5">매출등록, 거래처 미수, 시공자 관리, 보고서를 하나의 ERP 화면에서 확인합니다.</p>
          {apiMode && (
            <p className="erp-text-caption mt-4 max-w-xl text-slate-400">
              서버 연동 모드 · admin / sales / finance 계정 (초기 비밀번호 1234)
            </p>
          )}
        </div>
        <Card className="rounded-3xl bg-white text-slate-900 shadow-2xl">
          <CardContent className="p-6 sm:p-8">
            <div className="mb-7">
              <h2 className="erp-text-section font-black">로그인</h2>
              <p className="erp-text-body mt-2 text-slate-500">ERP에 접속하려면 계정 정보를 입력하세요.</p>
            </div>
            <div className="space-y-4">
              <Field label="이메일"><Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@teammillimeter.com" /></Field>
              <Field label="비밀번호"><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="비밀번호" onKeyDown={(e) => e.key === "Enter" && !loading && submitLogin()} /></Field>
              {error && <div className="erp-text-body rounded-2xl bg-red-50 px-4 py-3 font-semibold text-red-600">{error}</div>}
              <Button className="erp-text-body w-full rounded-2xl py-5 font-bold md:py-6" onClick={submitLogin} disabled={loading}>
                {loading ? "로그인 중..." : "로그인"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Sidebar({ active, setActive, currentUser, onLogout, onBackup, onRestore, onExcelImport, onLoadBundledSeed, mobileOpen, onMobileClose, syncStatus }) {
  const backupInputRef = useRef(null);
  const excelInputRef = useRef(null);
  const items = [
    ["dashboard", "대시보드", Home],
    ["calendar", "캘린더", CalendarDays],
    ["salesInput", "매출등록", Plus],
    ["sales", "매출관리", FileSpreadsheet],
    ["salesVoucherSearch", "매출전표검색", Search],
    ["receivables", "입금/미수금", CreditCard],
    ["workerPayments", "시공자 지급", WalletCards],
    ["clients", "거래처", Building2],
    ["workers", "시공자", Users],
    ["reports", "보고서", BarChart3],
    ["auditLog", "감사로그", History],
    ["statements", "내역서", Download],
    ["pdfArchive", "PDF 보관함", Archive],
  ];

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
      <div className="mb-6 flex items-start justify-between lg:mb-8">
        <div>
          <div className="erp-text-section font-black tracking-tight">TeamMillimeter</div>
          <div className="erp-text-caption mt-1 text-slate-400">Web ERP MVP</div>
        </div>
        <button type="button" className="rounded-xl p-2 text-slate-300 hover:bg-slate-800 lg:hidden" onClick={onMobileClose} aria-label="메뉴 닫기">
          <X size={20} />
        </button>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto lg:space-y-2">
        {items.map(([key, label, Icon]) => (
          <button key={key} onClick={() => navigate(key)} className={`erp-text-body flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left font-semibold transition lg:px-4 lg:py-3 ${active === key ? "bg-white text-slate-950" : "text-slate-300 hover:bg-slate-800"}`}>
            <Icon size={18} /> {label}
          </button>
        ))}
      </nav>
      <div className="mt-4 shrink-0 rounded-2xl bg-slate-900 p-3 lg:mt-auto lg:p-4">
        <div className="erp-text-body font-bold">{currentUser.name}</div>
        <div className="erp-text-caption mt-1 text-slate-400">{currentUser.email}</div>
        {syncStatus && <div className="erp-text-caption mt-2 text-emerald-400">{syncStatus}</div>}
        <Button variant="outline" className="mt-4 w-full rounded-2xl border-slate-700 bg-transparent text-white hover:bg-slate-800" onClick={onBackup}>
          <Download size={16} /> 백업 저장
        </Button>
        <input
          ref={backupInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onRestore?.(file);
            event.target.value = "";
          }}
        />
        <Button variant="outline" className="mt-2 w-full rounded-2xl border-slate-700 bg-transparent text-white hover:bg-slate-800" onClick={() => backupInputRef.current?.click()}>
          <Download size={16} /> 백업 불러오기
        </Button>
        <input
          ref={excelInputRef}
          type="file"
          accept=".xlsm,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onExcelImport?.(file);
            event.target.value = "";
          }}
        />
        <Button variant="outline" className="mt-2 w-full rounded-2xl border-slate-700 bg-transparent text-white hover:bg-slate-800" onClick={() => excelInputRef.current?.click()}>
          <FileSpreadsheet size={16} /> 엑셀 불러오기
        </Button>
        <Button variant="outline" className="mt-2 w-full rounded-2xl border-slate-700 bg-transparent text-white hover:bg-slate-800" onClick={onLoadBundledSeed}>
          <FileSpreadsheet size={16} /> 번들 데이터 적용
        </Button>
        <Button variant="outline" className="mt-2 w-full rounded-2xl border-slate-700 bg-transparent text-white hover:bg-slate-800" onClick={onLogout}>
          <LogOut size={16} /> 로그아웃
        </Button>
      </div>
    </aside>
    </>
  );
}

function Dashboard({ sales }) {
  const totalSales = sales.reduce((sum, row) => sum + (row.amount || 0), 0);
  const totalPaid = sales.reduce((sum, row) => sum + (row.paid || 0), 0);
  const totalUnpaid = sales.reduce((sum, row) => sum + getUnpaid(row), 0);

  return (
    <div className="erp-page">
      <PageTitle title="대시보드" desc="팀밀리미터 ERP 주요 지표입니다." />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 xl:grid-cols-4">
        <SummaryCard title="총매출" value={formatKRW(totalSales)} sub={`${sales.length}건 기준`} icon={WalletCards} />
        <SummaryCard title="입금액" value={formatKRW(totalPaid)} sub="매출관리 기준" tone="success" icon={CreditCard} />
        <SummaryCard title="미수금" value={formatKRW(totalUnpaid)} sub="거래처 미수 기준" tone="danger" icon={CalendarDays} />
        <SummaryCard title="회수율" value={`${totalSales ? Math.round((totalPaid / totalSales) * 100) : 0}%`} sub="입금액 / 총매출" icon={BarChart3} />
      </div>
      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-4 md:p-5">
          <h2 className="erp-text-section mb-3 md:mb-4">최근 매출</h2>
          <SimpleSalesTable rows={sales.slice(0, 8)} exportFileName="대시보드_최근매출" exportTitle="대시보드 최근 매출" />
        </CardContent>
      </Card>
    </div>
  );
}

function CalendarPage({ sales }) {
  const [monthKey, setMonthKey] = useState(() => todayISO().slice(0, 7));
  const { cells, monthLabel } = useMemo(() => buildCalendarDays(monthKey, sales), [monthKey, sales]);

  const monthTotals = useMemo(() => {
    return cells.filter(Boolean).reduce(
      (acc, cell) => {
        acc.staff += cell.stats.staff;
        acc.salesAmount += cell.stats.salesAmount;
        acc.spendAmount += cell.stats.spendAmount;
        acc.count += cell.stats.count;
        return acc;
      },
      { staff: 0, salesAmount: 0, spendAmount: 0, count: 0 }
    );
  }, [cells]);

  const shiftMonth = (delta) => {
    const [yearText, monthText] = monthKey.split("-");
    const date = new Date(Number(yearText), Number(monthText) - 1 + delta, 1);
    setMonthKey(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`);
  };

  return (
    <div className="erp-page">
      <PageTitle title="캘린더" desc="엑셀 Calendar 시트처럼 일별 시공 인원·시공비·지출액을 확인합니다." />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 xl:grid-cols-4">
        <SummaryCard title="월간 전표" value={`${monthTotals.count}건`} sub={monthLabel} icon={FileSpreadsheet} />
        <SummaryCard title="시공 인원" value={`${monthTotals.staff}명`} sub="일별 인원 합계" icon={Users} />
        <SummaryCard title="총 시공비" value={formatKRW(monthTotals.salesAmount)} sub="거래처 청구 기준" icon={WalletCards} />
        <SummaryCard title="지출액" value={formatKRW(monthTotals.spendAmount)} sub="시공자 지급 기준" tone="success" icon={CreditCard} />
      </div>
      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-3 md:p-5">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="erp-text-section">{monthLabel}</h2>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="erp-text-caption rounded-2xl px-3 md:px-4" onClick={() => shiftMonth(-1)}>이전</Button>
              <Button variant="outline" className="erp-text-caption rounded-2xl px-3 md:px-4" onClick={() => setMonthKey(todayISO().slice(0, 7))}>이번 달</Button>
              <Button variant="outline" className="erp-text-caption rounded-2xl px-3 md:px-4" onClick={() => shiftMonth(1)}>다음</Button>
            </div>
          </div>
          <div className="erp-text-caption hidden grid-cols-7 gap-1 text-center font-bold text-slate-500 sm:grid md:gap-2">
            {["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map((label) => (
              <div key={label} className="py-1 md:py-2">{label}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1 md:gap-2">
            {cells.map((cell, index) => (
              cell ? (
                <div key={cell.date} className={`min-h-[72px] rounded-xl border p-1.5 text-left sm:min-h-[96px] sm:rounded-2xl sm:p-2 md:min-h-[110px] md:p-3 ${cell.stats.count ? "bg-white" : "bg-slate-50"}`}>
                  <div className="erp-calendar-day font-black text-slate-900">{cell.day}</div>
                  {cell.stats.count > 0 && (
                    <div className="erp-calendar-detail mt-1 space-y-0.5 text-slate-600">
                      <div className="hidden sm:block">인원 <b>{cell.stats.staff}</b></div>
                      <div className="truncate" title={formatKRW(cell.stats.salesAmount)}>{formatKRW(cell.stats.salesAmount)}</div>
                      <div className="hidden text-slate-500 md:block">지출 {formatKRW(cell.stats.spendAmount)}</div>
                    </div>
                  )}
                </div>
              ) : (
                <div key={`empty-${index}`} className="min-h-[72px] rounded-xl bg-transparent sm:min-h-[96px] md:min-h-[110px]" />
              )
            ))}
          </div>
        </CardContent>
      </Card>
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

function SimpleSalesTable({ rows, onRowClick, selectedRowId, exportFileName = "매출목록", exportTitle }) {
  const title = exportTitle || exportFileName;
  return (
    <TableExportSection fileName={exportFileName} title={title} disabled={rows.length === 0}>
      <div className="erp-table-wrap">
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
            return (
            <tr
              key={row.id}
              onClick={() => onRowClick?.(row)}
              className={`hover:bg-slate-50 ${onRowClick ? "cursor-pointer" : ""} ${isSelected ? "bg-sky-50 ring-1 ring-inset ring-sky-200" : ""}`}
            >
              <td className="whitespace-nowrap">{row.date}</td>
              <td className="font-semibold"><span className="erp-cell-truncate inline-block max-w-[7rem] md:max-w-none">{row.client}</span></td>
              <td><span className="erp-cell-truncate inline-block max-w-[8rem] md:max-w-none">{row.site}</span></td>
              <td className="hidden md:table-cell"><span className="erp-cell-truncate inline-block">{row.worker}</span></td>
              <td className="text-right font-bold whitespace-nowrap">{formatKRW(row.amount)}</td>
              <td className="text-right text-emerald-600 whitespace-nowrap">{formatKRW(row.paid)}</td>
              <td className="text-right text-red-600 font-bold whitespace-nowrap">{formatKRW(getUnpaid(row))}</td>
              <td className="hidden xl:table-cell">{row.createdBy || "-"}</td>
              <td className="hidden whitespace-nowrap xl:table-cell">{formatDateTime(row.createdAt)}</td>
            </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </TableExportSection>
  );
}

function SalesRegistrationPage({ setSales, setActive, clients, workers, currentUser }) {
  const { recordAudit } = useAudit();
  const [form, setForm] = useState(() => compactSaleForm());
  const [saveMessage, setSaveMessage] = useState("");
  const update = (key, value) => {
    setSaveMessage("");
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateWorkerLine = (index, key, value) => {
    setSaveMessage("");
    setForm((prev) => ({
      ...prev,
      workers: prev.workers.map((line, lineIndex) => {
        if (lineIndex !== index) return line;
        const nextLine = { ...line, [key]: value };
        if (key === "worker") {
          const selectedWorker = workers.find((worker) => worker.name === value);
          const selectedClient = clients.find((client) => client.name === prev.client);
          nextLine.quantity = nextLine.quantity || "1";
          nextLine.unitCost = selectedWorker?.constructionCost ? String(selectedWorker.constructionCost) : nextLine.unitCost;
          nextLine.chargeAmount = selectedWorker?.customChargeCost ? String(selectedWorker.customChargeCost) : selectedClient?.constructionCost ? String(selectedClient.constructionCost) : nextLine.chargeAmount;
          nextLine.overtimeCost = selectedClient?.overtimeCost ? String(selectedClient.overtimeCost) : selectedWorker?.overtimeCost ? String(selectedWorker.overtimeCost) : nextLine.overtimeCost || "30000";
          nextLine.feeRate = selectedWorker?.feeRate ?? nextLine.feeRate ?? "";
        }
        return nextLine;
      }),
    }));
  };

  const addWorkerLine = () => setForm((prev) => ({ ...prev, workers: [...prev.workers, createWorkerLine(prev.workers.length)] }));
  const removeWorkerLine = (index) => setForm((prev) => ({ ...prev, workers: prev.workers.length <= 1 ? prev.workers : prev.workers.filter((_, lineIndex) => lineIndex !== index) }));

  const totals = useMemo(() => sumWorkerFormTotals(form.workers, workers), [form.workers, workers]);
  const filledWorkerCount = useMemo(
    () => form.workers.filter((line) => String(line.worker || "").trim()).length,
    [form.workers]
  );
  const canSave = Boolean(form.client.trim() && form.site.trim() && totals.bill > 0);

  const saveNewSale = () => {
    const payload = buildSaleFromForm(form, currentUser, workers);
    if (!payload.client || !payload.site || payload.amount <= 0) return;
    const newId = Date.now();
    const manualPaid = parseMoney(form.paid);
    recordAudit({
      entityType: "sale",
      entityId: newId,
      entityLabel: `${payload.client} · ${payload.site}`,
      screen: "매출등록",
      action: "create",
      after: snapshotSaleForAudit({ ...payload, id: newId }),
      fields: SALE_AUDIT_FIELDS,
      user: currentUser,
    });
    setSales((prev) => [{
      id: newId,
      ...payload,
      paid: manualPaid > 0 ? Math.min(manualPaid, payload.amount) : 0,
      basePaid: manualPaid > 0 ? Math.min(manualPaid, payload.amount) : 0,
    }, ...prev]);
    setForm(compactSaleForm());
    setSaveMessage(`${payload.client} · ${payload.site} 매출이 저장되었습니다. 계속 등록할 수 있습니다.`);
  };

  return (
    <div className="erp-page erp-sale-form-page erp-sale-form-page--compact">
      <SaleFormCompactEditor
        title="매출등록"
        form={form}
        update={update}
        updateWorkerLine={updateWorkerLine}
        addWorkerLine={addWorkerLine}
        removeWorkerLine={removeWorkerLine}
        clients={clients}
        workers={workers}
        totals={totals}
        filledWorkerCount={filledWorkerCount}
        canSave={canSave}
        onSave={saveNewSale}
        saveLabel="매출 저장"
        saveMessage={saveMessage}
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

function SalesVoucherSearchPage({ sales, setSales, clients, workers, currentUser }) {
  const { recordAudit } = useAudit();
  const [query, setQuery] = useState("");
  const [selectedRowId, setSelectedRowId] = useState(null);
  const [form, setForm] = useState(emptySaleForm);
  const [saveMessage, setSaveMessage] = useState("");
  const filteredRows = sales
    .filter((row) => Object.values(row).join(" ").toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => {
      const dateCompare = String(b.date || "").localeCompare(String(a.date || ""));
      if (dateCompare !== 0) return dateCompare;
      return Number(b.id || 0) - Number(a.id || 0);
    });
  const selectedRow = sales.find((row) => row.id === selectedRowId);

  const update = (key, value) => {
    setSaveMessage("");
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const closeEditor = () => {
    setSelectedRowId(null);
    setForm(emptySaleForm);
    setSaveMessage("");
  };

  const openVoucher = (row) => {
    setSelectedRowId(row.id);
    setSaveMessage("");
    setForm(saleRowToForm(row));
  };

  const updateWorkerLine = (index, key, value) => {
    setSaveMessage("");
    setForm((prev) => ({
      ...prev,
      workers: prev.workers.map((line, lineIndex) => {
        if (lineIndex !== index) return line;
        const nextLine = { ...line, [key]: value };
        if (key === "worker") {
          const selectedWorker = workers.find((worker) => worker.name === value);
          const selectedClient = clients.find((client) => client.name === prev.client);
          nextLine.quantity = nextLine.quantity || "1";
          nextLine.unitCost = selectedWorker?.constructionCost ? String(selectedWorker.constructionCost) : nextLine.unitCost;
          nextLine.chargeAmount = selectedWorker?.customChargeCost ? String(selectedWorker.customChargeCost) : selectedClient?.constructionCost ? String(selectedClient.constructionCost) : nextLine.chargeAmount;
          nextLine.overtimeCost = selectedClient?.overtimeCost ? String(selectedClient.overtimeCost) : selectedWorker?.overtimeCost ? String(selectedWorker.overtimeCost) : nextLine.overtimeCost || "30000";
          nextLine.feeRate = selectedWorker?.feeRate ?? nextLine.feeRate ?? "";
        }
        return nextLine;
      }),
    }));
  };

  const addWorkerLine = () => setForm((prev) => ({ ...prev, workers: [...prev.workers, createWorkerLine(prev.workers.length)] }));
  const removeWorkerLine = (index) => setForm((prev) => ({ ...prev, workers: prev.workers.length <= 1 ? prev.workers : prev.workers.filter((_, lineIndex) => lineIndex !== index) }));

  const formTotals = useMemo(() => sumWorkerFormTotals(form.workers, workers), [form.workers, workers]);
  const filledWorkerCount = useMemo(
    () => form.workers.filter((line) => String(line.worker || "").trim()).length,
    [form.workers]
  );
  const canSave = Boolean(form.client.trim() && form.site.trim() && formTotals.bill > 0);

  const saveVoucher = () => {
    if (!selectedRow) return;
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
    setSaveMessage(`${payload.client} · ${payload.site} 전표가 저장되었습니다.`);
  };

  return (
    <div className={`erp-page ${selectedRow ? "erp-sale-form-page erp-sale-form-page--compact" : ""}`}>
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

      <SearchBox query={query} setQuery={setQuery} placeholder="거래처, 현장, 시공자 검색" />
      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-4 md:p-5">
          {selectedRow && (
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-bold text-slate-700">전표 목록</h2>
              <span className="text-xs text-slate-400">{filteredRows.length}건 · 다른 전표 클릭 시 바로 전환</span>
            </div>
          )}
          <SimpleSalesTable rows={filteredRows} onRowClick={openVoucher} selectedRowId={selectedRowId} exportFileName="매출전표검색" exportTitle="매출전표 검색" />
        </CardContent>
      </Card>
    </div>
  );
}

function StatementMetricsBar({
  title,
  items,
}: {
  title: string;
  items: Array<{ key: string; label: string; value: string; tone?: string }>;
}) {
  return (
    <div className="erp-statement-summary-bar">
      <div className="erp-receivable-totals-group">
        <span className="erp-receivable-totals-label">{title}</span>
        <div className="erp-receivable-totals-items">
          {items.map((item) => (
            <div key={item.key} className="erp-receivable-totals-item">
              <span>{item.label}</span>
              <b className={item.tone}>{item.value}</b>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatementsPage({ sales, clientMaster = [], workerMaster = [] }) {
  const [statementType, setStatementType] = useState("client");
  const [clientStatementView, setClientStatementView] = useState("summary");
  const [pdfMessage, setPdfMessage] = useState("");
  const [pdfDownloadUrl, setPdfDownloadUrl] = useState("");
  const [pdfFileName, setPdfFileName] = useState("");
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [client, setClient] = useState("");
  const [worker, setWorker] = useState("");
  const [dateFilter, setDateFilter] = useState({ startDate: "", endDate: "" });
  const clientPrintRef = useRef(null);
  const workerPrintRef = useRef(null);

  useEffect(() => () => revokePdfBlobUrl(pdfDownloadUrl), [pdfDownloadUrl]);

  const hasClientSelection = Boolean(client && client !== "전체");
  const hasWorkerSelection = Boolean(worker && worker !== "전체");

  const clientOptions = [...new Set(sales.map((row) => row.client).filter(Boolean))];
  const workerOptions = [
    ...new Set(
      sales
        .flatMap((row) => row.workers?.length ? row.workers.map((line) => line.worker) : String(row.worker || "").split(","))
        .map((name) => String(name || "").trim())
        .filter(Boolean)
    ),
  ];

  const dateFilteredSales = sales.filter((row) => {
    const startMatch = dateFilter.startDate ? row.date >= dateFilter.startDate : true;
    const endMatch = dateFilter.endDate ? row.date <= dateFilter.endDate : true;
    return startMatch && endMatch;
  });

  const filteredClientSales = hasClientSelection
    ? dateFilteredSales
        .filter((row) => row.client === client)
        .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")) || Number(a.id || 0) - Number(b.id || 0))
    : [];

  const clientRows = hasClientSelection ? buildClientStatementRows(filteredClientSales) : [];
  const clientSummaryDisplayRows = hasClientSelection ? buildClientStatementSummaryDisplayRows(filteredClientSales) : [];
  const clientDetailDisplayRows = hasClientSelection ? buildClientStatementDetailDisplayRows(filteredClientSales) : [];
  const clientDisplayRows = clientStatementView === "detail" ? clientDetailDisplayRows : clientSummaryDisplayRows;

  const selectedClientInfo = clientMaster.find((row) => row.name === client) || {};
  const clientStatementSummary = buildClientStatementSummary(clientRows, selectedClientInfo);
  const statementPeriodStart = dateFilter.startDate || clientRows[0]?.date || "";
  const statementPeriodEnd = dateFilter.endDate || clientRows[clientRows.length - 1]?.date || "";

  const workerRows = hasWorkerSelection
    ? dateFilteredSales
        .flatMap((sale) => {
    const lines = sale.workers?.length
      ? sale.workers
      : String(sale.worker || "")
          .split(",")
          .map((name) => ({ worker: name.trim(), quantity: "1", unitCost: String(sale.amount || 0), chargeAmount: String(sale.amount || 0), meal: "", overtimeHours: "", overtimeCost: "30000", memo: sale.memo || "" }))
          .filter((line) => line.worker);

    return lines.map((line) => {
      const calculated = calculateWorkerLine(line);
      const quantity = parseMoney(line.quantity || "1") || 1;
      const unitCost = parseMoney(line.unitCost);
      const meal = parseMoney(line.meal);
      const lodging = parseMoney(line.lodging || line.accommodation || line.room);
      const expense = parseMoney(line.expense || line.extraExpense);
      const overtime = parseMoney(line.overtimeHours) * (parseMoney(line.overtimeCost) || 30000);
      const basePay = quantity * unitCost;

      return {
        id: `${sale.id}-${line.worker}-${line.no || ""}`,
        date: sale.date,
        client: sale.client,
        site: sale.site,
        worker: line.worker,
        quantity,
        unitCost,
        basePay,
        meal,
        lodging,
        expense,
        overtime,
        totalPay: calculated.spend,
        amount: calculated.spend,
        memo: line.memo || sale.memo || "",
      };
    });
  })
        .filter((row) => row.worker === worker)
    : [];

  const selectedWorkerInfo = workerMaster.find((row) => row.name === worker) || {};

  const workerStatementSheetRows = useMemo(
    () =>
      workerRows.map((row) => ({
        id: String(row.id),
        saleId: "",
        voucherNo: "",
        date: row.date || "",
        client: row.client || "",
        site: row.site || "",
        worker: row.worker || "",
        quantity: row.quantity || 0,
        unitCost: row.unitCost || 0,
        basePay: row.basePay || 0,
        meal: row.meal || 0,
        lodging: row.lodging || 0,
        expense: row.expense || 0,
        overtime: row.overtime || 0,
        totalPay: row.totalPay || 0,
        feeRate: 0,
        fee: 0,
        netPay: row.totalPay || 0,
        memo: row.memo || "",
      })),
    [workerRows]
  );

  const workerStatementSummary = buildWorkerStatementSummary(workerStatementSheetRows, selectedWorkerInfo);
  const workerStatementPeriodStart = dateFilter.startDate || workerRows[0]?.date || "";
  const workerStatementPeriodEnd = dateFilter.endDate || workerRows[workerRows.length - 1]?.date || "";

  const clientTotals = clientStatementSummary;

  const workerTotals = workerRows.reduce(
    (acc, row) => {
      acc.count += 1;
      acc.basePay += row.basePay || 0;
      acc.overtime += row.overtime || 0;
      acc.lodging += row.lodging || 0;
      acc.meal += row.meal || 0;
      acc.expense += row.expense || 0;
      acc.totalPay += row.totalPay || 0;
      return acc;
    },
    { count: 0, basePay: 0, overtime: 0, lodging: 0, meal: 0, expense: 0, totalPay: 0 }
  );

  const statementClient = hasClientSelection ? client : "";
  const statementWorkerName = hasWorkerSelection ? worker : "";

  const generateStatementPdf = async (type) => {
    const isClient = type === "client";
    const rows = isClient ? clientRows : workerRows;
    const element = isClient ? clientPrintRef.current : workerPrintRef.current;

    if (!rows.length) {
      setPdfMessage(isClient ? "PDF로보낼 거래처 내역이 없습니다." : "PDF로보낼 시공자 내역이 없습니다.");
      return;
    }

    if (isClient && !hasClientSelection) {
      setPdfMessage("PDF 생성 전에 거래처를 선택해 주세요.");
      return;
    }

    if (!isClient && !hasWorkerSelection) {
      setPdfMessage("PDF 생성 전에 시공자를 선택해 주세요.");
      return;
    }

    if (!element) {
      setPdfMessage("PDF 출력 영역을 찾을 수 없습니다. 페이지를 새로고침 후 다시 시도해 주세요.");
      return;
    }

    const safeName = String(isClient ? client : worker).replace(/[\\/:*?"<>|]/g, "_");
    const periodLabel = `${dateFilter.startDate || "전체"}_${dateFilter.endDate || "전체"}`;
    const fileName = isClient
      ? `시공내역서_거래처_${safeName}_${periodLabel}.pdf`
      : `시공내역서_시공자_${safeName}_${periodLabel}.pdf`;

    revokePdfBlobUrl(pdfDownloadUrl);
    setPdfGenerating(true);
    setPdfMessage("PDF 생성 중입니다...");
    setPdfDownloadUrl("");
    setPdfFileName("");

    const previewWindow = createPdfPreviewWindow();
    if (!previewWindow) {
      setPdfMessage("팝업이 차단되었습니다. 브라우저에서 팝업 허용 후 다시 시도해 주세요. (다운로드는 생성 완료 시 진행됩니다)");
    }

    try {
      const result = await downloadPdfFromHtmlElement(element, fileName, {
        orientation: "portrait",
        previewWindow,
      });
      setPdfDownloadUrl(result.blobUrl);
      setPdfFileName(result.fileName);
      await archiveGeneratedPdf(result, {
        category: isClient ? "statement-client" : "statement-worker",
        subjectName: isClient ? client : worker,
        periodStart: dateFilter.startDate,
        periodEnd: dateFilter.endDate,
        statementView: isClient ? clientStatementView : undefined,
      });
      setPdfMessage(
        result.previewOpened
          ? "PDF가 다운로드되었고 새 탭에서 열렸습니다. 보관함에도 저장되었습니다."
          : "PDF가 다운로드되었고 보관함에 저장되었습니다. 미리보기는 팝업 허용 후 다시 시도하거나 PDF 보관함에서 열어 주세요."
      );
    } catch (error) {
      console.error(error);
      previewWindow?.close();
      setPdfMessage("PDF 생성에 실패했습니다. 팝업 차단을 해제하거나 잠시 후 다시 시도해 주세요.");
    } finally {
      setPdfGenerating(false);
    }
  };

  return (
    <div className="erp-page">
      <PageTitle title="내역서" desc="엑셀 시공내역서처럼 거래처용과 시공자용 내역서를 구분해서 확인합니다." />

      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-4 md:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex gap-2 rounded-2xl bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setStatementType("client")}
                className={`erp-text-body rounded-xl px-4 py-2 font-bold ${statementType === "client" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}
              >
                거래처용 내역서
              </button>
              <button
                type="button"
                onClick={() => setStatementType("worker")}
                className={`erp-text-body rounded-xl px-4 py-2 font-bold ${statementType === "worker" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}
              >
                시공자용 내역서
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <Field label="시작일자">
                <Input type="date" value={dateFilter.startDate} onChange={(e) => setDateFilter((prev) => ({ ...prev, startDate: e.target.value }))} />
              </Field>
              <Field label="종료일자">
                <Input type="date" value={dateFilter.endDate} onChange={(e) => setDateFilter((prev) => ({ ...prev, endDate: e.target.value }))} />
              </Field>
              {statementType === "client" ? (
                <Field label="거래처">
                  <AutocompleteInput
                    value={client}
                    options={clientOptions}
                    onChange={(value) => setClient(value)}
                    placeholder="거래처 검색"
                    limit={15}
                    renderSub={(name) => {
                      const info = clientMaster.find((row) => row.name === name);
                      return info ? `${info.manager || "담당자 없음"} · ${info.phone || "연락처 없음"}` : "";
                    }}
                  />
                </Field>
              ) : (
                <Field label="시공자">
                  <AutocompleteInput
                    value={worker}
                    options={workerOptions}
                    onChange={(value) => setWorker(value)}
                    placeholder="시공자 검색"
                    limit={15}
                    renderSub={(name) => {
                      const info = workerMaster.find((row) => row.name === name);
                      return info ? `${info.phone || "연락처 없음"} · ${info.bank || "은행 미등록"}` : "";
                    }}
                  />
                </Field>
              )}
              <div className="flex items-end">
                <Button variant="outline" className="w-full rounded-2xl" onClick={() => setDateFilter({ startDate: "", endDate: "" })}>기간 초기화</Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {statementType === "client" ? (
        <>
          <StatementMetricsBar
            title="거래처 내역"
            items={[
              { key: "client", label: "거래처", value: statementClient || "미선택" },
              { key: "count", label: "건수", value: `${clientRows.length}건 · ${clientTotals.staffCount}명` },
              { key: "subtotal", label: "합계", value: formatKRW(clientTotals.subtotal) },
              { key: "vat", label: "부가세", value: formatKRW(clientTotals.vatAmount) },
              { key: "grand", label: "총합계", value: formatKRW(clientTotals.grandTotal), tone: "text-emerald-700" },
            ]}
          />

          <Card className="rounded-2xl shadow-sm">
            <CardContent className="p-4 md:p-5">
              <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="text-center md:text-left">
                  <h2 className="erp-text-section font-black">시공내역서(거래처)</h2>
                  <p className="mt-1 erp-text-body text-slate-500">
                    {clientStatementView === "detail"
                      ? "현장별 총시공비 · 시공자별 청구단가(원시공비) 상세"
                      : "전표별 요약 · 현장 아래 시공자명(청구단가) 표시"}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className="flex gap-2 rounded-2xl bg-slate-100 p-1">
                    <button
                      type="button"
                      onClick={() => setClientStatementView("summary")}
                      className={`erp-text-body rounded-xl px-4 py-2 font-bold ${clientStatementView === "summary" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}
                    >
                      요약
                    </button>
                    <button
                      type="button"
                      onClick={() => setClientStatementView("detail")}
                      className={`erp-text-body rounded-xl px-4 py-2 font-bold ${clientStatementView === "detail" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}
                    >
                      상세
                    </button>
                  </div>
                  <button
                    type="button"
                    disabled={pdfGenerating || clientRows.length === 0 || !hasClientSelection}
                    onClick={() => generateStatementPdf("client")}
                    className="erp-text-body inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Download size={16} />
                    <span>{pdfGenerating ? "PDF 생성 중..." : "PDF 생성"}</span>
                  </button>
                  {pdfMessage && statementType === "client" && (
                    <div className="erp-text-body font-semibold text-slate-600">{pdfMessage}</div>
                  )}
                  {pdfDownloadUrl && statementType === "client" && (
                    <a
                      href={pdfDownloadUrl}
                      download={pdfFileName || "statement-client.pdf"}
                      className="erp-text-body rounded-2xl bg-emerald-600 px-4 py-2 font-bold text-white hover:bg-emerald-700"
                    >
                      PDF 다시 다운로드
                    </a>
                  )}
                </div>
              </div>
              <TableExportSection
                fileName={`시공내역서_거래처_${statementClient || "미선택"}_${clientStatementView}`}
                title={`거래처 시공내역서 (${clientStatementView === "detail" ? "상세" : "요약"})`}
                hidePdf
                tableSelector=".excel-data-table"
                disabled={clientRows.length === 0 || !hasClientSelection}
              >
              <div className="erp-statement-preview-wrap">
                <ClientStatementSheet
                  ref={clientPrintRef}
                  clientName={statementClient || "거래처"}
                  clientInfo={selectedClientInfo}
                  periodStart={statementPeriodStart}
                  periodEnd={statementPeriodEnd}
                  summary={clientStatementSummary}
                  rows={clientDisplayRows}
                  emptyMessage={
                    !statementClient
                      ? "거래처를 선택하면 엑셀과 같은 시공비 내역서 표가 표시됩니다."
                      : "선택 기간에 해당 거래처 내역이 없습니다."
                  }
                />
              </div>
              </TableExportSection>
            </CardContent>
          </Card>
        </>
      ) : (
        <>
          <StatementMetricsBar
            title="시공자 내역"
            items={[
              { key: "worker", label: "시공자", value: statementWorkerName || "미선택" },
              { key: "count", label: "건수", value: `${workerTotals.count}건` },
              { key: "gross", label: "지급합계", value: formatKRW(workerStatementSummary.grossPay) },
              { key: "fee", label: "수수료", value: formatKRW(workerStatementSummary.fee), tone: "text-red-600" },
              { key: "net", label: "실수령", value: formatKRW(workerStatementSummary.netPay), tone: "text-emerald-700" },
            ]}
          />

          <Card className="rounded-2xl shadow-sm">
            <CardContent className="p-4 md:p-5">
              <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="text-center md:text-left">
                  <h2 className="erp-text-section font-black">시공내역서(개인)</h2>
                  <p className="mt-1 erp-text-body text-slate-500">엑셀 시공내역서 양식과 동일한 표로 미리보기 · PDF 생성</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <button
                    type="button"
                    disabled={pdfGenerating || workerRows.length === 0 || !hasWorkerSelection}
                    onClick={() => generateStatementPdf("worker")}
                    className="erp-text-body inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Download size={16} />
                    <span>{pdfGenerating ? "PDF 생성 중..." : "PDF 생성"}</span>
                  </button>
                  {pdfMessage && statementType === "worker" && (
                    <div className="erp-text-body font-semibold text-slate-600">{pdfMessage}</div>
                  )}
                  {pdfDownloadUrl && statementType === "worker" && (
                    <a
                      href={pdfDownloadUrl}
                      download={pdfFileName || "statement-worker.pdf"}
                      className="erp-text-body rounded-2xl bg-emerald-600 px-4 py-2 font-bold text-white hover:bg-emerald-700"
                    >
                      PDF 다시 다운로드
                    </a>
                  )}
                </div>
              </div>
              <TableExportSection
                fileName={`시공내역서_시공자_${statementWorkerName || "미선택"}`}
                title="시공자 시공내역서"
                hidePdf
                tableSelector=".excel-data-table"
                disabled={workerRows.length === 0 || !hasWorkerSelection}
              >
              <div className="erp-statement-preview-wrap">
                <WorkerStatementSheet
                  ref={workerPrintRef}
                  workerName={statementWorkerName || "시공자"}
                  workerInfo={selectedWorkerInfo}
                  periodStart={workerStatementPeriodStart}
                  periodEnd={workerStatementPeriodEnd}
                  summary={workerStatementSummary}
                  rows={workerStatementSheetRows}
                  totals={workerTotals}
                  emptyMessage={
                    !statementWorkerName
                      ? "시공자를 선택하면 엑셀과 같은 시공내역서 표가 표시됩니다."
                      : "선택 기간에 해당 시공자 내역이 없습니다."
                  }
                />
              </div>
              </TableExportSection>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}


function ClientsPage({ clients, setClients }) {
  const { recordAudit } = useAudit();
  const emptyClientForm = {
    name: "",
    businessNo: "",
    manager: "",
    phone: "",
    constructionCost: "",
    overtimeCost: "30000",
    vat: "Y",
    mealIncluded: "N",
    memo: "",
  };

  const [form, setForm] = useState(emptyClientForm);
  const [editingId, setEditingId] = useState(null);
  const [query, setQuery] = useState("");

  const filteredClients = clients.filter((client) => Object.values(client).join(" ").toLowerCase().includes(query.toLowerCase()));

  const updateForm = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const saveClient = () => {
    if (!form.name.trim()) return;

    const existingClient = editingId ? clients.find((client) => client.id === editingId) : null;
    const payload = {
      id: editingId || Date.now(),
      name: form.name.trim(),
      businessNo: form.businessNo.trim(),
      manager: form.manager.trim(),
      phone: form.phone.trim(),
      constructionCost: parseMoney(form.constructionCost),
      customChargeCost: parseMoney(form.customChargeCost || form.constructionCost),
      chargeCost: parseMoney(form.chargeCost || form.constructionCost),
      overtimeCost: parseMoney(form.overtimeCost),
      vat: form.vat,
      mealIncluded: form.mealIncluded,
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
  };

  const editClient = (client) => {
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
      mealIncluded: client.mealIncluded || "N",
      memo: client.memo || "",
    });
  };

  const deleteClient = (id) => {
    const client = clients.find((item) => item.id === id);
    if (client) {
      recordAudit({
        entityType: "client",
        entityId: id,
        entityLabel: client.name,
        screen: "거래처",
        action: "delete",
        before: snapshotClientForAudit(client),
        fields: CLIENT_AUDIT_FIELDS,
      });
    }
    setClients((prev) => prev.filter((item) => item.id !== id));
  };

  return (
    <div className="erp-page">
      <PageTitle title="거래처" desc="엑셀 거래처정보 시트를 기준으로 거래처를 관리합니다." />

      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <AuditField label="거래처명" entityType="client" entityId={editingId} field="name"><Input value={form.name} onChange={(e) => updateForm("name", e.target.value)} placeholder="거래처명" /></AuditField>
            <AuditField label="사업자번호" entityType="client" entityId={editingId} field="businessNo"><Input value={form.businessNo} onChange={(e) => updateForm("businessNo", e.target.value)} placeholder="사업자번호" /></AuditField>
            <AuditField label="담당자" entityType="client" entityId={editingId} field="manager"><Input value={form.manager} onChange={(e) => updateForm("manager", e.target.value)} placeholder="담당자" /></AuditField>
            <AuditField label="연락처" entityType="client" entityId={editingId} field="phone"><Input value={form.phone} onChange={(e) => updateForm("phone", e.target.value)} placeholder="연락처" /></AuditField>
            <AuditField label="시공비" entityType="client" entityId={editingId} field="constructionCost"><Input inputMode="numeric" value={form.constructionCost} onChange={(e) => updateForm("constructionCost", e.target.value)} placeholder="시공비" /></AuditField>
            <AuditField label="개별청구단가(선택)" entityType="client" entityId={editingId} field="customChargeCost"><Input inputMode="numeric" value={form.customChargeCost} onChange={(e) => updateForm("customChargeCost", e.target.value)} placeholder="특정 시공자만 별도 청구시 입력" /></AuditField>
            <AuditField label="야근비" entityType="client" entityId={editingId} field="overtimeCost"><Input inputMode="numeric" value={form.overtimeCost} onChange={(e) => updateForm("overtimeCost", e.target.value)} placeholder="야근비" /></AuditField>
            <AuditField label="부가세" entityType="client" entityId={editingId} field="vat">
              <AutocompleteSelect value={form.vat} options={YES_NO_OPTIONS} onChange={(value) => updateForm("vat", value)} placeholder="Y / N" />
            </AuditField>
            <AuditField label="식대" entityType="client" entityId={editingId} field="mealIncluded">
              <AutocompleteSelect value={form.mealIncluded} options={YES_NO_OPTIONS} onChange={(value) => updateForm("mealIncluded", value)} placeholder="Y / N" />
            </AuditField>
            <div className="md:col-span-4">
              <AuditField label="비고" entityType="client" entityId={editingId} field="memo">
                <Input value={form.memo} onChange={(e) => updateForm("memo", e.target.value)} placeholder="거래처 비고" />
              </AuditField>
            </div>
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" className="rounded-2xl" onClick={() => { setForm(emptyClientForm); setEditingId(null); }}>초기화</Button>
            <Button className="rounded-2xl" onClick={saveClient}>{editingId ? "거래처 수정" : "거래처 저장"}</Button>
          </div>
        </CardContent>
      </Card>

      <SearchBox query={query} setQuery={setQuery} placeholder="거래처명, 담당자, 연락처 검색" />

      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-4 md:p-5">
          <TableExportSection fileName="거래처목록" title="거래처 목록" disabled={filteredClients.length === 0}>
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
                  <th className="text-left">비고</th>
                  <th className="text-center erp-table-export-skip">관리</th>
                </tr>
              </thead>
              <tbody>
                {filteredClients.map((client) => (
                  <tr key={client.id} className="border-t hover:bg-slate-50">
                    <td className="font-bold text-left">{client.name}</td>
                    <td>{client.businessNo || "-"}</td>
                    <td>{client.manager || "-"}</td>
                    <td>{client.phone || "-"}</td>
                    <td className="text-right font-semibold">{formatKRW(client.constructionCost)}</td>
                    <td className="text-right">{formatKRW(client.overtimeCost)}</td>
                    <td className="text-center">{client.vat}</td>
                    <td className="text-center">{client.mealIncluded}</td>
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
          </TableExportSection>
        </CardContent>
      </Card>
    </div>
  );
}

function WorkersPage({ workers, setWorkers }) {
  const { recordAudit } = useAudit();
  const emptyWorkerForm = {
    name: "",
    bank: "",
    account: "",
    phone: "",
    constructionCost: "",
    customChargeCost: "",
    overtimeCost: "30000",
    feeRate: "10",
    memo: "",
  };

  const [form, setForm] = useState(emptyWorkerForm);
  const [editingId, setEditingId] = useState(null);
  const [query, setQuery] = useState("");
  const [inlineChargeDrafts, setInlineChargeDrafts] = useState({});

  const filteredWorkers = workers.filter((worker) => Object.values(worker).join(" ").toLowerCase().includes(query.toLowerCase()));
  const updateForm = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const saveWorker = () => {
    if (!form.name.trim()) return;

    const existingWorker = editingId ? workers.find((worker) => worker.id === editingId) : null;
    const feeNumber = Number(String(form.feeRate).replace(/[^0-9.]/g, ""));
    const payload = {
      id: editingId || Date.now(),
      name: form.name.trim(),
      bank: form.bank.trim(),
      account: form.account.trim(),
      phone: form.phone.trim(),
      constructionCost: parseMoney(form.constructionCost),
      customChargeCost: parseMoney(form.customChargeCost),
      overtimeCost: parseMoney(form.overtimeCost),
      feeRate: feeNumber > 1 ? feeNumber / 100 : feeNumber,
      memo: form.memo.trim(),
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
  };

  const editWorker = (worker) => {
    setEditingId(worker.id);
    setForm({
      name: worker.name || "",
      bank: worker.bank || "",
      account: worker.account || "",
      phone: worker.phone || "",
      constructionCost: String(worker.constructionCost || ""),
      customChargeCost: String(worker.customChargeCost || ""),
      overtimeCost: String(worker.overtimeCost || "30000"),
      feeRate: String(Math.round((worker.feeRate || 0) * 100)),
      memo: worker.memo || "",
    });
    setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 0);
  };

  const deleteWorker = (id) => {
    const worker = workers.find((item) => item.id === id);
    if (worker) {
      recordAudit({
        entityType: "worker",
        entityId: id,
        entityLabel: worker.name,
        screen: "시공자",
        action: "delete",
        before: snapshotWorkerForAudit(worker),
        fields: WORKER_AUDIT_FIELDS,
      });
    }
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

  return (
    <div className="erp-page">
      <PageTitle title="시공자" desc="엑셀 기본정보 시트를 기준으로 시공자 정보를 관리합니다." />

      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <AuditField label="시공자명" entityType="worker" entityId={editingId} field="name"><Input value={form.name} onChange={(e) => updateForm("name", e.target.value)} placeholder="시공자명" /></AuditField>
            <AuditField label="은행명" entityType="worker" entityId={editingId} field="bank"><Input value={form.bank} onChange={(e) => updateForm("bank", e.target.value)} placeholder="은행명" /></AuditField>
            <AuditField label="계좌번호" entityType="worker" entityId={editingId} field="account"><Input value={form.account} onChange={(e) => updateForm("account", e.target.value)} placeholder="계좌번호" /></AuditField>
            <AuditField label="연락처" entityType="worker" entityId={editingId} field="phone"><Input value={form.phone} onChange={(e) => updateForm("phone", e.target.value)} placeholder="연락처" /></AuditField>
            <AuditField label="시공비" entityType="worker" entityId={editingId} field="constructionCost"><Input inputMode="numeric" value={form.constructionCost} onChange={(e) => updateForm("constructionCost", e.target.value)} placeholder="시공비" /></AuditField>
            <AuditField label="개별청구단가" entityType="worker" entityId={editingId} field="customChargeCost"><Input inputMode="numeric" value={form.customChargeCost} onChange={(e) => updateForm("customChargeCost", e.target.value)} placeholder="비워두면 거래처 기본단가 적용" /></AuditField>
            <AuditField label="야근비" entityType="worker" entityId={editingId} field="overtimeCost"><Input inputMode="numeric" value={form.overtimeCost} onChange={(e) => updateForm("overtimeCost", e.target.value)} placeholder="야근비" /></AuditField>
            <AuditField label="수수료율(%)" entityType="worker" entityId={editingId} field="feeRate"><Input inputMode="decimal" value={form.feeRate} onChange={(e) => updateForm("feeRate", e.target.value)} placeholder="10" /></AuditField>
            <div className="md:col-span-1"><AuditField label="비고" entityType="worker" entityId={editingId} field="memo"><Input value={form.memo} onChange={(e) => updateForm("memo", e.target.value)} placeholder="비고" /></AuditField></div>
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" className="rounded-2xl" onClick={() => { setForm(emptyWorkerForm); setEditingId(null); }}>초기화</Button>
            <Button className="rounded-2xl" onClick={saveWorker}>{editingId ? "시공자 수정" : "시공자 저장"}</Button>
          </div>
        </CardContent>
      </Card>

      <SearchBox query={query} setQuery={setQuery} placeholder="시공자명, 연락처, 은행, 계좌 검색" />

      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-4 md:p-5">
          <TableExportSection fileName="시공자목록" title="시공자 목록" disabled={filteredWorkers.length === 0}>
          <div className="erp-table-wrap">
            <table className="erp-table erp-table--lg">
              <thead className="bg-slate-100 text-slate-600">
                <tr>
                  <th className="text-left">시공자명</th>
                  <th className="text-left">은행명</th>
                  <th className="text-left">계좌번호</th>
                  <th className="text-left">연락처</th>
                  <th className="text-right">시공비</th>
                  <th className="text-right">개별청구단가</th>
                  <th className="text-right">야근비</th>
                  <th className="text-right">수수료율</th>
                  <th className="text-left">비고</th>
                  <th className="text-center erp-table-export-skip">관리</th>
                </tr>
              </thead>
              <tbody>
                {filteredWorkers.map((worker) => (
                  <tr key={worker.id} className="border-t hover:bg-slate-50">
                    <td className="font-bold text-left">{worker.name}</td>
                    <td>{worker.bank || "-"}</td>
                    <td>{worker.account || "-"}</td>
                    <td>{worker.phone || "-"}</td>
                    <td className="text-right font-semibold">{formatKRW(worker.constructionCost)}</td>
                    <td className="text-right">
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
                        placeholder="거래처 기본단가"
                        className="text-right font-semibold text-blue-600"
                      />
                      <AuditCellHint entityType="worker" entityId={worker.id} field="customChargeCost" fieldLabel="개별청구단가" />
                    </td>
                    <td className="text-right">{formatKRW(worker.overtimeCost || 30000)}</td>
                    <td className="text-right">{Math.round((worker.feeRate || 0) * 100)}%</td>
                    <td>{worker.memo || "-"}</td>
                    <td className="erp-table-export-skip">
                      <div className="flex justify-center gap-2">
                        <Button size="sm" variant="outline" className="rounded-xl" onClick={() => editWorker(worker)}><Pencil size={14} /></Button>
                        <Button size="sm" className="rounded-xl bg-red-600 hover:bg-red-700" onClick={() => deleteWorker(worker.id)}><Trash2 size={14} /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </TableExportSection>
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

function PivotReportTable({ title, labelHeader, rows, totals, showAvgPaid = false, showStaffCount = true }) {
  const { sort, toggleSort } = usePivotTableSort("bill", "desc");
  const sortedRows = useMemo(
    () => sortRowsByColumn(rows, (row) => getPivotReportSortValue(row, sort.column), sort.direction),
    [rows, sort.column, sort.direction]
  );

  return (
    <Card className="erp-pivot-card rounded-2xl shadow-sm">
      <CardContent className="p-3 md:p-4">
        <h2 className="erp-text-section">{title}</h2>
        <TableExportSection fileName={`보고서_${title}`} title={title} disabled={rows.length === 0}>
        <div className="erp-table-wrap erp-pivot-table-wrap">
          <table className="erp-table erp-pivot-table">
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
              {sortedRows.map((row) => (
                <tr key={row.key} className="border-t hover:bg-slate-50">
                  <td className="erp-pivot-label font-semibold text-left">{row.label}</td>
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
              ))}
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
        <p className="erp-text-caption mt-3 text-slate-500">열 제목을 클릭하면 오름차순·내림차순으로 정렬됩니다.</p>
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
          <table className="erp-table erp-pivot-table">
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
            <table className="erp-table erp-pivot-table">
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
            <table className="erp-table erp-pivot-table">
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
            <table className="erp-table erp-pivot-table">
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

function ReportsPage({ sales, workers = [], paymentVouchers = [] }) {
  const [reportTab, setReportTab] = useState("pivot");
  const [dateFilter, setDateFilter] = useState(() => monthRangeISO(0));
  const [selectedPeriodKey, setSelectedPeriodKey] = useState("");

  const pivotContext = useMemo(
    () => ({ workerFeeRates: buildWorkerFeeMap(workers), paymentVouchers }),
    [workers, paymentVouchers]
  );

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
    <div className="erp-page">
      <PageTitle title="보고서" desc="엑셀 Pivot·데이터분석 시트처럼 거래처·시공자·기간별 집계를 확인합니다." />

      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-4 md:p-5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:max-w-xl">
              <Field label="시작일자">
                <Input type="date" value={dateFilter.startDate} onChange={(event) => { setDateFilter((prev) => ({ ...prev, startDate: event.target.value })); setSelectedPeriodKey(""); }} />
              </Field>
              <Field label="종료일자">
                <Input type="date" value={dateFilter.endDate} onChange={(event) => { setDateFilter((prev) => ({ ...prev, endDate: event.target.value })); setSelectedPeriodKey(""); }} />
              </Field>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="rounded-2xl" onClick={() => setMonthRange(0)}>이번 달</Button>
              <Button variant="outline" className="rounded-2xl" onClick={() => setMonthRange(-1)}>지난 달</Button>
              <Button variant="outline" className="rounded-2xl" onClick={() => { setDateFilter({ startDate: "", endDate: "" }); setSelectedPeriodKey(""); }}>전체</Button>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 border-t pt-4">
            {REPORT_TABS.map(([key, label]) => (
              <Button
                key={key}
                variant={reportTab === key ? "default" : "outline"}
                className="rounded-2xl"
                onClick={() => handleTabChange(key)}
              >
                {label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 xl:grid-cols-4">
        <SummaryCard title="총 시공인원" value={formatPivotCount(clientReport.totals.staffCount)} sub={periodLabel} icon={Users} />
        <SummaryCard title="총시공비" value={formatKRW(clientReport.totals.bill)} sub="거래처 청구 합계" icon={WalletCards} />
        <SummaryCard title="총 지출액" value={formatKRW(clientReport.totals.spend)} sub="시공자 지급 합계" icon={CreditCard} />
        <SummaryCard title="총 마진" value={formatKRW(clientReport.totals.margin)} sub={`마진율 ${formatMarginRate(clientReport.totals.margin, clientReport.totals.bill)} · 총입금 ${formatKRW(clientReport.totals.totalPaid)} · 입금률 ${formatPaymentRate(clientReport.totals.totalPaid, clientReport.totals.bill)}`} tone={clientReport.totals.margin >= 0 ? "success" : "danger"} icon={BarChart3} />
      </div>

      {reportTab === "pivot" && (
        <div className="erp-pivot-layout">
          <PivotReportTable title="거래처 Pivot" labelHeader="거래처" rows={clientReport.rows} totals={clientReport.totals} showAvgPaid />
          <PivotReportTable title="시공자 Pivot" labelHeader="시공자" rows={workerReport.rows} totals={workerReport.totals} />
        </div>
      )}

      {reportTab === "monthly" && (
        <>
          <PeriodPivotTable title="월별 Pivot" rows={monthlyReport.rows} totals={monthlyReport.totals} selectedKey={selectedPeriodKey} onSelect={setSelectedPeriodKey} />
          {drilldownClientReport && drilldownWorkerReport && (
            <div className="erp-pivot-layout">
              <PivotReportTable title={`${monthlyReport.rows.find((row) => row.key === selectedPeriodKey)?.label || selectedPeriodKey} · 거래처`} labelHeader="거래처" rows={drilldownClientReport.rows} totals={drilldownClientReport.totals} showAvgPaid />
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
              <PivotReportTable title={`${quarterlyReport.rows.find((row) => row.key === selectedPeriodKey)?.label || selectedPeriodKey} · 거래처`} labelHeader="거래처" rows={drilldownClientReport.rows} totals={drilldownClientReport.totals} showAvgPaid />
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
  const erpVersionRef = useRef(0);
  const skipSaveRef = useRef(true);
  const [active, setActive] = useState(() => {
    if (typeof window === "undefined") return "dashboard";
    return window.sessionStorage.getItem(ACTIVE_TAB_KEY) || "dashboard";
  });
  const [sales, setSales] = useState(() => {
    if (apiMode && sessionOnMount) return [];
    return storedData?.sales || initialSales;
  });
  const [paymentVouchers, setPaymentVouchers] = useState(() => {
    if (apiMode && sessionOnMount) return [];
    return storedData?.paymentVouchers || initialPaymentVouchers;
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
    return Array.isArray(storedData?.auditLogs) ? storedData.auditLogs : [];
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const receivableRowsFromSales = useMemo(() => buildReceivableRowsFromSales(appliedSales, clients), [appliedSales, clients]);

  useEffect(() => {
    if (!apiMode || !currentUser) return;
    let cancelled = false;
    setDataReady(false);
    (async () => {
      try {
        const data = await fetchErpData();
        if (cancelled) return;
        const nextWorkers = data.workers?.length ? data.workers : initialWorkers;
        setSales(normalizeSalesRecords(data.sales || [], nextWorkers));
        setPaymentVouchers(data.paymentVouchers || []);
        setClients(data.clients?.length ? data.clients : initialClients);
        setWorkers(nextWorkers);
        setAuditLogs(Array.isArray(data.auditLogs) ? data.auditLogs : []);
        erpVersionRef.current = data.version ?? 0;
        skipSaveRef.current = true;
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
  }, [currentUser, apiMode]);

  useEffect(() => {
    if (!apiMode) {
      saveStoredData({ sales, paymentVouchers, clients, workers, auditLogs });
      return;
    }
    if (!currentUser || !dataReady) return;
    if (skipSaveRef.current) {
      skipSaveRef.current = false;
      return;
    }
    setSyncStatus("저장 중...");
    const timer = window.setTimeout(async () => {
      try {
        const result = await saveErpData({
          sales,
          paymentVouchers,
          clients,
          workers,
          auditLogs,
          version: erpVersionRef.current,
        });
        erpVersionRef.current = result.version;
        setSyncStatus("저장됨");
      } catch (error) {
        const err = error as Error & { status?: number };
        if (err.status === 409) {
          setSyncStatus("충돌 — 새로고침 필요");
          window.alert("다른 사용자가 먼저 저장했습니다. 새로고침하면 최신 데이터를 불러옵니다.");
        } else {
          setSyncStatus("저장 실패");
        }
      }
    }, 900);
    return () => window.clearTimeout(timer);
  }, [sales, paymentVouchers, clients, workers, auditLogs, currentUser, dataReady, apiMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(ACTIVE_TAB_KEY, active);
  }, [active]);

  useEffect(() => {
    if (active === "paymentInput") setActive("receivables");
  }, [active]);

  const backupData = () => {
    downloadBackup({ sales, paymentVouchers, clients, workers, auditLogs });
  };

  const restoreBackup = (file) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = normalizeBackupPayload(JSON.parse(String(reader.result || "{}")));
        if (!window.confirm("백업 파일로 현재 데이터를 덮어씁니다. 계속할까요?")) return;
        setSales(normalizeSalesRecords(parsed.sales, parsed.workers || workers));
        setPaymentVouchers(parsed.paymentVouchers);
        setClients(parsed.clients);
        setWorkers(parsed.workers);
        setAuditLogs(parsed.auditLogs || []);
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

  const handleLogin = (user) => {
    setCurrentUser(user);
    if (!apiMode) saveSessionUser(user);
  };

  const handleLogout = () => {
    if (apiMode) clearAuthSession();
    else saveSessionUser(null);
    setCurrentUser(null);
    setSyncStatus("");
    setDataReady(!apiMode);
  };

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

  const activeLabel = {
    dashboard: "대시보드",
    calendar: "캘린더",
    salesInput: "매출등록",
    sales: "매출관리",
    salesVoucherSearch: "매출전표검색",
    receivables: "입금/미수금",
    workerPayments: "시공자 지급",
    clients: "거래처",
    workers: "시공자",
    reports: "보고서",
    auditLog: "감사로그",
    statements: "내역서",
    pdfArchive: "PDF 보관함",
  }[active] || "ERP";

  return (
    <AuditProvider auditLogs={auditLogs} setAuditLogs={setAuditLogs} currentUser={currentUser}>
    <div className="flex min-h-screen bg-slate-50 text-slate-900" lang="ko">
      <Sidebar
        active={active}
        setActive={setActive}
        currentUser={currentUser}
        onLogout={handleLogout}
        onBackup={backupData}
        onRestore={restoreBackup}
        onExcelImport={handleExcelImport}
        onLoadBundledSeed={handleLoadBundledSeed}
        mobileOpen={sidebarOpen}
        onMobileClose={() => setSidebarOpen(false)}
        syncStatus={apiMode ? syncStatus : ""}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white/95 px-3 py-3 backdrop-blur lg:hidden">
          <button
            type="button"
            className="rounded-xl border border-slate-200 p-2 text-slate-700"
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
        {active === "dashboard" && <Dashboard sales={appliedSales} />}
        {active === "calendar" && <CalendarPage sales={appliedSales} />}
        {active === "salesInput" && <SalesRegistrationPage setSales={setSales} setActive={setActive} clients={clients} workers={workers} currentUser={currentUser} />}
        {active === "sales" && <SalesManagementPage sales={appliedSales} paymentVouchers={paymentVouchers} workers={workers} setSales={setSales} setActive={setActive} currentUser={currentUser} />}
        {active === "salesVoucherSearch" && <SalesVoucherSearchPage sales={appliedSales} setSales={setSales} clients={clients} workers={workers} currentUser={currentUser} />}
        {active === "receivables" && (
          <PaymentReceivablesPage
            sales={appliedSales}
            receivableRows={receivableRowsFromSales}
            clients={clients}
            paymentVouchers={paymentVouchers}
            setPaymentVouchers={setPaymentVouchers}
            currentUser={currentUser}
          />
        )}
        {active === "workerPayments" && <WorkerPaymentsPage workers={workers} sales={appliedSales} />}
        {active === "clients" && <ClientsPage clients={clients} setClients={setClients} />}
        {active === "workers" && <WorkersPage workers={workers} setWorkers={setWorkers} />}
        {active === "reports" && <ReportsPage sales={appliedSales} workers={workers} paymentVouchers={paymentVouchers} />}
        {active === "auditLog" && <AuditLogPage />}
        {active === "statements" && <StatementsPage sales={appliedSales} clientMaster={clients} workerMaster={workers} />}
        {active === "pdfArchive" && <PdfArchivePage />}
        </main>
      </div>
    </div>
    </AuditProvider>
  );
}
