import { mergeErpPaymentLinkState, mergeWorkerMonthlyPaymentMemosForSave } from "./erpSaveMerge.mjs";
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { config } from "./config.mjs";
import {
  initDb,
  getErpState,
  saveErpState,
  listUsers,
  createUser,
  updateUser,
  updateUserPassword,
  setUserActive,
  findUserById,
  listAttendanceViewableUsers,
  updateSelfProfile,
  updateSelfSidebarOrder,
  verifyUserPassword,
  parseSidebarOrder,
  parseAttendanceViewUserIds,
  recordLoginLog,
} from "./db.mjs";
import { authenticateUser, authMiddleware, adminMiddleware, signToken } from "./auth.mjs";
import {
  authenticateWorkerPortal,
  buildWorkerPortalMonths,
  buildWorkerPortalStatement,
  changeWorkerPortalPassword,
  processWorkersPortalCredentials,
  recordWorkerPortalLoginLog,
  sanitizeWorkersForClient,
  signWorkerPortalToken,
  stripWorkerPortalSecrets,
  workerPortalAuthMiddleware,
} from "./workerPortal.mjs";
import {
  getWorkerPortalAcknowledgment,
  saveWorkerPortalAcknowledgment,
} from "./workerPortalAck.mjs";
import {
  initPdfArchiveStore,
  listPdfArchiveMetas,
  getPdfArchiveMetaById,
  createPdfArchive,
  getPdfArchiveFile,
  deletePdfArchiveById,
  ensurePdfArchiveShareToken,
  getPdfArchiveFileByShareToken,
  updatePdfArchiveMeta,
  migratePdfArchiveShareLink,
} from "./pdfArchive.mjs";
import {
  initBoardAttachmentStore,
  createBoardAttachment,
  getBoardAttachmentFile,
  deleteBoardAttachmentById,
} from "./boardAttachments.mjs";
import { buildPdfShareViewerHtml } from "./pdfShareViewer.mjs";
import { renderPdfSharePreviewImages } from "./pdfSharePreview.mjs";
import { buildPdfShareOgMeta } from "./pdfShareOg.mjs";
import { getBankSyncStatus, runBankFolderSync, startBankSyncScheduler, runUnifiedBankSync } from "./bankSync.mjs";
import {
  getOpenBankingSyncStatus,
  connectOpenBankingManual,
  disconnectOpenBanking,
  handleOpenBankingOAuthCallback,
  runOpenBankingSync,
} from "./openBankingSync.mjs";
import { buildAuthorizeUrl } from "./openBankingClient.mjs";
import { getBarobillConfigStatus, testBarobillConnection, getBarobillUrl } from "./barobill/client.mjs";
import { syncBarobillTaxInvoices } from "./barobill/taxInvoiceSync.mjs";
import { buildIssuedTaxInvoiceRecord, registAndIssueTaxInvoice } from "./barobill/taxInvoiceIssue.mjs";
import { getTaxInvoiceScrapRequestUrl, refreshTaxInvoiceScrap } from "./barobill/taxInvoiceScrap.mjs";
import { classifyBankLedgerBatch } from "./bankLedgerClassify.mjs";

initDb();
initPdfArchiveStore();
initBoardAttachmentStore();
startBankSyncScheduler();

function parsePdfMetaHeader(rawMeta) {
  const text = String(rawMeta);
  try {
    return JSON.parse(text);
  } catch {
    return JSON.parse(decodeURIComponent(text));
  }
}

function parseAttachmentMetaHeader(rawMeta) {
  const text = String(rawMeta);
  try {
    return JSON.parse(text);
  } catch {
    return JSON.parse(decodeURIComponent(text));
  }
}

const app = express();
app.use(cors());
app.use("/vendor/pdfjs", express.static(config.pdfJsDir, { maxAge: "7d", fallthrough: false }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "teammillimeter-erp-api" });
});

function buildBoardPreview(data) {
  const companyNotices = Array.isArray(data?.companyNotices) ? data.companyNotices : [];
  const workPosts = Array.isArray(data?.workPosts) ? data.workPosts : [];

  const sortPinnedFirst = (a, b) => {
    const pinDiff = Number(Boolean(b.isPinned)) - Number(Boolean(a.isPinned));
    if (pinDiff !== 0) return pinDiff;
    return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
  };

  const notices = companyNotices
    .filter((notice) => !notice?.board || notice.board === "notice")
    .sort(sortPinnedFirst)
    .slice(0, 5)
    .map((notice) => ({
      id: String(notice.id || ""),
      title: String(notice.title || ""),
      body: String(notice.body || ""),
      isPinned: Boolean(notice.isPinned),
      createdAt: String(notice.createdAt || ""),
    }));

  const posts = workPosts
    .sort(sortPinnedFirst)
    .slice(0, 5)
    .map((post) => ({
      id: String(post.id || ""),
      title: String(post.title || ""),
      body: String(post.body || ""),
      createdAt: String(post.createdAt || ""),
      attachmentCount: Array.isArray(post.attachments) ? post.attachments.length : 0,
    }));

  return { notices, workPosts: posts };
}

app.get("/api/public/board-preview", (_req, res) => {
  const state = getErpState();
  res.json(buildBoardPreview(state.data));
});

function buildPublicRequestOrigin(req) {
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const forwardedHost = String(req.headers["x-forwarded-host"] || "").split(",")[0].trim();
  if (forwardedProto && forwardedHost) return `${forwardedProto}://${forwardedHost}`;
  return `${req.protocol}://${req.get("host")}`;
}

app.get("/api/public/pdf-share/:token/file", (req, res) => {
  const file = getPdfArchiveFileByShareToken(req.params.token);
  if (!file) {
    res.status(404).send("PDF를 찾을 수 없습니다.");
    return;
  }
  const encodedName = encodeURIComponent(file.fileName);
  const disposition = req.query.download === "1" ? "attachment" : "inline";
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `${disposition}; filename*=UTF-8''${encodedName}`);
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.sendFile(path.resolve(file.path));
});

app.get("/api/public/pdf-share/:token", async (req, res) => {
  const file = getPdfArchiveFileByShareToken(req.params.token);
  if (!file) {
    res.status(404).send("PDF를 찾을 수 없습니다.");
    return;
  }

  if (req.query.download === "1") {
    const encodedName = encodeURIComponent(file.fileName);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodedName}`);
    res.sendFile(path.resolve(file.path));
    return;
  }

  const pdfUrl = `${buildPublicRequestOrigin(req)}/api/public/pdf-share/${encodeURIComponent(req.params.token)}/file`;
  const downloadUrl = `${pdfUrl}?download=1`;
  const sharePageUrl = `${buildPublicRequestOrigin(req)}/api/public/pdf-share/${encodeURIComponent(req.params.token)}`;
  const og = buildPdfShareOgMeta({
    fileName: file.fileName,
    sharePageUrl,
    origin: buildPublicRequestOrigin(req),
  });

  let pageImages = [];
  try {
    pageImages = await renderPdfSharePreviewImages(file.path);
  } catch (error) {
    console.error("pdf share preview failed:", error);
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.send(
    buildPdfShareViewerHtml({
      title: og.ogTitle,
      pdfUrl,
      downloadUrl,
      pageImages,
      og,
    })
  );
});

app.post(
  "/api/pdf-archives",
  authMiddleware,
  express.raw({ type: "application/pdf", limit: "25mb" }),
  (req, res) => {
    try {
      const rawMeta = req.headers["x-pdf-meta"];
      if (!rawMeta) {
        res.status(400).json({ error: "PDF 메타데이터가 없습니다." });
        return;
      }
      const meta = parsePdfMetaHeader(rawMeta);
      if (!meta.fileName || !meta.category) {
        res.status(400).json({ error: "파일명과 구분은 필수입니다." });
        return;
      }
      const buffer = Buffer.from(req.body || []);
      if (!buffer.length) {
        res.status(400).json({ error: "PDF 파일이 비어 있습니다." });
        return;
      }
      const saved = createPdfArchive(buffer, meta, req.user.loginId || req.user.name || req.user.email);
      if (meta.sentViaLink) {
        const token = ensurePdfArchiveShareToken(saved.id);
        if (token) {
          const url = `${buildPublicRequestOrigin(req)}/api/public/pdf-share/${token}`;
          const updated = updatePdfArchiveMeta(saved.id, { shareLinkUrl: url });
          res.status(201).json(updated || { ...saved, shareLinkUrl: url });
          return;
        }
      }
      res.status(201).json(saved);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "PDF 저장에 실패했습니다." });
    }
  },
);

app.post(
  "/api/board-attachments",
  authMiddleware,
  express.raw({ type: () => true, limit: "15mb" }),
  (req, res) => {
    try {
      const rawMeta = req.headers["x-attachment-meta"];
      if (!rawMeta) {
        res.status(400).json({ error: "첨부파일 메타데이터가 없습니다." });
        return;
      }
      const meta = parseAttachmentMetaHeader(rawMeta);
      if (!meta.fileName || !meta.postId) {
        res.status(400).json({ error: "파일명과 게시글 ID는 필수입니다." });
        return;
      }
      const buffer = Buffer.from(req.body || []);
      if (!buffer.length) {
        res.status(400).json({ error: "첨부파일이 비어 있습니다." });
        return;
      }
      const saved = createBoardAttachment(buffer, meta, req.user.loginId || req.user.name || req.user.email);
      res.status(201).json({
        id: saved.id,
        fileName: saved.fileName,
        mimeType: saved.mimeType,
        fileSize: saved.fileSize,
        createdAt: saved.createdAt,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "첨부파일 저장에 실패했습니다." });
    }
  },
);

app.use(express.json({ limit: "25mb" }));

app.post("/api/worker-portal/login", (req, res) => {
  const { loginId, password } = req.body || {};
  const state = getErpState();
  const workers = Array.isArray(state.data?.workers) ? state.data.workers : [];
  const worker = authenticateWorkerPortal(workers, loginId, password);
  if (!worker) {
    res.status(401).json({ error: "\uB85C\uADF8\uC778 ID \uB610\uB294 \uBE44\uBC00\uBC88\uD638\uAC00 \uB9DE\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4." });
    return;
  }
  try {
    recordWorkerPortalLoginLog(worker);
  } catch (error) {
    console.error("[worker-portal] login log save failed:", error);
  }
  const token = signWorkerPortalToken(worker);
  res.json({
    token,
    workerName: stripWorkerPortalSecrets(worker).name,
    workerId: worker.id,
  });
});

app.post("/api/worker-portal/change-password", (req, res) => {
  const { loginId, currentPassword, newPassword, confirmPassword } = req.body || {};
  const trimmedNew = String(newPassword ?? "").trim();
  const trimmedConfirm = String(confirmPassword ?? "").trim();
  if (trimmedNew !== trimmedConfirm) {
    res.status(400).json({ error: "\uC0C8 \uBE44\uBC00\uBC88\uD638 \uD655\uC778\uC774 \uC77C\uCE58\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4." });
    return;
  }

  const state = getErpState();
  const workers = Array.isArray(state.data?.workers) ? state.data.workers : [];
  const result = changeWorkerPortalPassword(workers, loginId, currentPassword, trimmedNew);
  if (!result.ok) {
    res.status(401).json({ error: result.error });
    return;
  }

  try {
    const saved = saveErpState(
      { ...state.data, workers: result.workers },
      state.version,
      `portal-pw:${stripWorkerPortalSecrets(result.worker).name || "worker"}`,
    );
    res.json({ ok: true, version: saved.version });
  } catch (error) {
    if (error.status === 409) {
      res.status(409).json({
        error: "\uC800\uC7A5 \uCDA9\uB3CC\uC774 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.",
      });
      return;
    }
    console.error(error);
    res.status(500).json({ error: "\uBE44\uBC00\uBC88\uD638 \uBCC0\uACBD\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4." });
  }
});

app.get("/api/worker-portal/months", workerPortalAuthMiddleware, (req, res) => {
  const state = getErpState();
  const sales = state.data?.sales || [];
  const workers = state.data?.workers || [];
  const months = buildWorkerPortalMonths(req.workerPortal.workerName, sales, workers);
  res.json({ months, workerName: req.workerPortal.workerName });
});

app.get("/api/worker-portal/statement", workerPortalAuthMiddleware, (req, res) => {
  const monthKey = String(req.query.month || "").trim();
  if (!/^\d{4}-\d{2}$/.test(monthKey)) {
    res.status(400).json({ error: "\uC6D4(YYYY-MM)\uC744 \uC9C0\uC815\uD574 \uC8FC\uC138\uC694." });
    return;
  }
  const state = getErpState();
  const payload = buildWorkerPortalStatement(req.workerPortal.workerName, monthKey, state.data || {});
  res.json(payload);
});

app.get("/api/worker-portal/acknowledgment", workerPortalAuthMiddleware, (req, res) => {
  const monthKey = String(req.query.month || "").trim();
  if (!/^\d{4}-\d{2}$/.test(monthKey)) {
    res.status(400).json({ error: "\uC6D4(YYYY-MM)\uC744 \uC9C0\uC815\uD574 \uC8FC\uC138\uC694." });
    return;
  }
  res.json(getWorkerPortalAcknowledgment(req.workerPortal, monthKey));
});

app.post("/api/worker-portal/acknowledgment", workerPortalAuthMiddleware, (req, res) => {
  const { monthKey, signatureDataUrl } = req.body || {};
  const result = saveWorkerPortalAcknowledgment(req.workerPortal, { monthKey, signatureDataUrl });
  if (!result.ok) {
    res.status(result.status || 400).json({ error: result.error });
    return;
  }
  res.json({ ok: true, acknowledgment: result.acknowledgment, version: result.version });
});

app.post("/api/auth/login", (req, res) => {
  const { loginId, email, password } = req.body || {};
  const identifier = loginId || email;
  const user = authenticateUser(identifier, password);
  if (!user) {
    res.status(401).json({ error: "로그인 ID 또는 비밀번호가 맞지 않습니다." });
    return;
  }
  let erpVersion = null;
  try {
    const logged = recordLoginLog(user);
    erpVersion = logged.version;
  } catch (error) {
    console.error("login log save failed:", error);
  }
  const token = signToken(user);
  res.json({
    token,
    erpVersion,
    user: {
      id: user.id,
      loginId: user.loginId,
      email: user.email,
      name: user.name,
      role: user.role,
      phone: user.phone,
      allowedPages: user.allowedPages,
      sidebarOrder: user.sidebarOrder,
      attendanceViewUserIds: user.attendanceViewUserIds,
    },
  });
});

function formatAuthUserResponse(userId) {
  const row = findUserById(userId);
  if (!row) return null;
  const email = String(row.email || "").trim();
  return {
    id: row.id,
    loginId: row.login_id,
    email: email.endsWith("@local.teammillimeter") ? null : email || null,
    name: row.name,
    phone: row.phone || null,
    role: row.role,
    allowedPages: (() => {
      if (!row.allowed_pages) return null;
      try {
        const parsed = JSON.parse(String(row.allowed_pages));
        return Array.isArray(parsed) ? parsed : null;
      } catch {
        return null;
      }
    })(),
    sidebarOrder: parseSidebarOrder(row.sidebar_order),
    attendanceViewUserIds: parseAttendanceViewUserIds(row.attendance_view_user_ids),
  };
}

app.get("/api/auth/me", authMiddleware, (req, res) => {
  const user = formatAuthUserResponse(req.user.sub);
  if (!user) {
    res.status(404).json({ error: "사용자를 찾을 수 없습니다." });
    return;
  }
  res.json({ user });
});

app.patch("/api/auth/me", authMiddleware, (req, res) => {
  try {
    const user = updateSelfProfile(req.user.sub, req.body || {});
    res.json({
      user: {
        id: user.id,
        loginId: user.loginId,
        email: user.email,
        name: user.name,
        phone: user.phone,
        role: user.role,
        allowedPages: user.allowedPages,
        sidebarOrder: user.sidebarOrder,
        attendanceViewUserIds: user.attendanceViewUserIds,
      },
    });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || "내 정보 수정에 실패했습니다." });
  }
});

app.patch("/api/auth/me/sidebar-order", authMiddleware, (req, res) => {
  try {
    const user = updateSelfSidebarOrder(req.user.sub, req.body?.sidebarOrder ?? null);
    res.json({
      user: {
        id: user.id,
        loginId: user.loginId,
        email: user.email,
        name: user.name,
        phone: user.phone,
        role: user.role,
        allowedPages: user.allowedPages,
        sidebarOrder: user.sidebarOrder,
        attendanceViewUserIds: user.attendanceViewUserIds,
      },
    });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || "메뉴 순서 저장에 실패했습니다." });
  }
});

app.patch("/api/auth/me/password", authMiddleware, (req, res) => {
  try {
    const { currentPassword, password } = req.body || {};
    if (!verifyUserPassword(req.user.sub, currentPassword)) {
      res.status(400).json({ error: "현재 비밀번호가 맞지 않습니다." });
      return;
    }
    updateUserPassword(req.user.sub, password);
    res.json({ ok: true });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || "비밀번호 변경에 실패했습니다." });
  }
});

app.get("/api/users", authMiddleware, adminMiddleware, (_req, res) => {
  res.json({ users: listUsers() });
});

app.get("/api/users/attendance-viewable", authMiddleware, (req, res) => {
  res.json({ users: listAttendanceViewableUsers(req.user.sub) });
});

app.post("/api/users", authMiddleware, adminMiddleware, (req, res) => {
  try {
    const user = createUser(req.body || {});
    res.status(201).json({ user });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || "사용자 생성에 실패했습니다." });
  }
});

app.put("/api/users/:id", authMiddleware, adminMiddleware, (req, res) => {
  try {
    const user = updateUser(req.params.id, req.body || {}, req.user.sub);
    res.json({ user });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || "사용자 수정에 실패했습니다." });
  }
});

app.patch("/api/users/:id/password", authMiddleware, adminMiddleware, (req, res) => {
  try {
    const { password } = req.body || {};
    const user = updateUserPassword(req.params.id, password);
    res.json({ user });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || "비밀번호 변경에 실패했습니다." });
  }
});

app.patch("/api/users/:id/status", authMiddleware, adminMiddleware, (req, res) => {
  try {
    const { isActive } = req.body || {};
    const user = setUserActive(req.params.id, isActive, req.user.sub);
    res.json({ user });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || "상태 변경에 실패했습니다." });
  }
});

function normalizeWorkerRecordId(id) {
  if (id == null || id === "") return "";
  return String(id);
}

function normalizeWorkerMonthlyPaymentMemos(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    const idKey = normalizeWorkerRecordId(key);
    const text = String(value ?? "").trim();
    if (idKey && text) out[idKey] = text;
  }
  return out;
}

function syncWorkerMonthlyPaymentMemosFromWorkers(workers = [], memos = {}) {
  const next = { ...memos };
  for (const worker of workers) {
    const idKey = normalizeWorkerRecordId(worker?.id);
    const text = String(worker?.monthlyPaymentMemo || "").trim();
    if (idKey && text && !next[idKey]) next[idKey] = text;
  }
  return next;
}

function patchWorkerMonthlyPaymentMemos(memos = {}, workerId, memo) {
  const idKey = normalizeWorkerRecordId(workerId);
  if (!idKey) return memos;
  const trimmed = String(memo ?? "").trim();
  const next = { ...memos };
  if (trimmed) next[idKey] = trimmed;
  else delete next[idKey];
  return next;
}

function stripMonthlyPaymentMemoFromWorkers(workers = []) {
  return workers.map(({ monthlyPaymentMemo: _legacy, portalPassword: _pw, ...worker }) => worker);
}

function ensureWorkerMonthlyPaymentMemos(data = {}) {
  const workers = Array.isArray(data.workers) ? data.workers : [];
  const storedMemos = normalizeWorkerMonthlyPaymentMemos(data.workerMonthlyPaymentMemos);
  const workerMonthlyPaymentMemos = syncWorkerMonthlyPaymentMemosFromWorkers(workers, storedMemos);
  const strippedWorkers = stripMonthlyPaymentMemoFromWorkers(workers);
  const migrated =
    JSON.stringify(workerMonthlyPaymentMemos) !== JSON.stringify(storedMemos) ||
    workers.some((worker) => String(worker?.monthlyPaymentMemo || "").trim());
  return { workerMonthlyPaymentMemos, workers: strippedWorkers, migrated };
}

app.get("/api/erp", authMiddleware, (_req, res) => {
  const state = getErpState();
  const { workerMonthlyPaymentMemos, workers, migrated } = ensureWorkerMonthlyPaymentMemos(state.data || {});
  if (migrated) {
    try {
      saveErpState(
        { ...state.data, workers, workerMonthlyPaymentMemos },
        state.version,
        "memo-migration",
      );
    } catch (error) {
      console.error("[workerMonthlyPaymentMemos] migration save failed", error);
    }
  }
  res.json({
    sales: state.data.sales || [],
    paymentVouchers: state.data.paymentVouchers || [],
    paymentInputLogs: state.data.paymentInputLogs || [],
    clients: state.data.clients || [],
    workers: sanitizeWorkersForClient(workers),
    workerMonthlyPaymentMemos,
    auditLogs: state.data.auditLogs || [],
    loginLogs: state.data.loginLogs || [],
    workerPortalStatementAcks: state.data.workerPortalStatementAcks || [],
    workerPaymentRecords: state.data.workerPaymentRecords || [],
    workerPayoutVouchers: state.data.workerPayoutVouchers || [],
    workerMonthlyActualVouchers: state.data.workerMonthlyActualVouchers || [],
    workerPayWithVatLearnRules: state.data.workerPayWithVatLearnRules || [],
    companyExpenses: state.data.companyExpenses || [],
    attendanceRecords: state.data.attendanceRecords || [],
    fixedExpenses: state.data.fixedExpenses || [],
    fixedExpensePayments: state.data.fixedExpensePayments || [],
    bankLedgerRules: state.data.bankLedgerRules || [],
    expenseCategories: state.data.expenseCategories || [],
    fixedExpenseCategories: state.data.fixedExpenseCategories || [],
    taxInvoices: state.data.taxInvoices || [],
    bankTransactions: state.data.bankTransactions || [],
    bankTransactionFolders: state.data.bankTransactionFolders || [],
    companyNotices: state.data.companyNotices || [],
    workPosts: state.data.workPosts || [],
    statementGenerationLogs: state.data.statementGenerationLogs || [],
    statementFolders: state.data.statementFolders || [],
    companyProfile: state.data.companyProfile || null,
    version: state.version,
    updatedAt: state.updatedAt,
    updatedBy: state.updatedBy,
  });
});

app.post("/api/bank/classify-ledger", authMiddleware, async (req, res) => {
  try {
    const result = await classifyBankLedgerBatch(req.body || {});
    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "분류에 실패했습니다.",
      items: [],
      engine: "error",
    });
  }
});

app.get("/api/erp/bank-sync", authMiddleware, (req, res) => {
  const sinceVersion = Number(req.query.sinceVersion || 0);
  const state = getErpState();
  const changed = state.version > sinceVersion;
  res.json({
    version: state.version,
    updatedAt: state.updatedAt,
    updatedBy: state.updatedBy,
    changed,
    bankTransactions: changed ? state.data.bankTransactions || [] : undefined,
    bankTransactionFolders: changed ? state.data.bankTransactionFolders || [] : undefined,
    bankSyncMeta: state.data.bankSyncMeta || null,
    liveSyncStatus: getBankSyncStatus(),
    openBankingStatus: getOpenBankingSyncStatus(),
  });
});

app.post("/api/bank-sync/run", authMiddleware, async (req, res) => {
  const actor = req.user.loginId || req.user.name || req.user.email || "manual-sync";
  const result = await runUnifiedBankSync({ updatedBy: actor, forceMetaUpdate: true });
  if (!result.ok && result.error) {
    res.status(500).json({
      error: result.error,
      liveSyncStatus: getBankSyncStatus(),
      openBankingStatus: getOpenBankingSyncStatus(),
    });
    return;
  }
  const state = getErpState();
  res.json({
    ...result,
    version: state.version,
    updatedAt: state.updatedAt,
    bankSyncMeta: state.data.bankSyncMeta || null,
    liveSyncStatus: getBankSyncStatus(),
    openBankingStatus: getOpenBankingSyncStatus(),
  });
});

app.get("/api/open-banking/status", authMiddleware, (_req, res) => {
  res.json({ status: getOpenBankingSyncStatus() });
});

app.get("/api/barobill/status", authMiddleware, adminMiddleware, async (_req, res) => {
  const configStatus = getBarobillConfigStatus();
  const { certKeyMasked: _masked, ...safeConfig } = configStatus;
  try {
    const result = await testBarobillConnection();
    const { certKeyMasked: _resultMasked, ...safeResult } = result;
    res.json({
      ...safeConfig,
      connectionOk: safeResult.connectionOk ?? false,
      balance: safeResult.balance,
      errCode: safeResult.errCode,
      message: safeResult.message,
    });
  } catch (error) {
    res.json({
      ...safeConfig,
      connectionOk: false,
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

app.get("/api/barobill/charge-url", authMiddleware, adminMiddleware, async (_req, res) => {
  const configStatus = getBarobillConfigStatus();
  if (!configStatus.configured || !configStatus.hasUserId) {
    res.status(400).json({ error: "바로빌 인증키, 사업자번호, 사용자 ID가 설정되지 않았습니다." });
    return;
  }
  if (!configStatus.hasUserPwd) {
    res.status(400).json({ error: "BAROBILL_USER_PWD(바로빌 로그인 비밀번호)가 설정되지 않았습니다." });
    return;
  }

  try {
    const url = await getBarobillUrl("CHRG");
    res.json({ ok: true, url });
  } catch (error) {
    const errCode = error && typeof error === "object" && "errCode" in error ? error.errCode : undefined;
    res.status(500).json({
      error: error instanceof Error ? error.message : String(error),
      errCode,
    });
  }
});

app.get("/api/barobill/scrap-status", authMiddleware, adminMiddleware, async (_req, res) => {
  try {
    const result = await refreshTaxInvoiceScrap();
    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

app.get("/api/barobill/scrap-request-url", authMiddleware, adminMiddleware, async (_req, res) => {
  try {
    const url = await getTaxInvoiceScrapRequestUrl();
    res.json({ ok: true, url });
  } catch (error) {
    const errCode = error && typeof error === "object" && "errCode" in error ? error.errCode : undefined;
    res.status(500).json({
      error: error instanceof Error ? error.message : String(error),
      errCode,
    });
  }
});

app.post("/api/barobill/scrap-refresh", authMiddleware, adminMiddleware, async (_req, res) => {
  try {
    const result = await refreshTaxInvoiceScrap();
    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

app.post("/api/barobill/tax-invoices/sync", authMiddleware, adminMiddleware, async (req, res) => {
  const startDate = String(req.body?.startDate || "").trim();
  const endDate = String(req.body?.endDate || "").trim();
  const apply = Boolean(req.body?.apply);
  const rawFlowTypes = Array.isArray(req.body?.flowTypes) ? req.body.flowTypes : ["purchase", "sales"];
  const flowTypes = rawFlowTypes.filter((value) => value === "purchase" || value === "sales");

  if (!startDate || !endDate) {
    res.status(400).json({ error: "시작일과 종료일이 필요합니다." });
    return;
  }
  if (startDate > endDate) {
    res.status(400).json({ error: "시작일이 종료일보다 늦을 수 없습니다." });
    return;
  }
  if (!flowTypes.length) {
    res.status(400).json({ error: "매입 또는 매출 중 하나 이상을 선택해 주세요." });
    return;
  }

  const configStatus = getBarobillConfigStatus();
  if (!configStatus.configured) {
    res.status(400).json({ error: "바로빌 인증키(CERTKEY)와 사업자번호가 설정되지 않았습니다." });
    return;
  }
  if (!configStatus.hasUserId) {
    res.status(400).json({ error: "바로빌 사용자 ID(BAROBILL_USER_ID)가 설정되지 않았습니다." });
    return;
  }

  const state = getErpState();
  const existing = Array.isArray(state.data?.taxInvoices) ? state.data.taxInvoices : [];
  const author = {
    name: req.user?.name || req.user?.loginId || "관리자",
    loginId: req.user?.loginId,
  };

  try {
    const result = await syncBarobillTaxInvoices({
      startDate,
      endDate,
      flowTypes,
      existing,
      author,
      apply,
    });

    if (!apply) {
      res.json({
        ok: true,
        apply: false,
        added: result.added,
        skipped: result.skipped,
        preview: result.preview,
      });
      return;
    }

    const saved = saveErpState(
      { ...state.data, taxInvoices: result.taxInvoices },
      req.body?.version ?? state.version,
      req.user.loginId || req.user.name || req.user.email,
    );

    res.json({
      ok: true,
      apply: true,
      added: result.added,
      skipped: result.skipped,
      preview: result.preview,
      taxInvoices: saved.data.taxInvoices || result.taxInvoices,
      version: saved.version,
      updatedAt: saved.updatedAt,
    });
  } catch (error) {
    const errCode = error && typeof error === "object" && "errCode" in error ? error.errCode : undefined;
    res.status(500).json({
      error: error instanceof Error ? error.message : String(error),
      errCode,
    });
  }
});

app.post("/api/barobill/tax-invoices/issue", authMiddleware, adminMiddleware, async (req, res) => {
  const apply = Boolean(req.body?.apply);
  const documentType = req.body?.documentType === "bill" ? "bill" : "tax";
  const supplyAmount = Math.round(Number(req.body?.supplyAmount) || 0);
  const vatAmount = Math.round(Number(req.body?.vatAmount) || 0);
  const totalAmount = Math.round(Number(req.body?.totalAmount) || 0);

  const configStatus = getBarobillConfigStatus();
  if (!configStatus.configured) {
    res.status(400).json({ error: "바로빌 인증키(CERTKEY)와 사업자번호가 설정되지 않았습니다." });
    return;
  }
  if (!configStatus.hasUserId) {
    res.status(400).json({ error: "바로빌 사용자 ID(BAROBILL_USER_ID)가 설정되지 않았습니다." });
    return;
  }

  const author = {
    name: req.user?.name || req.user?.loginId || "관리자",
    loginId: req.user?.loginId,
  };

  try {
    const issueResult = await registAndIssueTaxInvoice({
      issueDate: String(req.body?.issueDate || "").trim(),
      client: String(req.body?.client || "").trim(),
      businessNo: String(req.body?.businessNo || "").trim(),
      flowType: "sales",
      documentType,
      supplyAmount,
      vatAmount,
      totalAmount,
      itemName: req.body?.itemName ? String(req.body.itemName) : undefined,
      memo: req.body?.memo ? String(req.body.memo) : undefined,
      purposeType: Number(req.body?.purposeType) || 2,
      invoiceeCeoName: req.body?.invoiceeCeoName ? String(req.body.invoiceeCeoName) : undefined,
      invoiceeContactName: req.body?.invoiceeContactName ? String(req.body.invoiceeContactName) : undefined,
      invoiceeEmail: req.body?.invoiceeEmail ? String(req.body.invoiceeEmail) : undefined,
      invoiceeAddr: req.body?.invoiceeAddr ? String(req.body.invoiceeAddr) : undefined,
      invoiceePhone: req.body?.invoiceePhone ? String(req.body.invoiceePhone) : undefined,
      invoiceeBizType: req.body?.invoiceeBizType ? String(req.body.invoiceeBizType) : undefined,
      invoiceeBizClass: req.body?.invoiceeBizClass ? String(req.body.invoiceeBizClass) : undefined,
    });

    const taxInvoice = buildIssuedTaxInvoiceRecord(
      {
        issueDate: String(req.body?.issueDate || "").trim(),
        client: String(req.body?.client || "").trim(),
        businessNo: String(req.body?.businessNo || "").trim(),
        documentType,
        supplyAmount,
        vatAmount,
        totalAmount,
        memo: req.body?.memo ? String(req.body.memo) : undefined,
      },
      issueResult,
      author,
    );

    if (!apply) {
      res.json({
        ...issueResult,
        taxInvoice,
      });
      return;
    }

    const state = getErpState();
    const existing = Array.isArray(state.data?.taxInvoices) ? state.data.taxInvoices : [];
    const saved = saveErpState(
      { ...state.data, taxInvoices: [taxInvoice, ...existing] },
      req.body?.version ?? state.version,
      req.user.loginId || req.user.name || req.user.email,
    );

    res.json({
      ...issueResult,
      taxInvoice,
      taxInvoices: saved.data.taxInvoices || [taxInvoice, ...existing],
      version: saved.version,
      updatedAt: saved.updatedAt,
    });
  } catch (error) {
    const errCode = error && typeof error === "object" && "errCode" in error ? error.errCode : undefined;
    const isValidation = error && typeof error === "object" && "validation" in error && error.validation;
    res.status(isValidation ? 400 : 500).json({
      error: error instanceof Error ? error.message : String(error),
      errCode,
    });
  }
});

app.get("/api/open-banking/authorize-url", authMiddleware, adminMiddleware, (_req, res) => {
  try {
    const url = buildAuthorizeUrl(`erp-${Date.now()}`);
    res.json({ url });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.get("/api/open-banking/oauth/callback", async (req, res) => {
  try {
    const code = String(req.query.code || "");
    const result = await handleOpenBankingOAuthCallback(code);
    if (!result.ok) {
      res.status(400).send(result.error || "연동 실패");
      return;
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(`<!DOCTYPE html><html lang="ko"><body style="font-family:sans-serif;padding:2rem"><h1>오픈뱅킹 연동 완료</h1><p>ERP 통장 거래내역 화면으로 돌아가 핀테크이용번호를 저장해 주세요.</p><p>이 창은 닫아도 됩니다.</p></body></html>`);
  } catch (error) {
    res.status(500).send(error instanceof Error ? error.message : "연동 실패");
  }
});

app.post("/api/open-banking/connect", authMiddleware, adminMiddleware, (req, res) => {
  const result = connectOpenBankingManual(req.body || {});
  if (!result.ok) {
    res.status(400).json(result);
    return;
  }
  res.json(result);
});

app.post("/api/open-banking/disconnect", authMiddleware, adminMiddleware, (_req, res) => {
  res.json(disconnectOpenBanking());
});

app.post("/api/open-banking/sync", authMiddleware, async (req, res) => {
  const actor = req.user.loginId || req.user.name || req.user.email || "open-banking-manual";
  const result = await runOpenBankingSync({ updatedBy: actor, forceMetaUpdate: true });
  if (!result.ok && result.error) {
    res.status(500).json({ ...result, status: getOpenBankingSyncStatus() });
    return;
  }
  const state = getErpState();
  res.json({
    ...result,
    version: state.version,
    updatedAt: state.updatedAt,
    bankSyncMeta: state.data.bankSyncMeta || null,
    status: getOpenBankingSyncStatus(),
  });
});

app.get("/api/bank-sync/status", authMiddleware, (_req, res) => {
  const state = getErpState();
  res.json({
    liveSyncStatus: getBankSyncStatus(),
    openBankingStatus: getOpenBankingSyncStatus(),
    bankSyncMeta: state.data.bankSyncMeta || null,
    version: state.version,
    updatedAt: state.updatedAt,
  });
});

app.patch("/api/erp/workers/:workerId/monthly-payment-memo", authMiddleware, (req, res) => {
  const workerId = String(req.params.workerId || "").trim();
  const memo = String(req.body?.monthlyPaymentMemo ?? "").trim();
  const version = req.body?.version ?? null;

  if (!workerId) {
    res.status(400).json({ error: "시공자 ID가 필요합니다." });
    return;
  }

  const state = getErpState();
  const workers = Array.isArray(state.data?.workers) ? state.data.workers : [];
  const workerIndex = workers.findIndex((worker) => String(worker?.id ?? "") === workerId);
  if (workerIndex < 0) {
    res.status(404).json({ error: "시공자를 찾을 수 없습니다." });
    return;
  }

  const existingMemos = normalizeWorkerMonthlyPaymentMemos(state.data?.workerMonthlyPaymentMemos);
  const workerMonthlyPaymentMemos = patchWorkerMonthlyPaymentMemos(existingMemos, workerId, memo);
  const strippedWorkers = stripMonthlyPaymentMemoFromWorkers(workers);

  console.log("[monthly-payment-memo] PATCH", {
    workerId,
    memoLen: memo.length,
    memoPreview: memo.slice(0, 40),
    mapKeys: Object.keys(workerMonthlyPaymentMemos).length,
    user: req.user?.loginId || req.user?.name,
  });

  try {
    const saved = saveErpState(
      { ...state.data, workers: strippedWorkers, workerMonthlyPaymentMemos },
      version ?? state.version,
      req.user.loginId || req.user.name || req.user.email,
    );
    res.json({
      ok: true,
      version: saved.version,
      updatedAt: saved.updatedAt,
      workerId,
      monthlyPaymentMemo: memo,
      workerMonthlyPaymentMemos,
    });
  } catch (error) {
    if (error.status === 409) {
      res.status(409).json({
        error: "다른 사용자가 먼저 저장했습니다. 새로고침 후 다시 시도해 주세요.",
        currentVersion: error.currentVersion,
      });
      return;
    }
    console.error(error);
    res.status(500).json({ error: "비고 저장에 실패했습니다." });
  }
});

app.put("/api/erp", authMiddleware, (req, res) => {
  const {
    sales,
    paymentVouchers,
    paymentInputLogs,
    clients,
    workers,
    auditLogs,
    loginLogs,
    workerPaymentRecords,
    workerPayoutVouchers,
    workerMonthlyActualVouchers,
    workerPayWithVatLearnRules,
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
    workerMonthlyPaymentMemos,
    version,
  } = req.body || {};
  const existing = getErpState();
  const serverLoginLogs = Array.isArray(existing.data?.loginLogs) ? existing.data.loginLogs : [];
  const serverPortalAcks = Array.isArray(existing.data?.workerPortalStatementAcks)
    ? existing.data.workerPortalStatementAcks
    : [];
  const payload = {
    sales: Array.isArray(sales) ? sales : existing.data.sales || [],
    paymentVouchers: Array.isArray(paymentVouchers) ? paymentVouchers : existing.data.paymentVouchers || [],
    paymentInputLogs: Array.isArray(paymentInputLogs) ? paymentInputLogs : existing.data.paymentInputLogs || [],
    clients: Array.isArray(clients) ? clients : existing.data.clients || [],
    workers: Array.isArray(workers) ? workers : existing.data.workers || [],
    auditLogs: Array.isArray(auditLogs) ? auditLogs : existing.data.auditLogs || [],
    loginLogs: serverLoginLogs,
    workerPortalStatementAcks: serverPortalAcks,
    workerPaymentRecords: Array.isArray(workerPaymentRecords)
      ? workerPaymentRecords
      : existing.data.workerPaymentRecords || [],
    workerPayoutVouchers: Array.isArray(workerPayoutVouchers)
      ? workerPayoutVouchers
      : existing.data.workerPayoutVouchers || [],
    workerMonthlyActualVouchers: Array.isArray(workerMonthlyActualVouchers)
      ? workerMonthlyActualVouchers.length ||
        !(existing.data.workerMonthlyActualVouchers || []).some(
          (voucher) => Array.isArray(voucher?.entries) && voucher.entries.length > 0,
        )
        ? workerMonthlyActualVouchers
        : existing.data.workerMonthlyActualVouchers || []
      : existing.data.workerMonthlyActualVouchers || [],
    workerPayWithVatLearnRules: Array.isArray(workerPayWithVatLearnRules)
      ? workerPayWithVatLearnRules
      : existing.data.workerPayWithVatLearnRules || [],
    companyExpenses: Array.isArray(companyExpenses) ? companyExpenses : existing.data.companyExpenses || [],
    attendanceRecords: Array.isArray(attendanceRecords)
      ? attendanceRecords
      : existing.data.attendanceRecords || [],
    fixedExpenses: Array.isArray(fixedExpenses) ? fixedExpenses : existing.data.fixedExpenses || [],
    fixedExpensePayments: Array.isArray(fixedExpensePayments)
      ? fixedExpensePayments
      : existing.data.fixedExpensePayments || [],
    bankLedgerRules: Array.isArray(bankLedgerRules) ? bankLedgerRules : existing.data.bankLedgerRules || [],
    expenseCategories: Array.isArray(expenseCategories)
      ? expenseCategories
      : existing.data.expenseCategories || [],
    fixedExpenseCategories: Array.isArray(fixedExpenseCategories)
      ? fixedExpenseCategories
      : existing.data.fixedExpenseCategories || [],
    companyNotices: Array.isArray(companyNotices) ? companyNotices : existing.data.companyNotices || [],
    workPosts: Array.isArray(workPosts) ? workPosts : existing.data.workPosts || [],
    taxInvoices: Array.isArray(taxInvoices) ? taxInvoices : existing.data.taxInvoices || [],
    bankTransactions: Array.isArray(bankTransactions)
      ? bankTransactions.length || !(existing.data.bankTransactions || []).length
        ? bankTransactions
        : existing.data.bankTransactions || []
      : existing.data.bankTransactions || [],
    bankTransactionFolders: Array.isArray(bankTransactionFolders)
      ? bankTransactionFolders
      : existing.data.bankTransactionFolders || [],
    statementGenerationLogs: Array.isArray(statementGenerationLogs)
      ? statementGenerationLogs
      : existing.data.statementGenerationLogs || [],
    statementFolders: Array.isArray(statementFolders) ? statementFolders : existing.data.statementFolders || [],
    companyProfile:
      companyProfile && typeof companyProfile === "object"
        ? companyProfile
        : existing.data.companyProfile || null,
    workerMonthlyPaymentMemos:
      mergeWorkerMonthlyPaymentMemosForSave(
        existing.data.workerMonthlyPaymentMemos || {},
        workerMonthlyPaymentMemos &&
          typeof workerMonthlyPaymentMemos === "object" &&
          !Array.isArray(workerMonthlyPaymentMemos)
          ? workerMonthlyPaymentMemos
          : {},
      ),
  };

  const mergedPayload = mergeErpPaymentLinkState(existing.data || {}, payload);
  const existingWorkers = existing.data?.workers || [];
  mergedPayload.workers = stripMonthlyPaymentMemoFromWorkers(
    processWorkersPortalCredentials(mergedPayload.workers || [], existingWorkers),
  );

  if (workerMonthlyPaymentMemos && typeof workerMonthlyPaymentMemos === "object") {
    console.log("[erp PUT] workerMonthlyPaymentMemos", Object.keys(workerMonthlyPaymentMemos));
  }

  try {
    const saved = saveErpState(mergedPayload, version ?? null, req.user.loginId || req.user.name || req.user.email);
    res.json({ ok: true, version: saved.version, updatedAt: saved.updatedAt });
  } catch (error) {
    if (error.status === 409) {
      res.status(409).json({
        error: "다른 사용자가 먼저 저장했습니다. 새로고침 후 다시 시도해 주세요.",
        currentVersion: error.currentVersion,
      });
      return;
    }
    console.error(error);
    res.status(500).json({ error: "저장에 실패했습니다." });
  }
});

app.get("/api/pdf-archives", authMiddleware, (_req, res) => {
  res.json({ records: listPdfArchiveMetas() });
});

app.post("/api/pdf-archives/migrate-share-link", authMiddleware, (req, res) => {
  try {
    const keeperId = String(req.body?.keeperId || "").trim();
    const duplicateId = String(req.body?.duplicateId || "").trim();
    if (!keeperId || !duplicateId) {
      res.status(400).json({ error: "keeperId와 duplicateId가 필요합니다." });
      return;
    }
    const updated = migratePdfArchiveShareLink(keeperId, duplicateId);
    if (!updated) {
      res.status(404).json({ error: "PDF를 찾을 수 없습니다." });
      return;
    }
    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "공유 링크 이전에 실패했습니다." });
  }
});

app.get("/api/pdf-archives/:id", authMiddleware, (req, res) => {
  const meta = getPdfArchiveMetaById(req.params.id);
  if (!meta) {
    res.status(404).json({ error: "PDF를 찾을 수 없습니다." });
    return;
  }
  res.json(meta);
});

function patchPdfArchiveMetaHandler(req, res) {
  try {
    const patch = req.body || {};
    const allowed = {};
    if (patch.sentViaLink != null) allowed.sentViaLink = Boolean(patch.sentViaLink);
    if (patch.statementTotalAmount != null) allowed.statementTotalAmount = Number(patch.statementTotalAmount);
    if (patch.paymentStatus != null) allowed.paymentStatus = String(patch.paymentStatus);
    if (patch.linkedBankTransactionId != null) {
      allowed.linkedBankTransactionId = String(patch.linkedBankTransactionId);
    }
    if (patch.linkedPaymentVoucherId != null) {
      allowed.linkedPaymentVoucherId = patch.linkedPaymentVoucherId;
    }
    if (patch.shareLinkUrl != null) allowed.shareLinkUrl = String(patch.shareLinkUrl);
    if (patch.statementSalesIds != null) {
      allowed.statementSalesIds = Array.isArray(patch.statementSalesIds)
        ? patch.statementSalesIds.map((id) => id)
        : [];
    }

    const updated = updatePdfArchiveMeta(req.params.id, allowed);
    if (!updated) {
      res.status(404).json({ error: "PDF를 찾을 수 없습니다." });
      return;
    }
    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "PDF 메타 업데이트에 실패했습니다." });
  }
}

app.patch("/api/pdf-archives/:id", authMiddleware, patchPdfArchiveMetaHandler);
app.put("/api/pdf-archives/:id", authMiddleware, patchPdfArchiveMetaHandler);
app.post("/api/pdf-archives/:id/meta", authMiddleware, patchPdfArchiveMetaHandler);

app.get("/api/pdf-archives/:id/file", authMiddleware, (req, res) => {
  const file = getPdfArchiveFile(req.params.id);
  if (!file) {
    res.status(404).json({ error: "PDF 파일을 찾을 수 없습니다." });
    return;
  }
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`);
  res.sendFile(path.resolve(file.path));
});

app.post("/api/pdf-archives/:id/share-link", authMiddleware, (req, res) => {
  const meta = getPdfArchiveMetaById(req.params.id);
  if (!meta) {
    res.status(404).json({ error: "PDF를 찾을 수 없습니다." });
    return;
  }
  const token = ensurePdfArchiveShareToken(req.params.id);
  if (!token) {
    res.status(500).json({ error: "공유 링크를 만들 수 없습니다." });
    return;
  }
  const url = `${buildPublicRequestOrigin(req)}/api/public/pdf-share/${token}`;
  updatePdfArchiveMeta(req.params.id, { shareLinkUrl: url });
  res.json({ token, url, fileName: meta.fileName });
});

app.delete("/api/pdf-archives/:id", authMiddleware, (req, res) => {
  const deleted = deletePdfArchiveById(req.params.id);
  if (!deleted) {
    res.status(404).json({ error: "PDF를 찾을 수 없습니다." });
    return;
  }
  res.json({ ok: true });
});

app.get("/api/board-attachments/:id/file", authMiddleware, (req, res) => {
  const file = getBoardAttachmentFile(req.params.id);
  if (!file) {
    res.status(404).json({ error: "첨부파일을 찾을 수 없습니다." });
    return;
  }
  res.setHeader("Content-Type", file.mimeType || "application/octet-stream");
  res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`);
  res.sendFile(path.resolve(file.path));
});

app.delete("/api/board-attachments/:id", authMiddleware, (req, res) => {
  const deleted = deleteBoardAttachmentById(req.params.id);
  if (!deleted) {
    res.status(404).json({ error: "첨부파일을 찾을 수 없습니다." });
    return;
  }
  res.json({ ok: true });
});

app.use("/api", (req, res) => {
  res.status(404).json({ error: `${req.method} ${req.originalUrl} 을(를) 처리할 수 없습니다.` });
});

if (fs.existsSync(config.distDir)) {
  app.use(express.static(config.distDir));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(config.distDir, "index.html"));
  });
}

app.listen(config.port, () => {
  console.log(`TeamMillimeter ERP API listening on http://localhost:${config.port}`);
  if (fs.existsSync(config.distDir)) {
    console.log(`Serving frontend from ${config.distDir}`);
  } else {
    console.log("dist/ not found — run npm run build for combined deploy, or use Vite dev proxy.");
  }
});
