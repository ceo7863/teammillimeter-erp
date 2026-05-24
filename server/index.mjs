import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { config } from "./config.mjs";
import { initDb, getErpState, saveErpState, listUsers } from "./db.mjs";
import { authenticateUser, authMiddleware, adminMiddleware, signToken } from "./auth.mjs";
import {
  initPdfArchiveStore,
  listPdfArchiveMetas,
  getPdfArchiveMetaById,
  createPdfArchive,
  getPdfArchiveFile,
  deletePdfArchiveById,
} from "./pdfArchive.mjs";

initDb();
initPdfArchiveStore();

function parsePdfMetaHeader(rawMeta) {
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
      const saved = createPdfArchive(buffer, meta, req.user.email || req.user.name);
      res.status(201).json(saved);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "PDF 저장에 실패했습니다." });
    }
  },
);

app.use(express.json({ limit: "25mb" }));

app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body || {};
  const user = authenticateUser(email, password);
  if (!user) {
    res.status(401).json({ error: "이메일 또는 비밀번호가 맞지 않습니다." });
    return;
  }
  const token = signToken(user);
  res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
});

app.get("/api/auth/me", authMiddleware, (req, res) => {
  res.json({
    user: {
      id: req.user.sub,
      email: req.user.email,
      name: req.user.name,
      role: req.user.role,
    },
  });
});

app.get("/api/users", authMiddleware, adminMiddleware, (_req, res) => {
  res.json({ users: listUsers() });
});

app.get("/api/erp", authMiddleware, (_req, res) => {
  const state = getErpState();
  res.json({
    sales: state.data.sales || [],
    paymentVouchers: state.data.paymentVouchers || [],
    clients: state.data.clients || [],
    workers: state.data.workers || [],
    auditLogs: state.data.auditLogs || [],
    version: state.version,
    updatedAt: state.updatedAt,
    updatedBy: state.updatedBy,
  });
});

app.put("/api/erp", authMiddleware, (req, res) => {
  const { sales, paymentVouchers, clients, workers, auditLogs, version } = req.body || {};
  const payload = {
    sales: Array.isArray(sales) ? sales : [],
    paymentVouchers: Array.isArray(paymentVouchers) ? paymentVouchers : [],
    clients: Array.isArray(clients) ? clients : [],
    workers: Array.isArray(workers) ? workers : [],
    auditLogs: Array.isArray(auditLogs) ? auditLogs : [],
  };

  try {
    const saved = saveErpState(payload, version ?? null, req.user.email || req.user.name);
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

app.delete("/api/pdf-archives/:id", authMiddleware, (req, res) => {
  const deleted = deletePdfArchiveById(req.params.id);
  if (!deleted) {
    res.status(404).json({ error: "PDF를 찾을 수 없습니다." });
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
