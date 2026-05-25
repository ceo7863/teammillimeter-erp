import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

export const config = {
  port: Number(process.env.PORT || 8080),
  jwtSecret: process.env.JWT_SECRET || "change-me-in-production-teammillimeter-erp",
  dbPath: process.env.DATABASE_PATH || path.join(rootDir, "data", "erp.sqlite"),
  pdfArchiveDir: process.env.PDF_ARCHIVE_DIR || path.join(rootDir, "data", "pdf-archives"),
  boardAttachmentDir: process.env.BOARD_ATTACHMENT_DIR || path.join(rootDir, "data", "board-attachments"),
  distDir: process.env.DIST_DIR || path.join(rootDir, "dist"),
  tokenExpiresIn: process.env.JWT_EXPIRES || "7d",
};

/** 초기 계정 — 배포 후 비밀번호 변경 권장 */
export const seedUsers = [
  { loginId: "admin", email: "admin@teammillimeter.com", password: "1234", name: "관리자", role: "admin" },
  { loginId: "sales", email: "sales@teammillimeter.com", password: "1234", name: "매출담당", role: "staff" },
  { loginId: "finance", email: "finance@teammillimeter.com", password: "1234", name: "경리", role: "staff" },
];
