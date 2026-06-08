import path from "path";
import { fileURLToPath } from "url";
import { loadEnv } from "./loadEnv.mjs";

loadEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const BAROBILL_TEST_WSDL = "https://testws.baroservice.com/TI.asmx?WSDL";
const BAROBILL_PROD_WSDL = "https://ws.baroservice.com/TI.asmx?WSDL";

function parseEnvBool(value, defaultValue) {
  if (value === undefined || value === "") return defaultValue;
  return value !== "false" && value !== "0";
}

const barobillTest = parseEnvBool(process.env.BAROBILL_TEST, true);

export const config = {
  port: Number(process.env.PORT || 8080),
  jwtSecret: process.env.JWT_SECRET || "change-me-in-production-teammillimeter-erp",
  dbPath: process.env.DATABASE_PATH || path.join(rootDir, "data", "erp.sqlite"),
  pdfArchiveDir: process.env.PDF_ARCHIVE_DIR || path.join(rootDir, "data", "pdf-archives"),
  clientContractsDir: process.env.CLIENT_CONTRACTS_DIR || path.join(rootDir, "data", "client-contracts"),
  boardAttachmentDir: process.env.BOARD_ATTACHMENT_DIR || path.join(rootDir, "data", "board-attachments"),
  clientBusinessRegDir: process.env.CLIENT_BUSINESS_REG_DIR || path.join(rootDir, "data", "client-business-reg"),
  distDir: process.env.DIST_DIR || path.join(rootDir, "dist"),
  pdfJsDir: path.join(rootDir, "node_modules", "pdfjs-dist", "legacy", "build"),
  tokenExpiresIn: process.env.JWT_EXPIRES || "7d",
  /** IBK 거래내역 엑셀이 저장되는 폴더 (설정 시 서버가 주기적으로 자동 가져옴) */
  ibkBankImportDir: process.env.IBK_BANK_IMPORT_DIR || "",
  /** 자동 가져오기 주기(ms). 기본 3분 */
  bankSyncIntervalMs: Number(process.env.BANK_SYNC_INTERVAL_MS || 180000),
  openAiConfigured: Boolean(process.env.OPENAI_API_KEY),
  openBanking: {
    enabled: process.env.OPEN_BANKING_ENABLED !== "false",
    baseUrl: process.env.OPEN_BANKING_BASE_URL || "https://testapi.openbanking.or.kr",
    clientId: process.env.OPEN_BANKING_CLIENT_ID || "",
    clientSecret: process.env.OPEN_BANKING_CLIENT_SECRET || "",
    orgCode: process.env.OPEN_BANKING_ORG_CODE || "",
    redirectUri: process.env.OPEN_BANKING_REDIRECT_URI || "",
    scope: process.env.OPEN_BANKING_SCOPE || "login inquiry",
    fintechUseNum: process.env.OPEN_BANKING_FINTECH_USE_NUM || "",
    accessToken: process.env.OPEN_BANKING_ACCESS_TOKEN || "",
    refreshToken: process.env.OPEN_BANKING_REFRESH_TOKEN || "",
    accountMask: process.env.OPEN_BANKING_ACCOUNT_MASK || "",
    syncDays: Number(process.env.OPEN_BANKING_SYNC_DAYS || 7),
  },
  alimtalk: {
    enabled: parseEnvBool(process.env.ALIMTALK_ENABLED, false),
    schedulerEnabled: parseEnvBool(process.env.ALIMTALK_SCHEDULER_ENABLED, true),
    provider: process.env.ALIMTALK_PROVIDER || "solapi",
    apiUrl:
      process.env.ALIMTALK_API_URL ||
      (process.env.ALIMTALK_PROVIDER === "toast"
        ? ""
        : "https://api.solapi.com/messages/v4/send-many/detail"),
    apiKey: process.env.ALIMTALK_API_KEY || "",
    apiSecret: process.env.ALIMTALK_API_SECRET || "",
    apiHeaders: process.env.ALIMTALK_API_HEADERS
      ? JSON.parse(process.env.ALIMTALK_API_HEADERS)
      : {},
    /** Toast: senderKey / Solapi: 카카오 채널 pfId (KA01PF...) */
    senderKey: process.env.ALIMTALK_SENDER_KEY || "",
    /** Solapi 알림톡 실패 시 SMS 대체발송 발신번호 */
    smsFrom: process.env.ALIMTALK_SMS_FROM || "",
    dailyReportTemplate: process.env.ALIMTALK_DAILY_REPORT_TEMPLATE || "",
    commentTemplate: process.env.ALIMTALK_COMMENT_TEMPLATE || "",
    contractTemplate: process.env.ALIMTALK_CONTRACT_TEMPLATE || "",
    scheduleTemplate: process.env.ALIMTALK_SCHEDULE_TEMPLATE || "",
    erpBaseUrl: process.env.ERP_PUBLIC_URL || "https://erp.teammillimeter.com",
  },
  sc: {
    /** SC(office) PostgreSQL read-only connection — Vercel/Neon DATABASE_URL */
    databaseUrl: process.env.SC_DATABASE_URL || "",
    /** SC HTTP export (when DB URL is unavailable on ERP server) */
    apiBaseUrl: process.env.SC_API_BASE_URL || "https://sc.teammillimeter.com",
    syncSecret: process.env.SC_SYNC_SECRET || "",
    syncEnabled: parseEnvBool(process.env.SC_SCHEDULE_SYNC_ENABLED, true),
    /** 자동 동기화 주기(ms). 기본 15분 */
    syncIntervalMs: Number(process.env.SC_SCHEDULE_SYNC_INTERVAL_MS || 900000),
    /** 동기화 시 가져올 월 수(현재 월 기준). 기본 ±2개월 = 4개월 */
    scheduleSyncMonths: Number(process.env.SC_SCHEDULE_SYNC_MONTHS || 4),
    /** 내일 SC 일정 시공자 알림톡 (KST) */
    scheduleNotify: {
      enabled: parseEnvBool(process.env.SC_SCHEDULE_NOTIFY_ENABLED, true),
      hour: Number(process.env.SC_SCHEDULE_NOTIFY_HOUR || 18),
      minute: Number(process.env.SC_SCHEDULE_NOTIFY_MINUTE || 0),
    },
    /** SC 일정 공유 링크 공개 origin (미설정 시 SC_API_BASE_URL) */
    sharePublicUrl: process.env.SC_SHARE_PUBLIC_URL || process.env.SC_API_BASE_URL || "https://sc.teammillimeter.com",
  },
  barobill: {
    certKey: process.env.BAROBILL_CERT_KEY || "",
    corpNum: process.env.BAROBILL_CORP_NUM || "",
    userId: process.env.BAROBILL_USER_ID || "",
    /** 바로빌 사이트 링크 URL(GetBaroBillURL) 호출 시 필요 */
    userPwd: process.env.BAROBILL_USER_PWD || "",
    /** 공급자(자사) 대표자명 — 미설정 시 발행 API가 거절될 수 있음 */
    ceoName: process.env.BAROBILL_CEO_NAME || "",
    /** 공급자 담당자 이메일 — 미설정 시 발행 API가 거절될 수 있음 */
    contactEmail: process.env.BAROBILL_CONTACT_EMAIL || "",
    /** 공급자 업태 — 미설정 시 회사정보 또는 기본값(건설업) */
    bizType: process.env.BAROBILL_BIZ_TYPE || "",
    /** 공급자 업종 — 미설정 시 회사정보 또는 기본값(가구시공) */
    bizClass: process.env.BAROBILL_BIZ_CLASS || "",
    /** 바로빌 계좌거래내역조회 대상 계좌 (하이픈 포함/미포함 모두 가능) */
    bankAccountNum: process.env.BAROBILL_BANK_ACCOUNT_NUM || "969-046529-04-015",
    /** 자동 동기화 시 조회 일수 */
    bankSyncDays: Number(process.env.BAROBILL_BANK_SYNC_DAYS || 7),
    /** false 이면 수동 동기화만 가능 */
    bankSyncEnabled: parseEnvBool(process.env.BAROBILL_BANK_SYNC_ENABLED, true),
    test: barobillTest,
    wsdlUrl: barobillTest ? BAROBILL_TEST_WSDL : BAROBILL_PROD_WSDL,
  },
};

/** 초기 계정 — 배포 후 비밀번호 변경 권장 */
export const seedUsers = [
  { loginId: "admin", email: "admin@teammillimeter.com", password: "1234", name: "관리자", role: "admin" },
  { loginId: "sales", email: "sales@teammillimeter.com", password: "1234", name: "매출담당", role: "staff" },
  { loginId: "finance", email: "finance@teammillimeter.com", password: "1234", name: "경리", role: "staff" },
];
