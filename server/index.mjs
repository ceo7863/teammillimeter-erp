import { mergeErpPaymentLinkState, mergeWorkerMonthlyPaymentMemosForSave } from "./erpSaveMerge.mjs";
import {
  ERP_DOMAIN_FIELDS,
  ERP_DOMAIN_NAMES,
  mergeErpDomainForSave,
  pickDomainPayload,
  resolveErpDomainName,
} from "./erpDomains.mjs";
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { config } from "./config.mjs";
import {
  initDb,
  getErpState,
  getErpVersionMeta,
  saveErpState,
  saveErpDomain,
  saveErpDomains,
  runErpStartupMigrations,
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
  parseSidebarHidden,
  parseAttendanceViewUserIds,
  recordLoginLog,
} from "./db.mjs";
import { authenticateUser, authMiddleware, adminMiddleware, signToken } from "./auth.mjs";
import {
  authenticateWorkerPortal,
  buildWorkerPortalMonths,
  buildWorkerPortalProbationMeta,
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
import {
  initClientBusinessRegStore,
  getClientBusinessRegMeta,
  getClientBusinessRegFile,
  upsertClientBusinessReg,
  deleteClientBusinessReg,
  enrichClientsWithBusinessRegMeta,
} from "./clientBusinessReg.mjs";
import { buildPdfShareViewerHtml } from "./pdfShareViewer.mjs";
import { renderPdfSharePreviewImages } from "./pdfSharePreview.mjs";
import { buildPdfShareOgMeta } from "./pdfShareOg.mjs";
import { buildClientSiteRequestOgMeta } from "./clientSiteRequestShareOg.mjs";
import { buildClientSiteRequestSharePreviewHtml } from "./clientSiteRequestSharePreview.mjs";
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
import { buildIssuedTaxInvoiceRecord, getTaxInvoiceIssueOptions, registAndIssueTaxInvoice } from "./barobill/taxInvoiceIssue.mjs";
import { fetchBarobillTaxInvoiceDetail } from "./barobill/taxInvoiceDetail.mjs";
import { refreshBarobillTaxInvoiceStates } from "./barobill/taxInvoiceState.mjs";
import { getTaxInvoiceScrapRequestUrl, refreshTaxInvoiceScrap } from "./barobill/taxInvoiceScrap.mjs";
import {
  getBarobillBankSyncStatus,
  runBarobillBankSync,
} from "./barobillBankSync.mjs";
import {
  getBankAccountManagementUrl,
  getBankAccountScrapRequestUrl,
  getBankAccountScrapRegistrationStatus,
  listRegisteredBankAccounts,
  refreshBankAccountScrap,
} from "./barobill/bankAccountScrap.mjs";
import { getBarobillBankConfigStatus } from "./barobill/bankAccountClient.mjs";
import { classifyBankLedgerBatch } from "./bankLedgerClassify.mjs";
import {
  handleErpChat,
  getErpChatHistory,
  getErpChatAudit,
  clearErpChatHistory,
} from "./erpChat.mjs";
import { getChatGuidePdfPath } from "./erpChatGuide.mjs";
import { initErpChatStore } from "./erpChatStore.mjs";
import { buildDailyReport, formatDailyReportMessage, yesterdayDateKey } from "./dailyReport.mjs";
import { collectSystemMetrics } from "./systemMetrics.mjs";
import { collectErpBackupStatus } from "./erpBackupStatus.mjs";
import { restoreErpBackupSnapshot, scheduleErpProcessRestart } from "./erpBackupRestore.mjs";
import { getAlimtalkStatus, sendContractAlimtalk } from "./alimtalkNotify.mjs";
import {
  initClientContractsStore,
  listContracts,
  sanitizeContractForClient,
  getContractById,
  createContract,
  updateContract,
  deleteContract,
  issueSignToken,
  submitContractSignature,
  getPublicSignPayload,
  getContractOriginalFile,
  getContractSignedFile,
  getContractByToken,
  createContractFromTemplate,
  rebuildContractPdf,
  verifyContractPhoneLastFour,
  requireContractPhoneVerified,
} from "./clientContracts.mjs";
import {
  ensureClientSiteRequestLink,
  getPublicClientSiteRequestInfo,
  listClientSiteRequestLinks,
  listClientSiteRequests,
  listPublicClientSiteRequests,
  postPublicClientSiteRequestMessage,
  postStaffClientSiteRequestMessage,
  requestClientSiteRequestCancel,
  rotateClientSiteRequestLink,
  setClientSiteRequestLinkDisabled,
  submitClientSiteRequest,
  updateClientSiteRequestStatus,
} from "./clientSiteRequests.mjs";
import {
  clearScProjectClientMapping,
  getScScheduleSyncStatus,
  listPublicScSchedulesForToken,
  listScProjectMappingStatus,
  listStaffScSchedulesForClient,
  listStaffScSchedulesForMonth,
  runScScheduleSync,
  setScProjectClientMapping,
  startScScheduleSyncScheduler,
} from "./scScheduleSync.mjs";
import { getDefaultPdfContent, listContractTemplates } from "./contractTemplate.mjs";
import { renderContractPdfPreview } from "./contractPdfRender.mjs";
import {
  normalizeNotificationSettings,
  DEFAULT_NOTIFICATION_SETTINGS,
} from "./notificationSettings.mjs";
import { normalizeSaleAiRules } from "./saleAiRules.mjs";
import { notifyNewSaleComments, runCommentNotifyTestJob, runDailyReportJob, startNotificationScheduler } from "./notificationScheduler.mjs";
import {
  buildScScheduleNotifyPreview,
  buildScScheduleNotifyPreviewAsync,
  getScScheduleNotifyStatus,
  runScScheduleNotifyJob,
  sendScScheduleNotifyOne,
} from "./scScheduleNotify.mjs";
import {
  buildScWeeklyBriefingPreviewAsync,
  getScWeeklyBriefingNotifyStatus,
  runScWeeklyBriefingNotifyJob,
  sendScWeeklyBriefingGroup,
} from "./scWeeklyBriefingNotify.mjs";

initDb();
runErpStartupMigrations();
initErpChatStore();
initPdfArchiveStore();
initBoardAttachmentStore();
initClientBusinessRegStore();
initClientContractsStore();
startBankSyncScheduler();
startNotificationScheduler();
startScScheduleSyncScheduler();

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

function parseContractMetaHeader(rawMeta) {
  const text = String(rawMeta);
  try {
    return JSON.parse(text);
  } catch {
    return JSON.parse(decodeURIComponent(text));
  }
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "25mb" }));
app.use("/vendor/pdfjs", express.static(config.pdfJsDir, { maxAge: "7d", fallthrough: false }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "teammillimeter-erp-api" });
});

app.get("/api/system/metrics", authMiddleware, adminMiddleware, async (_req, res) => {
  try {
    const metrics = await collectSystemMetrics();
    res.json({ metrics });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "\uC11C\uBC84 \uC815\uBCF4\uB97C \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4." });
  }
});

app.get("/api/admin/backup-status", authMiddleware, adminMiddleware, (req, res) => {
  try {
    const logTail = Number(req.query.logTail) || 100;
    const status = collectErpBackupStatus({ logTail });
    res.json({ status });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "\uBC31\uC5C5 \uB85C\uADF8\uB97C \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4." });
  }
});

app.post("/api/admin/backup-restore", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const date = String(req.body?.date || "").trim();
    const result = await restoreErpBackupSnapshot(date);
    res.json({ ok: true, result });
    scheduleErpProcessRestart();
  } catch (error) {
    console.error(error);
    res.status(400).json({
      error: error instanceof Error ? error.message : "\uBC31\uC5C5 \uBCF5\uC6D0\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.",
    });
  }
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

app.get("/api/public/client-contracts/sign/:token", (req, res) => {
  const result = getPublicSignPayload(req.params.token);
  if (!result.ok) {
    res.status(result.status || 400).json({ error: result.error });
    return;
  }
  res.json(result.contract);
});

app.post("/api/public/client-contracts/sign/:token/verify-phone", (req, res) => {
  const result = verifyContractPhoneLastFour(req.params.token, req.body?.phoneLast4);
  if (!result.ok) {
    res.status(result.status || 400).json({ error: result.error });
    return;
  }
  res.json({
    phoneVerified: true,
    contactPhoneHint: result.contactPhoneHint,
  });
});

app.get("/api/public/client-contracts/sign/:token/pdf", (req, res) => {
  const contract = getContractByToken(req.params.token);
  if (!contract) {
    res.status(404).send("PDF\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
    return;
  }
  if (contract.status === "signed") {
    res.status(409).send("\uC774\uBBF8 \uC11C\uBA85\uC774 \uC644\uB8CC\uB41C \uACC4\uC57D\uC785\uB2C8\uB2E4.");
    return;
  }
  const phoneGate = requireContractPhoneVerified(req.params.token);
  if (phoneGate) {
    res.status(phoneGate.status || 403).send(phoneGate.error);
    return;
  }
  const file = getContractOriginalFile(contract);
  if (!file) {
    res.status(404).send("PDF\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
    return;
  }
  const encodedName = encodeURIComponent(file.fileName);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodedName}`);
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.sendFile(path.resolve(file.path));
});

app.get("/api/public/client-contracts/sign/:token/signed-pdf", (req, res) => {
  const contract = getContractByToken(req.params.token);
  if (!contract) {
    res.status(404).send("PDF\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
    return;
  }
  if (contract.status !== "signed") {
    res.status(404).send("\uC11C\uBA85\uC774 \uC644\uB8CC\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.");
    return;
  }
  const file = getContractSignedFile(contract);
  if (!file) {
    res.status(404).send("\uC11C\uBA85\uB41C PDF\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
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

function sendContractPreviewResponse(req, res, { pdfPath, cacheKey, fileName }) {
  const page = Math.max(1, Number.parseInt(String(req.query.page || "1"), 10) || 1);
  const result = renderContractPdfPreview({ pdfPath, cacheKey, page });
  if (!result.ok) {
    res.status(result.status || 500).send(result.error);
    return;
  }
  res.setHeader("Content-Type", "image/png");
  res.setHeader("X-Preview-Page", String(result.page));
  res.setHeader("X-Preview-Page-Count", String(result.pageCount));
  res.setHeader("Cache-Control", "private, max-age=3600");
  if (fileName) {
    res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(fileName.replace(/\.pdf$/i, "") + `-p${result.page}.png`)}`);
  }
  res.sendFile(path.resolve(result.path));
}

app.get("/api/public/client-contracts/sign/:token/preview", (req, res) => {
  const contract = getContractByToken(req.params.token);
  if (!contract) {
    res.status(404).send("PDF\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
    return;
  }
  if (contract.status === "signed") {
    res.status(409).send("\uC774\uBBF8 \uC11C\uBA85\uC774 \uC644\uB8CC\uB41C \uACC4\uC57D\uC785\uB2C8\uB2E4.");
    return;
  }
  const phoneGate = requireContractPhoneVerified(req.params.token);
  if (phoneGate) {
    res.status(phoneGate.status || 403).send(phoneGate.error);
    return;
  }
  const file = getContractOriginalFile(contract);
  if (!file) {
    res.status(404).send("PDF\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
    return;
  }
  sendContractPreviewResponse(req, res, {
    pdfPath: file.path,
    cacheKey: contract.id,
    fileName: file.fileName,
  });
});

app.post("/api/public/client-contracts/sign/:token", async (req, res) => {
  try {
    const result = await submitContractSignature(req.params.token, req.body || {});
    if (!result.ok) {
      res.status(result.status || 400).json({ error: result.error });
      return;
    }
    res.json({ contract: result.contract });
  } catch (error) {
    console.error("[client-contracts] public sign failed:", error);
    res.status(500).json({ error: "\uC11C\uBA85 \uC800\uC7A5\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4." });
  }
});

app.get("/api/public/client-site-request/:token", (req, res) => {
  const result = getPublicClientSiteRequestInfo(req.params.token);
  if (!result.ok) {
    res.status(result.status || 400).json({ error: result.error });
    return;
  }
  res.json(result.info);
});

app.post("/api/public/client-site-request/:token", (req, res) => {
  const result = submitClientSiteRequest(req.params.token, req.body || {});
  if (!result.ok) {
    res.status(result.status || 400).json({ error: result.error });
    return;
  }
  res.status(201).json({ request: result.request });
});

app.get("/api/public/client-site-request/:token/requests", (req, res) => {
  const result = listPublicClientSiteRequests(req.params.token);
  if (!result.ok) {
    res.status(result.status || 400).json({ error: result.error });
    return;
  }
  res.json({ requests: result.requests });
});

app.post("/api/public/client-site-request/:token/requests/:requestId/messages", (req, res) => {
  const result = postPublicClientSiteRequestMessage(req.params.token, req.params.requestId, req.body || {});
  if (!result.ok) {
    res.status(result.status || 400).json({ error: result.error });
    return;
  }
  res.status(201).json({ request: { ...result.request, processNote: undefined }, message: result.message });
});

app.post("/api/public/client-site-request/:token/requests/:requestId/cancel", (req, res) => {
  const result = requestClientSiteRequestCancel(req.params.token, req.params.requestId);
  if (!result.ok) {
    res.status(result.status || 400).json({ error: result.error });
    return;
  }
  res.json({ request: result.request });
});

app.get("/api/public/client-site-request/:token/sc-schedules", (req, res) => {
  const monthKey = String(req.query.month || "").trim();
  const result = listPublicScSchedulesForToken(req.params.token, monthKey);
  if (!result.ok) {
    res.status(result.status || 400).json({ error: result.error });
    return;
  }
  res.json({ schedules: result.schedules });
});

app.get("/api/sc-schedules/sync-status", authMiddleware, (_req, res) => {
  res.json(getScScheduleSyncStatus());
});

app.post("/api/sc-schedules/sync", authMiddleware, async (req, res) => {
  const actor = req.user.loginId || req.user.name || req.user.email || "staff";
  try {
    const result = await runScScheduleSync({ updatedBy: `sc-schedule-sync:${actor}` });
    if (!result.ok) {
      res.status(result.skipped ? 409 : 500).json(result);
      return;
    }
    res.json(result);
  } catch (error) {
    console.error("[sc-schedule-sync] manual sync failed:", error);
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});

app.get("/api/sc-schedules/project-mappings", authMiddleware, async (_req, res) => {
  try {
    const result = await listScProjectMappingStatus();
    res.json(result);
  } catch (error) {
    console.error("[sc-schedule-sync] list project mappings failed:", error);
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});

app.put("/api/sc-schedules/project-mappings/:scProjectId", authMiddleware, async (req, res) => {
  const actor = req.user.loginId || req.user.name || req.user.email || "staff";
  const clientId = req.body?.clientId;
  if (clientId == null || clientId === "") {
    res.status(400).json({ ok: false, error: "clientId is required" });
    return;
  }
  try {
    const result = await setScProjectClientMapping(req.params.scProjectId, clientId, actor);
    if (!result.ok) {
      res.status(result.status || 400).json(result);
      return;
    }
    res.json(result);
  } catch (error) {
    console.error("[sc-schedule-sync] set project mapping failed:", error);
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});

app.delete("/api/sc-schedules/project-mappings/:scProjectId", authMiddleware, async (req, res) => {
  const actor = req.user.loginId || req.user.name || req.user.email || "staff";
  try {
    const result = await clearScProjectClientMapping(req.params.scProjectId, actor);
    if (!result.ok) {
      res.status(result.status || 400).json(result);
      return;
    }
    res.json(result);
  } catch (error) {
    console.error("[sc-schedule-sync] clear project mapping failed:", error);
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});

app.get("/api/sc-schedules", authMiddleware, (req, res) => {
  const clientId = req.query.clientId;
  const monthKey = String(req.query.month || "").trim();
  if (!monthKey) {
    res.status(400).json({ error: "month is required" });
    return;
  }
  if (clientId == null || clientId === "") {
    const result = listStaffScSchedulesForMonth(monthKey);
    if (!result.ok) {
      res.status(result.status || 400).json({ error: result.error });
      return;
    }
    res.json({ schedules: result.schedules });
    return;
  }
  const result = listStaffScSchedulesForClient(clientId, monthKey);
  if (!result.ok) {
    res.status(result.status || 400).json({ error: result.error });
    return;
  }
  res.json({
    schedules: result.schedules,
    scProjectId: result.scProjectId,
    scProjectName: result.scProjectName,
  });
});

app.get("/api/client-site-requests", authMiddleware, (req, res) => {
  const rows = listClientSiteRequests({
    status: req.query.status,
    clientId: req.query.clientId,
  });
  res.json(rows);
});

app.patch("/api/client-site-requests/:id", authMiddleware, (req, res) => {
  const actor = req.user.loginId || req.user.name || req.user.email || "";
  const result = updateClientSiteRequestStatus(req.params.id, req.body || {}, actor);
  if (!result.ok) {
    res.status(result.status || 400).json({ error: result.error });
    return;
  }
  res.json({ request: result.request });
});

app.post("/api/client-site-requests/:id/messages", authMiddleware, (req, res) => {
  const actor = req.user.loginId || req.user.name || req.user.email || "";
  const result = postStaffClientSiteRequestMessage(req.params.id, req.body || {}, actor);
  if (!result.ok) {
    res.status(result.status || 400).json({ error: result.error });
    return;
  }
  res.status(201).json({ request: result.request, message: result.message });
});

app.get("/api/client-site-request-links", authMiddleware, (_req, res) => {
  res.json(listClientSiteRequestLinks());
});

app.post("/api/clients/:clientId/site-request-link", authMiddleware, (req, res) => {
  const actor = req.user.loginId || req.user.name || req.user.email || "";
  const result = ensureClientSiteRequestLink(req.params.clientId, actor);
  if (!result.ok) {
    res.status(result.status || 400).json({ error: result.error });
    return;
  }
  res.json({ ...result, pendingCount: 0 });
});

app.post("/api/clients/:clientId/site-request-link/rotate", authMiddleware, (req, res) => {
  const actor = req.user.loginId || req.user.name || req.user.email || "";
  const result = rotateClientSiteRequestLink(req.params.clientId, actor);
  if (!result.ok) {
    res.status(result.status || 400).json({ error: result.error });
    return;
  }
  res.json({ ...result, pendingCount: 0 });
});

app.patch("/api/clients/:clientId/site-request-link/disabled", authMiddleware, (req, res) => {
  const actor = req.user.loginId || req.user.name || req.user.email || "";
  const result = setClientSiteRequestLinkDisabled(req.params.clientId, Boolean(req.body?.disabled), actor);
  if (!result.ok) {
    res.status(result.status || 400).json({ error: result.error });
    return;
  }
  const pendingCount =
    listClientSiteRequests({ status: "pending", clientId: req.params.clientId }).length || 0;
  res.json({ ...result, pendingCount });
});

app.post(
  "/api/client-contracts",
  authMiddleware,
  express.raw({ type: "application/pdf", limit: "25mb" }),
  (req, res) => {
    try {
      const rawMeta = req.headers["x-contract-meta"];
      if (!rawMeta) {
        res.status(400).json({ error: "PDF \uBA54\uD0C0\uB370\uC774\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4." });
        return;
      }
      const meta = parseContractMetaHeader(rawMeta);
      const buffer = Buffer.from(req.body || []);
      const result = createContract(buffer, meta, req.user.loginId || req.user.name || req.user.email);
      if (!result.ok) {
        res.status(result.status || 400).json({ error: result.error });
        return;
      }
      res.status(201).json(result.contract);
    } catch (error) {
      console.error("[client-contracts] upload failed:", error);
      res.status(500).json({ error: "PDF \uC5C5\uB85C\uB4DC\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4." });
    }
  },
);

app.post(
  "/api/clients/:clientId/business-reg",
  authMiddleware,
  express.raw({ type: () => true, limit: "20mb" }),
  (req, res) => {
    try {
      const rawMeta = req.headers["x-business-reg-meta"];
      if (!rawMeta) {
        res.status(400).json({ error: "\uC0AC\uC5C5\uC790\uB4F1\uB85D\uC99D \uBA54\uD0C0\uB370\uC774\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4." });
        return;
      }
      const meta = parseAttachmentMetaHeader(rawMeta);
      const buffer = Buffer.from(req.body || []);
      const result = upsertClientBusinessReg(
        req.params.clientId,
        buffer,
        meta,
        req.user.loginId || req.user.name || req.user.email,
      );
      if (!result.ok) {
        res.status(result.status || 400).json({ error: result.error });
        return;
      }
      res.status(result.meta?.createdAt === result.meta?.updatedAt ? 201 : 200).json(result.meta);
    } catch (error) {
      console.error("[client-business-reg] upload failed:", error);
      res.status(500).json({ error: "\uC0AC\uC5C5\uC790\uB4F1\uB85D\uC99D \uC800\uC7A5\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4." });
    }
  },
);

app.get("/api/clients/:clientId/business-reg/meta", authMiddleware, (req, res) => {
  const meta = getClientBusinessRegMeta(req.params.clientId);
  if (!meta) {
    res.status(404).json({ error: "\uC0AC\uC5C5\uC790\uB4F1\uB85D\uC99D\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." });
    return;
  }
  res.json(meta);
});

app.get("/api/clients/:clientId/business-reg/file", authMiddleware, (req, res) => {
  const file = getClientBusinessRegFile(req.params.clientId);
  if (!file) {
    res.status(404).json({ error: "\uC0AC\uC5C5\uC790\uB4F1\uB85D\uC99D\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    return;
  }
  res.setHeader("Content-Type", file.mimeType || "application/octet-stream");
  res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`);
  res.sendFile(path.resolve(file.path));
});

app.delete("/api/clients/:clientId/business-reg", authMiddleware, (req, res) => {
  try {
    const result = deleteClientBusinessReg(req.params.clientId);
    if (!result.ok) {
      res.status(result.status || 400).json({ error: result.error });
      return;
    }
    res.json({ ok: true });
  } catch (error) {
    console.error("[client-business-reg] delete failed:", error);
    res.status(500).json({ error: "\uC0AC\uC5C5\uC790\uB4F1\uB85D\uC99D \uC0AD\uC81C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4." });
  }
});

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
  const probation = buildWorkerPortalProbationMeta(req.workerPortal.workerName, workers);
  res.json({ months, workerName: req.workerPortal.workerName, ...probation });
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
      sidebarHidden: user.sidebarHidden,
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
    sidebarHidden: parseSidebarHidden(row.sidebar_hidden),
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
        sidebarHidden: user.sidebarHidden,
        attendanceViewUserIds: user.attendanceViewUserIds,
      },
    });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || "내 정보 수정에 실패했습니다." });
  }
});

app.patch("/api/auth/me/sidebar-order", authMiddleware, (req, res) => {
  try {
    const body = req.body || {};
    const user = updateSelfSidebarOrder(
      req.user.sub,
      body.sidebarOrder !== undefined ? body.sidebarOrder : undefined,
      body.sidebarHidden !== undefined ? body.sidebarHidden : undefined,
    );
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
        sidebarHidden: user.sidebarHidden,
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

function buildErpApiResponse(state, workersOverride = null, workerMonthlyPaymentMemosOverride = null) {
  const data = state.data || {};
  const workers = workersOverride ?? data.workers ?? [];
  const workerMonthlyPaymentMemos =
    workerMonthlyPaymentMemosOverride ?? data.workerMonthlyPaymentMemos ?? {};
  return {
    sales: data.sales || [],
    paymentVouchers: data.paymentVouchers || [],
    paymentInputLogs: data.paymentInputLogs || [],
    clients: enrichClientsWithBusinessRegMeta(data.clients || []),
    workers: sanitizeWorkersForClient(workers),
    workerMonthlyPaymentMemos,
    auditLogs: data.auditLogs || [],
    loginLogs: data.loginLogs || [],
    workerPortalStatementAcks: data.workerPortalStatementAcks || [],
    workerPaymentRecords: data.workerPaymentRecords || [],
    workerPayoutVouchers: data.workerPayoutVouchers || [],
    workerMonthlyActualVouchers: data.workerMonthlyActualVouchers || [],
    workerPayWithVatLearnRules: data.workerPayWithVatLearnRules || [],
    companyExpenses: data.companyExpenses || [],
    attendanceRecords: data.attendanceRecords || [],
    fixedExpenses: data.fixedExpenses || [],
    fixedExpensePayments: data.fixedExpensePayments || [],
    bankLedgerRules: data.bankLedgerRules || [],
    expenseCategories: data.expenseCategories || [],
    fixedExpenseCategories: data.fixedExpenseCategories || [],
    accountCodes: data.accountCodes || [],
    ledgerCategories: data.ledgerCategories || [],
    taxInvoices: data.taxInvoices || [],
    bankTransactions: data.bankTransactions || [],
    bankTransactionFolders: data.bankTransactionFolders || [],
    companyNotices: data.companyNotices || [],
    workPosts: data.workPosts || [],
    saleComments: data.saleComments || [],
    statementGenerationLogs: data.statementGenerationLogs || [],
    statementFolders: data.statementFolders || [],
    companyProfile: data.companyProfile || null,
    notificationSettings: normalizeNotificationSettings(data.notificationSettings),
    saleAiRules: normalizeSaleAiRules(data.saleAiRules),
    version: state.version,
    updatedAt: state.updatedAt,
    updatedBy: state.updatedBy,
  };
}

function finalizeWorkersDomainPayload(existingData, mergedData) {
  const existingWorkers = existingData?.workers || [];
  const mergedPayload = mergeErpPaymentLinkState(existingData || {}, mergedData || {});
  mergedPayload.workers = stripMonthlyPaymentMemoFromWorkers(
    processWorkersPortalCredentials(mergedPayload.workers || [], existingWorkers),
  );
  return mergedPayload;
}

function appendTaxInvoiceWithVersionRetry(taxInvoice, expectedVersion, updatedBy) {
  let version = expectedVersion;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const state = getErpState();
    const existing = Array.isArray(state.data?.taxInvoices) ? state.data.taxInvoices : [];
    const nextTaxInvoices = [taxInvoice, ...existing];
    try {
      const saved = saveErpDomain(
        "taxInvoices",
        { taxInvoices: nextTaxInvoices },
        version ?? state.version,
        updatedBy,
      );
      return {
        taxInvoices: nextTaxInvoices,
        version: saved.version,
        updatedAt: saved.updatedAt,
      };
    } catch (error) {
      if (error?.status === 409 && attempt < 3) {
        version = error.currentVersion ?? getErpState().version;
        continue;
      }
      throw error;
    }
  }
  const err = new Error("VERSION_CONFLICT");
  err.status = 409;
  err.currentVersion = getErpState().version;
  throw err;
}

function handleErpSaveConflict(res, error) {
  if (error.status === 409) {
    res.status(409).json({
      error: "다른 사용자가 먼저 저장했습니다. 새로고침 후 다시 시도해 주세요.",
      currentVersion: error.currentVersion,
    });
    return true;
  }
  return false;
}

app.get("/api/erp/version", authMiddleware, (_req, res) => {
  res.json(getErpVersionMeta());
});

app.get("/api/erp/domains", authMiddleware, (req, res) => {
  const raw = String(req.query.domains || "").trim();
  const requested = raw
    ? raw
        .split(",")
        .map((name) => resolveErpDomainName(name.trim()))
        .filter(Boolean)
    : ERP_DOMAIN_NAMES;
  const unique = [...new Set(requested)];
  const state = getErpState(unique);
  const body = buildErpApiResponse(state);
  const filtered = { version: body.version, updatedAt: body.updatedAt, updatedBy: body.updatedBy };
  for (const domain of unique) {
    for (const field of ERP_DOMAIN_FIELDS[domain] || []) {
      if (Object.prototype.hasOwnProperty.call(body, field)) {
        filtered[field] = body[field];
      }
    }
  }
  res.json(filtered);
});

app.get("/api/erp", authMiddleware, (_req, res) => {
  const state = getErpState();
  const { workerMonthlyPaymentMemos, workers } = ensureWorkerMonthlyPaymentMemos(state.data || {});
  res.json(buildErpApiResponse(state, workers, workerMonthlyPaymentMemos));
});

app.post("/api/bank/classify-ledger", authMiddleware, async (req, res) => {
  try {
    const result = await classifyBankLedgerBatch(req.body || {});
    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "\uBD84\uB958\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.",
      items: [],
      engine: "error",
    });
  }
});

app.post("/api/erp/chat", authMiddleware, async (req, res) => {
  try {
    const result = await handleErpChat({
      messages: req.body?.messages,
      user: req.user,
    });
    if (!result.ok) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : "AI \uCC57\uBD07 \uC751\uB2F5\uC5D0 \uC2E4\uD328\uD788\uC2B5\uB2C8\uB2E4.",
    });
  }
});

app.get("/api/erp/chat/history", authMiddleware, (req, res) => {
  const limit = Number(req.query.limit || 30);
  res.json({ logs: getErpChatHistory(req.user, limit) });
});

app.delete("/api/erp/chat/history", authMiddleware, (req, res) => {
  res.json(clearErpChatHistory(req.user));
});

app.get("/api/erp/chat/audit", authMiddleware, adminMiddleware, (req, res) => {
  const limit = Number(req.query.limit || 100);
  res.json({ logs: getErpChatAudit(limit) });
});

app.get("/api/erp/chat/guide-pdf", authMiddleware, (_req, res) => {
  const filePath = getChatGuidePdfPath();
  if (!filePath) {
    res.status(404).json({ ok: false, error: "\uC0AC\uC6A9 \uAC00\uC774\uB4DC PDF\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    return;
  }
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", 'inline; filename="ERP-AI-Chat-Guide.pdf"');
  res.sendFile(filePath);
});

app.get("/api/erp/bank-transactions", authMiddleware, (_req, res) => {
  const state = getErpState();
  res.json({
    version: state.version,
    updatedAt: state.updatedAt,
    bankTransactions: state.data.bankTransactions || [],
    bankTransactionFolders: state.data.bankTransactionFolders || [],
    bankSyncMeta: state.data.bankSyncMeta || null,
  });
});

app.get("/api/erp/bank-sync", authMiddleware, (req, res) => {
  const sinceVersion = Number(req.query.sinceVersion || 0);
  const localCount = Number(req.query.localCount ?? -1);
  const localLatestAt = String(req.query.localLatestAt || "").trim();
  const localImportAt = String(req.query.localImportAt || "").trim();
  const state = getErpState();
  const transactions = state.data.bankTransactions || [];
  const transactionCount = transactions.length;
  const countChanged = localCount >= 0 && localCount !== transactionCount;
  const serverLatestAt = String(state.data.bankSyncMeta?.lastImportLatestAt || "").trim();
  const serverImportAt = String(state.data.bankSyncMeta?.lastImportAt || "").trim();
  const importChanged = Boolean(
    serverLatestAt && (!localLatestAt || serverLatestAt.localeCompare(localLatestAt) > 0),
  );
  const importRunChanged = Boolean(serverImportAt && serverImportAt !== localImportAt);
  const bankDataChanged = countChanged || importChanged || importRunChanged;
  res.json({
    version: state.version,
    updatedAt: state.updatedAt,
    updatedBy: state.updatedBy,
    changed: bankDataChanged,
    bankTransactionCount: transactionCount,
    bankTransactions: bankDataChanged ? transactions : undefined,
    bankTransactionFolders: bankDataChanged ? state.data.bankTransactionFolders || [] : undefined,
    bankSyncMeta: state.data.bankSyncMeta || null,
    liveSyncStatus: getBankSyncStatus(),
    openBankingStatus: getOpenBankingSyncStatus(),
    barobillBankStatus: getBarobillBankSyncStatus(),
  });
});

app.post("/api/bank-sync/run", authMiddleware, async (req, res) => {
  const actor = req.user.loginId || req.user.name || req.user.email || "manual-sync";
  const requestRefresh = req.body?.refresh === true;
  const result = await runUnifiedBankSync({
    updatedBy: actor,
    forceMetaUpdate: true,
    requestRefresh,
  });
  if (!result.ok && result.error) {
    res.status(500).json({
      error: result.error,
      liveSyncStatus: getBankSyncStatus(),
      openBankingStatus: getOpenBankingSyncStatus(),
      barobillBankStatus: getBarobillBankSyncStatus(),
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
    barobillBankStatus: getBarobillBankSyncStatus(),
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

    const nextTaxInvoices = result.taxInvoices;
    const saved = saveErpState(
      { ...(state.data || {}), taxInvoices: nextTaxInvoices },
      req.body?.version ?? state.version,
      req.user.loginId || req.user.name || req.user.email,
    );

    res.json({
      ok: true,
      apply: true,
      added: result.added,
      skipped: result.skipped,
      preview: result.preview,
      taxInvoices: nextTaxInvoices,
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

app.get("/api/barobill/tax-invoices/copy-data", authMiddleware, async (req, res) => {
  const mgtKey = String(req.query?.mgtKey || "").trim();
  if (!mgtKey) {
    res.status(400).json({ error: "MgtKey가 필요합니다." });
    return;
  }

  const configStatus = getBarobillConfigStatus();
  if (!configStatus.configured) {
    res.status(400).json({ error: "바로빌 인증키(CERTKEY)와 사업자번호가 설정되지 않았습니다." });
    return;
  }

  try {
    const detail = await fetchBarobillTaxInvoiceDetail(mgtKey);
    res.json(detail);
  } catch (error) {
    const errCode = error && typeof error === "object" && "errCode" in error ? error.errCode : undefined;
    res.status(500).json({
      error: error instanceof Error ? error.message : String(error),
      errCode,
    });
  }
});

function extractBarobillMgtKeyFromMemo(memo) {
  const match = String(memo || "").match(/MgtKey:\s*([^\s·]+)/i);
  return match?.[1]?.trim() || "";
}

function resolveBarobillMgtKeyFromInvoice(row) {
  return String(row?.barobillMgtKey || "").trim() || extractBarobillMgtKeyFromMemo(row?.memo);
}

function applyBarobillStatusPatches(existing, mgtKeyByInvoiceId, refreshedByMgtKey) {
  const now = new Date().toISOString();
  const targetIds = new Set(mgtKeyByInvoiceId.keys());
  let updated = 0;
  const nextTaxInvoices = existing.map((row) => {
    if (!targetIds.has(String(row.id))) return row;
    const mgtKey = mgtKeyByInvoiceId.get(String(row.id));
    const detail = refreshedByMgtKey.get(mgtKey);
    if (!detail) return row;
    updated += 1;
    return {
      ...row,
      barobillMgtKey: mgtKey,
      barobillState: detail.barobillState,
      barobillNtsSendState: detail.ntsSendState,
      invoiceNo: detail.ntsSendKey || row.invoiceNo,
      barobillStatusCheckedAt: now,
    };
  });
  return { nextTaxInvoices, updated };
}

function saveBarobillTaxInvoiceStatusRefresh({ mgtKeyByInvoiceId, refreshedByMgtKey, expectedVersion, updatedBy }) {
  let version = expectedVersion;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const state = getErpState();
    const existing = Array.isArray(state.data?.taxInvoices) ? state.data.taxInvoices : [];
    const { nextTaxInvoices, updated } = applyBarobillStatusPatches(existing, mgtKeyByInvoiceId, refreshedByMgtKey);
    try {
      const saved = saveErpState(
        { ...(state.data || {}), taxInvoices: nextTaxInvoices },
        version ?? state.version,
        updatedBy,
      );
      return {
        nextTaxInvoices,
        updated,
        version: saved.version,
        updatedAt: saved.updatedAt,
      };
    } catch (error) {
      if (error?.status === 409 && attempt < 3) {
        version = error.currentVersion ?? getErpState().version;
        continue;
      }
      throw error;
    }
  }
  const err = new Error("VERSION_CONFLICT");
  err.status = 409;
  err.currentVersion = getErpState().version;
  throw err;
}

app.post("/api/barobill/tax-invoices/refresh-states", authMiddleware, adminMiddleware, async (req, res) => {
  const configStatus = getBarobillConfigStatus();
  if (!configStatus.configured) {
    res.status(400).json({ error: "바로빌 인증키(CERTKEY)와 사업자번호가 설정되지 않았습니다." });
    return;
  }
  if (!configStatus.hasUserId) {
    res.status(400).json({ error: "바로빌 사용자 ID(BAROBILL_USER_ID)가 설정되지 않았습니다." });
    return;
  }

  const invoiceIds = Array.isArray(req.body?.invoiceIds)
    ? req.body.invoiceIds.map((value) => String(value || "").trim()).filter(Boolean)
    : [];
  const limit = Math.min(Math.max(Number(req.body?.limit) || 40, 1), 100);

  const state = getErpState();
  const existing = Array.isArray(state.data?.taxInvoices) ? state.data.taxInvoices : [];
  const targetPool = invoiceIds.length
    ? existing.filter((row) => invoiceIds.includes(String(row.id || "")))
    : existing.filter(
        (row) =>
          row?.flowType === "sales" &&
          row?.status === "issued" &&
          resolveBarobillMgtKeyFromInvoice(row),
      );

  const targets = targetPool.slice(0, limit);
  const mgtKeyByInvoiceId = new Map();
  for (const row of targets) {
    const mgtKey = resolveBarobillMgtKeyFromInvoice(row);
    if (mgtKey) mgtKeyByInvoiceId.set(String(row.id), mgtKey);
  }

  if (mgtKeyByInvoiceId.size === 0) {
    res.json({
      ok: true,
      updated: 0,
      checked: 0,
      taxInvoices: existing,
      version: state.version,
      updatedAt: state.updatedAt,
    });
    return;
  }

  try {
    const refreshed = await refreshBarobillTaxInvoiceStates([...new Set(mgtKeyByInvoiceId.values())]);
    const refreshedByMgtKey = new Map(refreshed.filter((row) => row.ok).map((row) => [row.mgtKey, row]));
    const updatedBy = req.user.loginId || req.user.name || req.user.email;
    const saved = saveBarobillTaxInvoiceStatusRefresh({
      mgtKeyByInvoiceId,
      refreshedByMgtKey,
      expectedVersion: req.body?.version,
      updatedBy,
    });

    res.json({
      ok: true,
      updated: saved.updated,
      checked: mgtKeyByInvoiceId.size,
      failed: refreshed.filter((row) => !row.ok).length,
      taxInvoices: saved.nextTaxInvoices,
      version: saved.version,
      updatedAt: saved.updatedAt,
    });
  } catch (error) {
    if (handleErpSaveConflict(res, error)) return;
    res.status(500).json({
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

app.get("/api/barobill/tax-invoices/issue-options", authMiddleware, adminMiddleware, async (req, res) => {
  const configStatus = getBarobillConfigStatus();
  if (!configStatus.configured) {
    res.status(400).json({ error: "바로빌 인증키(CERTKEY)와 사업자번호가 설정되지 않았습니다." });
    return;
  }

  try {
    const documentType = req.query?.documentType === "bill" ? "bill" : "tax";
    const options = await getTaxInvoiceIssueOptions(documentType);
    res.json(options);
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
      ntsSendOption: Number(req.body?.ntsSendOption) || undefined,
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

    const updatedBy = req.user.loginId || req.user.name || req.user.email;
    const saved = appendTaxInvoiceWithVersionRetry(taxInvoice, req.body?.version, updatedBy);

    res.json({
      ...issueResult,
      taxInvoice,
      taxInvoices: saved.taxInvoices,
      version: saved.version,
      updatedAt: saved.updatedAt,
    });
  } catch (error) {
    const errCode = error && typeof error === "object" && "errCode" in error ? error.errCode : undefined;
    const isValidation = error && typeof error === "object" && "validation" in error && error.validation;
    if (handleErpSaveConflict(res, error)) return;
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

app.get("/api/barobill/bank/status", authMiddleware, (_req, res) => {
  res.json({ status: getBarobillBankSyncStatus(), config: getBarobillBankConfigStatus() });
});

app.get("/api/barobill/bank/scrap-status", authMiddleware, adminMiddleware, async (_req, res) => {
  try {
    const result = await getBankAccountScrapRegistrationStatus();
    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

app.get("/api/barobill/bank/scrap-request-url", authMiddleware, adminMiddleware, async (_req, res) => {
  try {
    const url = await getBankAccountScrapRequestUrl();
    res.json({ ok: true, url });
  } catch (error) {
    const errCode = error && typeof error === "object" && "errCode" in error ? error.errCode : undefined;
    res.status(500).json({
      error: error instanceof Error ? error.message : String(error),
      errCode,
    });
  }
});

app.get("/api/barobill/bank/management-url", authMiddleware, adminMiddleware, async (_req, res) => {
  try {
    const url = await getBankAccountManagementUrl();
    res.json({ ok: true, url });
  } catch (error) {
    const errCode = error && typeof error === "object" && "errCode" in error ? error.errCode : undefined;
    res.status(500).json({
      error: error instanceof Error ? error.message : String(error),
      errCode,
    });
  }
});

app.get("/api/barobill/bank/accounts", authMiddleware, adminMiddleware, async (_req, res) => {
  try {
    const accounts = await listRegisteredBankAccounts();
    res.json({ ok: true, accounts });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

app.post("/api/barobill/bank/sync", authMiddleware, async (req, res) => {
  const actor = req.user.loginId || req.user.name || req.user.email || "barobill-bank-manual";
  const startDate = String(req.body?.startDate || "").trim() || undefined;
  const endDate = String(req.body?.endDate || "").trim() || undefined;
  const syncDays = req.body?.syncDays !== undefined ? Number(req.body.syncDays) : undefined;
  const previewOnly = Boolean(req.body?.previewOnly);
  const requestRefresh = Boolean(req.body?.refresh);

  const cfg = getBarobillBankConfigStatus();
  if (!cfg.configured) {
    res.status(400).json({
      error: "\uBC14\uB85C\uBE4C \uACC4\uC88C \uC870\uD68C\uC758 CERTKEY, CORP_NUM, USER_ID, BANK_ACCOUNT_NUM \uC774 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.",
    });
    return;
  }

  if (startDate && endDate && startDate > endDate) {
    res.status(400).json({ error: "\uC2DC\uC791\uC77C\uC774 \uC885\uB8CC\uC77C\uBCF4\uB2E4 \uB290\uB824 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    return;
  }

  const state = getErpState();
  const existing = Array.isArray(state.data?.bankTransactions) ? state.data.bankTransactions : [];

  try {
    const result = await runBarobillBankSync({
      updatedBy: actor,
      forceMetaUpdate: !previewOnly,
      previewOnly,
      existing,
      startDate,
      endDate,
      syncDays,
      requestRefresh,
    });

    if (!result.ok && result.error) {
      res.status(500).json({ ...result, status: getBarobillBankSyncStatus() });
      return;
    }

    if (previewOnly) {
      res.json({ ...result, status: getBarobillBankSyncStatus() });
      return;
    }

    const saved = getErpState();
    res.json({
      ...result,
      version: saved.version,
      updatedAt: saved.updatedAt,
      bankTransactionCount: Array.isArray(saved.data.bankTransactions) ? saved.data.bankTransactions.length : 0,
      bankTransactions: saved.data.bankTransactions || [],
      bankTransactionFolders: saved.data.bankTransactionFolders || [],
      bankSyncMeta: saved.data.bankSyncMeta || null,
      status: getBarobillBankSyncStatus(),
    });
  } catch (error) {
    const errCode = error && typeof error === "object" && "errCode" in error ? error.errCode : undefined;
    res.status(500).json({
      error: error instanceof Error ? error.message : String(error),
      errCode,
      status: getBarobillBankSyncStatus(),
    });
  }
});

app.get("/api/bank-sync/status", authMiddleware, (_req, res) => {
  const state = getErpState();
  res.json({
    liveSyncStatus: getBankSyncStatus(),
    openBankingStatus: getOpenBankingSyncStatus(),
    barobillBankStatus: getBarobillBankSyncStatus(),
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

app.patch("/api/erp/domains", authMiddleware, async (req, res) => {
  const { expectedVersion, domains } = req.body || {};
  if (!domains || typeof domains !== "object" || Array.isArray(domains)) {
    res.status(400).json({ error: "domains 객체가 필요합니다." });
    return;
  }

  const domainNames = Object.keys(domains).filter((name) => ERP_DOMAIN_FIELDS[name]);
  if (!domainNames.length) {
    res.status(400).json({ error: "저장할 도메인이 없습니다." });
    return;
  }

  const state = getErpState();
  let merged = state.data || {};
  for (const domain of domainNames) {
    merged = mergeErpDomainForSave(merged, domain, domains[domain]);
  }

  if (domainNames.includes("workers") || domainNames.includes("bankTransactions")) {
    merged = finalizeWorkersDomainPayload(state.data || {}, merged);
  }

  const domainPayloads = {};
  for (const domain of domainNames) {
    domainPayloads[domain] = pickDomainPayload(merged, domain);
  }

  const actor = req.user.loginId || req.user.name || req.user.email;
  try {
    const saved = await saveErpDomains(domainPayloads, expectedVersion ?? state.version, actor);
    if (domainNames.includes("sales") && Array.isArray(merged.saleComments)) {
      const previousSaleComments = Array.isArray(state.data?.saleComments) ? state.data.saleComments : [];
      void notifyNewSaleComments(previousSaleComments, merged.saleComments, merged).catch((error) => {
        console.error("[notify] comment alimtalk failed:", error);
      });
    }
    res.json({ ok: true, version: saved.version, updatedAt: saved.updatedAt, domains: saved.domains });
  } catch (error) {
    if (handleErpSaveConflict(res, error)) return;
    console.error(error);
    res.status(500).json({ error: "저장에 실패했습니다." });
  }
});

app.patch("/api/erp/:domain", authMiddleware, async (req, res) => {
  const domain = resolveErpDomainName(req.params.domain);
  if (!domain) {
    res.status(404).json({ error: "알 수 없는 ERP 도메인입니다." });
    return;
  }

  const { expectedVersion, data } = req.body || {};
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    res.status(400).json({ error: "data 객체가 필요합니다." });
    return;
  }

  const state = getErpState();
  let merged = mergeErpDomainForSave(state.data || {}, domain, data);
  if (domain === "workers" || domain === "bankTransactions") {
    merged = finalizeWorkersDomainPayload(state.data || {}, merged);
  }

  const actor = req.user.loginId || req.user.name || req.user.email;
  try {
    const saved = await saveErpDomain(domain, pickDomainPayload(merged, domain), expectedVersion ?? state.version, actor);
    if (domain === "sales" && Array.isArray(merged.saleComments)) {
      const previousSaleComments = Array.isArray(state.data?.saleComments) ? state.data.saleComments : [];
      void notifyNewSaleComments(previousSaleComments, merged.saleComments, merged).catch((error) => {
        console.error("[notify] comment alimtalk failed:", error);
      });
    }
    res.json({ ok: true, version: saved.version, updatedAt: saved.updatedAt, domain: saved.domain });
  } catch (error) {
    if (handleErpSaveConflict(res, error)) return;
    console.error(error);
    res.status(500).json({ error: "저장에 실패했습니다." });
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
    accountCodes,
    ledgerCategories,
    companyNotices,
    workPosts,
    saleComments,
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
  const previousSaleComments = Array.isArray(existing.data?.saleComments) ? existing.data.saleComments : [];
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
    accountCodes: Array.isArray(accountCodes) ? accountCodes : existing.data.accountCodes || [],
    ledgerCategories: Array.isArray(ledgerCategories)
      ? ledgerCategories
      : existing.data.ledgerCategories || [],
    companyNotices: Array.isArray(companyNotices) ? companyNotices : existing.data.companyNotices || [],
    workPosts: Array.isArray(workPosts) ? workPosts : existing.data.workPosts || [],
    saleComments: Array.isArray(saleComments) ? saleComments : existing.data.saleComments || [],
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
    notificationSettings: existing.data.notificationSettings || DEFAULT_NOTIFICATION_SETTINGS,
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
    void notifyNewSaleComments(previousSaleComments, mergedPayload.saleComments, mergedPayload).catch((error) => {
      console.error("[notify] comment alimtalk failed:", error);
    });
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

app.get("/api/notifications/status", authMiddleware, adminMiddleware, (_req, res) => {
  res.json({ alimtalk: getAlimtalkStatus(), scScheduleNotify: getScScheduleNotifyStatus(), scWeeklyBriefing: getScWeeklyBriefingNotifyStatus() });
});

app.get("/api/notifications/settings", authMiddleware, adminMiddleware, (_req, res) => {
  const state = getErpState();
  res.json({ settings: normalizeNotificationSettings(state.data?.notificationSettings) });
});

app.patch("/api/notifications/settings", authMiddleware, adminMiddleware, (req, res) => {
  const state = getErpState();
  const next = normalizeNotificationSettings({
    ...normalizeNotificationSettings(state.data?.notificationSettings),
    ...(req.body?.settings && typeof req.body.settings === "object" ? req.body.settings : req.body),
  });
  try {
    const saved = saveErpState(
      { ...(state.data || {}), notificationSettings: next },
      req.body?.version ?? state.version,
      req.user.loginId || req.user.name || req.user.email,
    );
    res.json({ ok: true, settings: next, version: saved.version, updatedAt: saved.updatedAt });
  } catch (error) {
    if (error.status === 409) {
      res.status(409).json({
        error: "다른 사용자가 먼저 저장했습니다. 새로고침 후 다시 시도해 주세요.",
        currentVersion: error.currentVersion,
      });
      return;
    }
    console.error(error);
    res.status(500).json({ error: "알림 설정 저장에 실패했습니다." });
  }
});

app.get("/api/notifications/daily-report/preview", authMiddleware, adminMiddleware, (_req, res) => {
  const state = getErpState();
  const report = buildDailyReport(state.data || {});
  res.json({
    report,
    message: formatDailyReportMessage(report, config.alimtalk.erpBaseUrl),
  });
});

app.post("/api/notifications/daily-report/send", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const result = await runDailyReportJob({
      skipSync: Boolean(req.body?.skipSync),
      force: true,
      settingsOverride: req.body?.settings,
    });
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error instanceof Error ? error.message : "일일 보고 발송에 실패했습니다." });
  }
});

app.post("/api/notifications/comment/send-test", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const result = await runCommentNotifyTestJob({ settingsOverride: req.body?.settings });
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error instanceof Error ? error.message : "댓글 알림 테스트 발송에 실패했습니다." });
  }
});

app.get("/api/notifications/sc-schedule/preview", authMiddleware, async (_req, res) => {
  try {
    const state = getErpState();
    const preview = await buildScScheduleNotifyPreviewAsync(state.data || {});
    res.json(preview);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error instanceof Error ? error.message : "SC 일정 미리보기에 실패했습니다." });
  }
});

app.post("/api/notifications/sc-schedule/send", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const result = await runScScheduleNotifyJob({
      force: true,
      skipSync: Boolean(req.body?.skipSync),
      targetDate: req.body?.targetDate ? String(req.body.targetDate).slice(0, 10) : undefined,
      settingsOverride: req.body?.settings,
    });
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error instanceof Error ? error.message : "SC 일정 알림 발송에 실패했습니다." });
  }
});

app.post("/api/notifications/sc-schedule/send-one", authMiddleware, async (req, res) => {
  try {
    const scheduleId = String(req.body?.scheduleId || "").trim();
    if (!scheduleId) {
      res.status(400).json({ error: "scheduleId\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4." });
      return;
    }
    const result = await sendScScheduleNotifyOne(scheduleId, {
      skipSync: Boolean(req.body?.skipSync),
      phones: Array.isArray(req.body?.phones) ? req.body.phones : undefined,
      recipientTypes: Array.isArray(req.body?.recipientTypes) ? req.body.recipientTypes : undefined,
      updatedBy: req.user.loginId || req.user.name || req.user.email || "sc-schedule-send-one",
    });
    if (result.notFound) {
      res.status(404).json(result);
      return;
    }
    if (!result.ok && result.error && !result.skipped) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error instanceof Error ? error.message : "SC \uC77C\uC815 \uC54C\uB9BC \uBC1C\uC1A1\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4." });
  }
});

app.get("/api/notifications/sc-weekly-briefing/preview", authMiddleware, async (req, res) => {
  try {
    const weekStart = req.query?.weekStart ? String(req.query.weekStart).slice(0, 10) : undefined;
    const preview = await buildScWeeklyBriefingPreviewAsync({ weekStart });
    res.json(preview);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error instanceof Error ? error.message : "\uC8FC\uAC04 \uD604\uC7A5 \uBE0C\uB9AC\uD551 \uBBF8\uB9AC\uBCF4\uAE30\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4." });
  }
});

app.post("/api/notifications/sc-weekly-briefing/send", authMiddleware, async (req, res) => {
  try {
    const groupKey = String(req.body?.groupKey || "").trim();
    if (!groupKey) {
      res.status(400).json({ error: "groupKey\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4." });
      return;
    }
    const result = await sendScWeeklyBriefingGroup(groupKey, {
      weekStart: req.body?.weekStart ? String(req.body.weekStart).slice(0, 10) : undefined,
      weekEnd: req.body?.weekEnd ? String(req.body.weekEnd).slice(0, 10) : undefined,
      skipSync: Boolean(req.body?.skipSync),
      phones: Array.isArray(req.body?.phones) ? req.body.phones : undefined,
      updatedBy: req.user.loginId || req.user.name || req.user.email || "sc-weekly-briefing-send",
    });
    if (result.notFound) {
      res.status(404).json(result);
      return;
    }
    if (!result.ok && result.error && !result.skipped) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error instanceof Error ? error.message : "\uC8FC\uAC04 \uD604\uC7A5 \uBE0C\uB9AC\uD551 \uBC1C\uC1A1\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4." });
  }
});

app.post("/api/notifications/sc-weekly-briefing/send-all", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const result = await runScWeeklyBriefingNotifyJob({
      force: true,
      skipSync: Boolean(req.body?.skipSync),
      weekStart: req.body?.weekStart ? String(req.body.weekStart).slice(0, 10) : undefined,
      settingsOverride: req.body?.settings,
      updatedBy: req.user.loginId || req.user.name || req.user.email || "sc-weekly-briefing-send-all",
    });
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error instanceof Error ? error.message : "\uC8FC\uAC04 \uBE0C\uB9AC\uD551 \uC790\uB3D9 \uBC1C\uC1A1\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4." });
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

app.get("/api/client-contracts", authMiddleware, (_req, res) => {
  res.json(listContracts().map(sanitizeContractForClient));
});

app.get("/api/client-contracts/templates", authMiddleware, (_req, res) => {
  res.json(listContractTemplates());
});

app.get("/api/client-contracts/templates/:id/defaults", authMiddleware, (req, res) => {
  const defaults = getDefaultPdfContent(req.params.id);
  if (!defaults) {
    res.status(404).json({ error: "\uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 \uD15C\uD074\uB9BF\uC785\uB2C8\uB2E4." });
    return;
  }
  res.json({ templateId: req.params.id, pdfContent: defaults });
});

app.post("/api/client-contracts/generate", authMiddleware, async (req, res) => {
  try {
    const templateId = String(req.body?.templateId || "unit-price-agreement").trim();
    const clientName = String(req.body?.clientName || "").trim();
    const result = await createContractFromTemplate(
      templateId,
      clientName,
      req.user.loginId || req.user.name || req.user.email,
    );
    if (!result.ok) {
      res.status(result.status || 400).json({ error: result.error });
      return;
    }
    res.status(201).json(sanitizeContractForClient(result.contract));
  } catch (error) {
    console.error("[client-contracts] generate failed:", error);
    res.status(500).json({ error: "\uACC4\uC57D\uC11C \uC0DD\uC131\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4." });
  }
});

app.get("/api/client-contracts/:id", authMiddleware, (req, res) => {
  const contract = getContractById(req.params.id);
  if (!contract) {
    res.status(404).json({ error: "\uACC4\uC57D\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    return;
  }
  res.json(sanitizeContractForClient(contract));
});

app.patch("/api/client-contracts/:id", authMiddleware, (req, res) => {
  const result = updateContract(req.params.id, req.body || {}, req.user.loginId || req.user.name || req.user.email);
  if (!result.ok) {
    res.status(result.status || 400).json({ error: result.error });
    return;
  }
  res.json(sanitizeContractForClient(result.contract));
});

app.post("/api/client-contracts/:id/rebuild-pdf", authMiddleware, async (req, res) => {
  try {
    const result = await rebuildContractPdf(
      req.params.id,
      req.body || {},
      req.user.loginId || req.user.name || req.user.email,
    );
    if (!result.ok) {
      res.status(result.status || 400).json({ error: result.error });
      return;
    }
    res.json(sanitizeContractForClient(result.contract));
  } catch (error) {
    console.error("[client-contracts] rebuild-pdf failed:", error);
    res.status(500).json({ error: "PDF \uC7AC\uC0DD\uC131\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4." });
  }
});

app.delete("/api/client-contracts/:id", authMiddleware, (req, res) => {
  const result = deleteContract(req.params.id);
  if (!result.ok) {
    res.status(result.status || 400).json({ error: result.error });
    return;
  }
  res.json({ ok: true, version: result.version });
});

app.get("/api/client-contracts/:id/original", authMiddleware, (req, res) => {
  const contract = getContractById(req.params.id);
  if (!contract) {
    res.status(404).json({ error: "\uACC4\uC57D\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    return;
  }
  const file = getContractOriginalFile(contract);
  if (!file) {
    res.status(404).json({ error: "PDF\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    return;
  }
  const encodedName = encodeURIComponent(file.fileName);
  const disposition = req.query.download === "1" ? "attachment" : "inline";
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `${disposition}; filename*=UTF-8''${encodedName}`);
  res.sendFile(path.resolve(file.path));
});

app.get("/api/client-contracts/:id/signed", authMiddleware, (req, res) => {
  const contract = getContractById(req.params.id);
  if (!contract) {
    res.status(404).json({ error: "\uACC4\uC57D\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    return;
  }
  const file = getContractSignedFile(contract);
  if (!file) {
    res.status(404).json({ error: "\uC11C\uBA85\uB41C PDF\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    return;
  }
  const encodedName = encodeURIComponent(file.fileName);
  const disposition = req.query.download === "1" ? "attachment" : "inline";
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `${disposition}; filename*=UTF-8''${encodedName}`);
  res.sendFile(path.resolve(file.path));
});

app.get("/api/client-contracts/:id/preview", authMiddleware, (req, res) => {
  const contract = getContractById(req.params.id);
  if (!contract) {
    res.status(404).json({ error: "\uACC4\uC57D\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    return;
  }
  const kind = req.query.kind === "signed" ? "signed" : "original";
  const file = kind === "signed" ? getContractSignedFile(contract) : getContractOriginalFile(contract);
  if (!file) {
    res.status(404).json({ error: "PDF\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    return;
  }
  sendContractPreviewResponse(req, res, {
    pdfPath: file.path,
    cacheKey: `${contract.id}-${kind}`,
    fileName: file.fileName,
  });
});

app.post("/api/client-contracts/:id/send", authMiddleware, async (req, res) => {
  const contract = getContractById(req.params.id);
  if (!contract) {
    res.status(404).json({ error: "\uACC4\uC57D\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    return;
  }

  const tokenResult = issueSignToken(req.params.id, req.body?.expiryHours);
  if (!tokenResult.ok) {
    res.status(tokenResult.status || 400).json({ error: tokenResult.error });
    return;
  }

  const signUrl = `${config.alimtalk.erpBaseUrl.replace(/\/$/, "")}/sign/${tokenResult.token}`;
  const alimtalk = await sendContractAlimtalk({
    phones: [contract.contactPhone],
    variables: {
      client: contract.clientName,
      title: contract.title,
      token: tokenResult.token,
      url: signUrl,
    },
  });
  if (!alimtalk.ok && !alimtalk.dryRun && !alimtalk.skipped) {
    console.error("[client-contracts] alimtalk send failed:", contract.id, alimtalk);
  }

  res.json({
    contract: sanitizeContractForClient(tokenResult.contract),
    signUrl,
    alimtalk,
  });
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
  const spaIndexPath = path.join(config.distDir, "index.html");

  app.get("/request/:token", (req, res) => {
    const result = getPublicClientSiteRequestInfo(req.params.token);
    if (!result.ok) {
      res.sendFile(spaIndexPath);
      return;
    }

    const origin = buildPublicRequestOrigin(req);
    const sharePageUrl = `${origin}/request/${encodeURIComponent(req.params.token)}`;
    const og = buildClientSiteRequestOgMeta({
      clientName: result.info.clientName,
      sharePageUrl,
      origin,
    });

    const indexHtml = fs.readFileSync(spaIndexPath, "utf8");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.send(buildClientSiteRequestSharePreviewHtml(indexHtml, { title: og.ogTitle, og }));
  });

  app.use(express.static(config.distDir));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(spaIndexPath);
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
