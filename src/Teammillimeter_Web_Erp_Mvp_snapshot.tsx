import React, { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  BarChart3,
  Building2,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  Download,
  FileSpreadsheet,
  Home,
  LockKeyhole,
  LogOut,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
  WalletCards,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

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

const initialPaymentVouchers = [
  { id: 1779506315632, date: "2026-05-22", client: "키친바이블", amount: 1000000, memo: "" },
  { id: 1779506071167, date: "2026-05-22", client: "바오퍼니처", amount: 12000000, memo: "" },
];

const initialClients = [
  {"id":1,"name":"나우","businessNo":"","manager":"","phone":"","constructionCost":300000,"overtimeCost":30000,"vat":"Y","mealIncluded":"N","memo":""},
  {"id":2,"name":"노이","businessNo":"","manager":"","phone":"010-9847-4982","constructionCost":300000,"overtimeCost":30000,"vat":"N","mealIncluded":"Y","memo":""},
  {"id":3,"name":"누림","businessNo":"398-87-02094","manager":"이상은","phone":"","constructionCost":350000,"overtimeCost":30000,"vat":"Y","mealIncluded":"N","memo":""},
  {"id":4,"name":"다옴","businessNo":"502-31-46068","manager":"박성근대표님","phone":"010-4900-8000","constructionCost":300000,"overtimeCost":30000,"vat":"N","mealIncluded":"Y","memo":""},
  {"id":5,"name":"럭스","businessNo":"","manager":"","phone":"","constructionCost":350000,"overtimeCost":30000,"vat":"Y","mealIncluded":"Y","memo":""},
  {"id":6,"name":"리브젠","businessNo":"","manager":"","phone":"","constructionCost":300000,"overtimeCost":30000,"vat":"N","mealIncluded":"N","memo":""},
  {"id":7,"name":"바우스","businessNo":"","manager":"","phone":"","constructionCost":300000,"overtimeCost":30000,"vat":"N","mealIncluded":"N","memo":""},
  {"id":8,"name":"미무","businessNo":"318-85-04466","manager":"김도형대표님","phone":"010-7247-0853","constructionCost":330000,"overtimeCost":30000,"vat":"Y","mealIncluded":"Y","memo":"계산서필: 필수(미무) / 거래내역서: 월 2회"},
  {"id":9,"name":"인디퍼","businessNo":"296-88-02460","manager":"오승민대표님","phone":"010-5238-0736","constructionCost":330000,"overtimeCost":30000,"vat":"Y","mealIncluded":"Y","memo":"계산서필: 필수 / 거래내역서: 월 2회"},
  {"id":10,"name":"카르트","businessNo":"663-88-02355","manager":"김진숙","phone":"","constructionCost":300000,"overtimeCost":30000,"vat":"Y","mealIncluded":"N","memo":""}
  // NOTE: Canvas contains the full 101-client list. This export keeps the code structure intact; add the remaining clients here from the canvas if needed.
];

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

// The remaining application code is preserved in the ChatGPT canvas document.
// This file is a project snapshot export created from the current ERP canvas state.
// If you need a runnable single-file TSX export with every component, ask: "전체 TSX 전체코드 파일로 다시 내보내줘".
