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
  updateSelfProfile,
  updateSelfSidebarOrder,
  verifyUserPassword,
  parseSidebarOrder,
  recordLoginLog,
} from "./db.mjs";
import { authenticateUser, authMiddleware, adminMiddleware, signToken } from "./auth.mjs";
import {
  initPdfArchiveStore,
  listPdfArchiveMetas,
  getPdfArchiveMetaById,
  createPdfArchive,
  getPdfArchiveFile,
  deletePdfArchiveById,
  ensurePdfArchiveShareToken,
  getPdfArchiveFileByShareToken,
} from "./pdfArchive.mjs";
import {
  initBoardAttachmentStore,
  createBoardAttachment,
  getBoardAttachmentFile,
  deleteBoardAttachmentById,
} from "./boardAttachments.mjs";

initDb();
initPdfArchiveStore();
initBoardAttachmentStore();

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

app.get("/api/public/pdf-share/:token", (req, res) => {
  const file = getPdfArchiveFileByShareToken(req.params.token);
  if (!file) {
    res.status(404).send("PDF를 찾을 수 없습니다.");
    return;
  }
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`);
  res.sendFile(path.resolve(file.path));
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

app.get("/api/erp", authMiddleware, (_req, res) => {
  const state = getErpState();
  res.json({
    sales: state.data.sales || [],
    paymentVouchers: state.data.paymentVouchers || [],
    paymentInputLogs: state.data.paymentInputLogs || [],
    clients: state.data.clients || [],
    workers: state.data.workers || [],
    auditLogs: state.data.auditLogs || [],
    loginLogs: state.data.loginLogs || [],
    workerPaymentRecords: state.data.workerPaymentRecords || [],
    companyExpenses: state.data.companyExpenses || [],
    fixedExpenses: state.data.fixedExpenses || [],
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

app.put("/api/erp", authMiddleware, (req, res) => {
  const { sales, paymentVouchers, paymentInputLogs, clients, workers, auditLogs, loginLogs, workerPaymentRecords, companyExpenses, fixedExpenses, companyNotices, workPosts, statementGenerationLogs, statementFolders, companyProfile, version } = req.body || {};
  const existing = getErpState();
  const serverLoginLogs = Array.isArray(existing.data?.loginLogs) ? existing.data.loginLogs : [];
  const payload = {
    sales: Array.isArray(sales) ? sales : [],
    paymentVouchers: Array.isArray(paymentVouchers) ? paymentVouchers : [],
    paymentInputLogs: Array.isArray(paymentInputLogs) ? paymentInputLogs : [],
    clients: Array.isArray(clients) ? clients : [],
    workers: Array.isArray(workers) ? workers : [],
    auditLogs: Array.isArray(auditLogs) ? auditLogs : [],
    loginLogs: serverLoginLogs,
    workerPaymentRecords: Array.isArray(workerPaymentRecords) ? workerPaymentRecords : [],
    companyExpenses: Array.isArray(companyExpenses) ? companyExpenses : [],
    fixedExpenses: Array.isArray(fixedExpenses) ? fixedExpenses : [],
    companyNotices: Array.isArray(companyNotices) ? companyNotices : [],
    workPosts: Array.isArray(workPosts) ? workPosts : [],
    statementGenerationLogs: Array.isArray(statementGenerationLogs) ? statementGenerationLogs : [],
    statementFolders: Array.isArray(statementFolders) ? statementFolders : [],
    companyProfile: companyProfile && typeof companyProfile === "object" ? companyProfile : null,
  };

  try {
    const saved = saveErpState(payload, version ?? null, req.user.loginId || req.user.name || req.user.email);
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

app.get("/api/pdf-archives/:id", authMiddleware, (req, res) => {
  const meta = getPdfArchiveMetaById(req.params.id);
  if (!meta) {
    res.status(404).json({ error: "PDF를 찾을 수 없습니다." });
    return;
  }
  res.json(meta);
});

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
