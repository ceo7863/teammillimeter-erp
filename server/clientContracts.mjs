import fs from "fs";
import path from "path";
import crypto from "crypto";
import { config } from "./config.mjs";
import { getErpState, saveErpState } from "./db.mjs";
import {
  applySignatureToContractPdf,
  fillContractTemplate,
  getContractTemplate,
  getDefaultPdfContent,
} from "./contractTemplate.mjs";

const MAX_CONTRACTS = 2000;
const MAX_SIGNATURE_LENGTH = 280_000;
const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TOKEN_EXPIRY_HOURS = 24;

function listClientContracts(data = {}) {
  return Array.isArray(data.clientContracts) ? data.clientContracts : [];
}

export function sanitizeContractForClient(contract) {
  if (!contract) return null;
  const { signToken, ...rest } = contract;
  const resolved = withResolvedStatus(contract);
  let signUrl = null;
  if (signToken && resolved.status === "sent" && !isTokenExpired(contract)) {
    signUrl = `${config.alimtalk.erpBaseUrl.replace(/\/$/, "")}/sign/${signToken}`;
  }
  return { ...rest, status: resolved.status, signUrl };
}

function contractFilePath(storageKey) {
  return path.join(config.clientContractsDir, storageKey);
}

function decodeSignaturePng(signatureDataUrl) {
  const text = String(signatureDataUrl || "").trim();
  const prefixMatch = text.match(/^data:image\/png;base64,/i);
  if (!prefixMatch) {
    return { ok: false, error: "\uC11C\uBA85 \uC774\uBBF8\uC9C0\uAC00 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4." };
  }
  if (text.length > MAX_SIGNATURE_LENGTH) {
    return { ok: false, error: "\uC11C\uBA85 \uC774\uBBF8\uC9C0\uAC00 \uB108\uBB34 \uD07D\uB2C8\uB2E4." };
  }
  const payload = text.slice(prefixMatch[0].length);
  if (payload.length < 80) {
    return { ok: false, error: "\uC11C\uBA85\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694." };
  }
  try {
    const buffer = Buffer.from(payload, "base64");
    if (!buffer.length) {
      return { ok: false, error: "\uC11C\uBA85 \uC774\uBBF8\uC9C0\uAC00 \uBE44\uC5B4 \uC788\uC2B5\uB2C8\uB2E4." };
    }
    return { ok: true, buffer, signatureDataUrl: text };
  } catch {
    return { ok: false, error: "\uC11C\uBA85 \uC774\uBBF8\uC9C0\uB97C \uC77D\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." };
  }
}

function normalizePhone(phone) {
  return String(phone || "").replace(/\D/g, "");
}

function isTokenExpired(contract) {
  if (!contract?.tokenExpiresAt) return true;
  return Date.parse(contract.tokenExpiresAt) < Date.now();
}

function resolveContractStatus(contract) {
  if (!contract) return "draft";
  if (contract.status === "signed") return "signed";
  if (contract.status === "sent" && isTokenExpired(contract)) return "expired";
  return contract.status || "draft";
}

function withResolvedStatus(contract) {
  return {
    ...contract,
    status: resolveContractStatus(contract),
  };
}

export function initClientContractsStore() {
  fs.mkdirSync(config.clientContractsDir, { recursive: true });
}

export function listContracts() {
  const state = getErpState();
  const data = state.data && typeof state.data === "object" ? state.data : {};
  return listClientContracts(data)
    .map(withResolvedStatus)
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

export function getContractById(id) {
  const contract = listContracts().find((row) => row.id === id) || null;
  return contract ? withResolvedStatus(contract) : null;
}

export function getContractByToken(token) {
  const state = getErpState();
  const data = state.data && typeof state.data === "object" ? state.data : {};
  const contract = listClientContracts(data).find((row) => row.signToken === token) || null;
  if (!contract) return null;
  return withResolvedStatus(contract);
}

export function getContractOriginalFile(contract) {
  if (!contract?.originalStorageKey) return null;
  const filePath = contractFilePath(contract.originalStorageKey);
  if (!fs.existsSync(filePath)) return null;
  return {
    path: filePath,
    fileName: contract.originalFileName || "contract.pdf",
  };
}

export function getContractSignedFile(contract) {
  if (!contract?.signedStorageKey) return null;
  const filePath = contractFilePath(contract.signedStorageKey);
  if (!fs.existsSync(filePath)) return null;
  return {
    path: filePath,
    fileName: contract.originalFileName
      ? contract.originalFileName.replace(/\.pdf$/i, "") + "-signed.pdf"
      : "contract-signed.pdf",
  };
}

function findClientByName(clientName) {
  const state = getErpState();
  const data = state.data && typeof state.data === "object" ? state.data : {};
  const clients = Array.isArray(data.clients) ? data.clients : [];
  const needle = String(clientName || "").trim();
  return clients.find((row) => String(row?.name || "").trim() === needle) || null;
}

export function resolveClientContractContact(client) {
  if (!client) return { contactName: "", contactPhone: "" };
  const contactName = String(client.ceoName || client.manager || "").trim();
  const contactPhone = normalizePhone(client.phone);
  return { contactName, contactPhone };
}

export async function createContractFromTemplate(templateId, clientName, createdBy) {
  const name = String(clientName || "").trim();
  if (!name) return { ok: false, status: 400, error: "\uAC70\uB798\uCC98\uBA85\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." };

  const client = findClientByName(name);
  if (!client) return { ok: false, status: 404, error: "\uAC70\uB798\uCC98 \uB9C8\uC2A4\uD130\uC5D0 \uAC70\uB798\uCC98\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4." };

  const { contactName, contactPhone } = resolveClientContractContact(client);
  if (!contactPhone) {
    return { ok: false, status: 400, error: "\uAC70\uB798\uCC98 \uB9C8\uC2A4\uD130\uC5D0 \uB300\uD45C\uC790 \uC5F0\uB77D\uCC98\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4." };
  }

  const pdfContent = getDefaultPdfContent(templateId) || undefined;
  const filled = await fillContractTemplate(templateId, {
    clientName: name,
    contactName,
    contactPhone,
    pdfContent,
  });
  if (!filled.ok) return filled;

  const template = getContractTemplate(templateId);
  const result = createContract(filled.buffer, {
    clientName: name,
    title: filled.title,
    contactName,
    contactPhone,
    fileName: filled.fileName,
    templateId: template?.id,
    signatureRect: filled.signatureRect,
    dateField: filled.dateField,
    pdfContent: filled.pdfContent,
  }, createdBy);
  return result;
}

export function createContract(buffer, meta, createdBy) {
  const clientName = String(meta.clientName || "").trim();
  const title = String(meta.title || "").trim();
  const contactPhone = normalizePhone(meta.contactPhone);
  if (!clientName) return { ok: false, status: 400, error: "\uAC70\uB798\uCC98\uBA85\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." };
  if (!title) return { ok: false, status: 400, error: "\uACC4\uC57D \uC81C\uBAA9\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." };
  if (!contactPhone) return { ok: false, status: 400, error: "\uC218\uC2E0 \uC5F0\uB77D\uCC98\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4." };
  if (!buffer?.length) return { ok: false, status: 400, error: "PDF \uD30C\uC77C\uC774 \uBE44\uC5B4 \uC788\uC2B5\uB2C8\uB2E4." };

  const state = getErpState();
  const data = state.data && typeof state.data === "object" ? state.data : {};
  const contracts = listClientContracts(data);
  const id = `cc-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const originalStorageKey = `${id}-original.pdf`;
  fs.writeFileSync(contractFilePath(originalStorageKey), buffer);

  const contract = {
    id,
    clientName,
    title,
    contactName: String(meta.contactName || "").trim() || undefined,
    contactPhone,
    status: "draft",
    originalFileName: String(meta.fileName || "contract.pdf").trim() || "contract.pdf",
    originalStorageKey,
    templateId: meta.templateId ? String(meta.templateId) : undefined,
    signatureRect: meta.signatureRect || undefined,
    dateField: meta.dateField || undefined,
    pdfContent: meta.pdfContent && typeof meta.pdfContent === "object" ? meta.pdfContent : undefined,
    createdAt: new Date().toISOString(),
    createdBy: createdBy || undefined,
  };

  const nextContracts = [contract, ...contracts].slice(0, MAX_CONTRACTS);
  const saved = saveErpState({ ...data, clientContracts: nextContracts }, state.version, `contract-create:${clientName}`);
  return { ok: true, contract: withResolvedStatus(contract), version: saved.version };
}

export function updateContract(id, patch = {}, updatedBy) {
  const state = getErpState();
  const data = state.data && typeof state.data === "object" ? state.data : {};
  const contracts = listClientContracts(data);
  const index = contracts.findIndex((row) => row.id === id);
  if (index < 0) return { ok: false, status: 404, error: "\uACC4\uC57D\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." };

  const current = contracts[index];
  if (current.status === "signed") {
    return { ok: false, status: 400, error: "\uC774\uBBF8 \uC11C\uBA85\uB41C \uACC4\uC57D\uC740 \uC218\uC815\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." };
  }

  const next = {
    ...current,
    title: patch.title != null ? String(patch.title).trim() || current.title : current.title,
    contactName:
      patch.contactName != null ? String(patch.contactName).trim() || undefined : current.contactName,
    contactPhone:
      patch.contactPhone != null ? normalizePhone(patch.contactPhone) || current.contactPhone : current.contactPhone,
    updatedAt: new Date().toISOString(),
    updatedBy: updatedBy || current.updatedBy,
  };

  if (!next.contactPhone) {
    return { ok: false, status: 400, error: "\uC218\uC2E0 \uC5F0\uB77D\uCC98\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4." };
  }

  const nextContracts = [...contracts];
  nextContracts[index] = next;
  const saved = saveErpState({ ...data, clientContracts: nextContracts }, state.version, `contract-update:${id}`);
  return { ok: true, contract: withResolvedStatus(next), version: saved.version };
}

function canRebuildContractPdf(contract) {
  if (!contract) return false;
  if (contract.status === "signed") return false;
  const resolved = resolveContractStatus(contract);
  if (resolved === "draft" || resolved === "expired") return true;
  return false;
}

export async function rebuildContractPdf(id, patch = {}, updatedBy) {
  const state = getErpState();
  const data = state.data && typeof state.data === "object" ? state.data : {};
  const contracts = listClientContracts(data);
  const index = contracts.findIndex((row) => row.id === id);
  if (index < 0) return { ok: false, status: 404, error: "\uACC4\uC57D\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." };

  const current = contracts[index];
  if (!canRebuildContractPdf(current)) {
    if (current.status === "signed") {
      return { ok: false, status: 400, error: "\uC774\uBBF8 \uC11C\uBA85\uB41C \uACC4\uC57D\uC740 PDF\uB97C \uC218\uC815\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." };
    }
    return { ok: false, status: 400, error: "\uBC1C\uC1A1 \uC911\uC778 \uACC4\uC57D\uC740 PDF\uB97C \uC218\uC815\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. \uB9CC\uB8CC \uD6C4 \uB610\uB294 \uCD08\uC548 \uC0C1\uD0DC\uC5D0\uC11C\uB9CC \uAC00\uB2A5\uD569\uB2C8\uB2E4." };
  }

  const templateId = String(current.templateId || "").trim();
  if (!templateId) {
    return { ok: false, status: 400, error: "\uD15C\uD074\uB9BF \uAE30\uBC18 \uACC4\uC57D\uC774 \uC544\uB2C8\uC5B4 PDF \uB0B4\uC6A9\uC744 \uC218\uC815\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." };
  }

  const contactName =
    patch.contactName != null ? String(patch.contactName).trim() || undefined : current.contactName;
  const contactPhone =
    patch.contactPhone != null ? normalizePhone(patch.contactPhone) || current.contactPhone : current.contactPhone;
  if (!contactPhone) {
    return { ok: false, status: 400, error: "\uC218\uC2E0 \uC5F0\uB77D\uCC98\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4." };
  }

  const defaultContent = getDefaultPdfContent(templateId) || {};
  const existingContent =
    current.pdfContent && typeof current.pdfContent === "object" ? current.pdfContent : defaultContent;
  const patchContent = patch.pdfContent && typeof patch.pdfContent === "object" ? patch.pdfContent : {};
  const pdfContent = { ...defaultContent, ...existingContent, ...patchContent };

  const filled = await fillContractTemplate(templateId, {
    clientName: current.clientName,
    contactName,
    contactPhone,
    pdfContent,
  });
  if (!filled.ok) return filled;

  if (!current.originalStorageKey) {
    return { ok: false, status: 500, error: "\uC6D0\uBCF8 PDF \uACBD\uB85C\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4." };
  }
  fs.writeFileSync(contractFilePath(current.originalStorageKey), filled.buffer);

  const wasExpired = resolveContractStatus(current) === "expired";
  const next = {
    ...current,
    contactName,
    contactPhone,
    pdfContent: filled.pdfContent,
    updatedAt: new Date().toISOString(),
    updatedBy: updatedBy || current.updatedBy,
  };
  if (wasExpired) {
    next.status = "draft";
    next.signToken = undefined;
    next.tokenExpiresAt = undefined;
    next.sentAt = undefined;
  }

  const nextContracts = [...contracts];
  nextContracts[index] = next;
  const saved = saveErpState({ ...data, clientContracts: nextContracts }, state.version, `contract-rebuild-pdf:${id}`);
  return { ok: true, contract: withResolvedStatus(next), version: saved.version };
}

export function deleteContract(id) {
  const state = getErpState();
  const data = state.data && typeof state.data === "object" ? state.data : {};
  const contracts = listClientContracts(data);
  const contract = contracts.find((row) => row.id === id);
  if (!contract) return { ok: false, status: 404, error: "\uACC4\uC57D\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." };

  for (const key of [contract.originalStorageKey, contract.signedStorageKey].filter(Boolean)) {
    const filePath = contractFilePath(key);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }

  const nextContracts = contracts.filter((row) => row.id !== id);
  const saved = saveErpState({ ...data, clientContracts: nextContracts }, state.version, `contract-delete:${id}`);
  return { ok: true, version: saved.version };
}

export function issueSignToken(id, expiryHours = DEFAULT_TOKEN_EXPIRY_HOURS) {
  const state = getErpState();
  const data = state.data && typeof state.data === "object" ? state.data : {};
  const contracts = listClientContracts(data);
  const index = contracts.findIndex((row) => row.id === id);
  if (index < 0) return { ok: false, status: 404, error: "\uACC4\uC57D\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." };

  const current = contracts[index];
  if (current.status === "signed") {
    return { ok: false, status: 400, error: "\uC774\uBBF8 \uC11C\uBA85\uB41C \uACC4\uC57D\uC785\uB2C8\uB2E4." };
  }

  const hours = Math.max(1, Math.min(168, Number(expiryHours) || DEFAULT_TOKEN_EXPIRY_HOURS));
  const token = crypto.randomBytes(24).toString("hex");
  const tokenExpiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
  const next = {
    ...current,
    signToken: token,
    tokenExpiresAt,
    status: "sent",
    sentAt: new Date().toISOString(),
  };

  const nextContracts = [...contracts];
  nextContracts[index] = next;
  const saved = saveErpState({ ...data, clientContracts: nextContracts }, state.version, `contract-send:${id}`);
  return {
    ok: true,
    contract: withResolvedStatus(next),
    token,
    tokenExpiresAt,
    version: saved.version,
  };
}

export async function submitContractSignature(token, input = {}) {
  const state = getErpState();
  const data = state.data && typeof state.data === "object" ? state.data : {};
  const contracts = listClientContracts(data);
  const index = contracts.findIndex((row) => row.signToken === token);
  if (index < 0) return { ok: false, status: 404, error: "\uC720\uD6A8\uD558\uC9C0 \uC54A\uC740 \uC11C\uBA85 \uB9C1\uD06C\uC785\uB2C8\uB2E4." };

  const current = contracts[index];
  if (current.status === "signed") {
    return { ok: false, status: 409, error: "\uC774\uBBF8 \uC11C\uBA85\uC774 \uC644\uB8CC\uB41C \uACC4\uC57D\uC785\uB2C8\uB2E4." };
  }
  if (isTokenExpired(current)) {
    return { ok: false, status: 410, error: "\uC11C\uBA85 \uB9C1\uD06C\uAC00 \uB9CC\uB8CC\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uB2F4\uB2F9\uC790\uC5D0\uAC8C \uC7AC\uBC1C\uC1A1\uC744 \uC694\uCCAD\uD574 \uC8FC\uC138\uC694." };
  }

  const signedByName = String(input.signedByName || current.contactName || "").trim();
  if (!signedByName) {
    return { ok: false, status: 400, error: "\uC11C\uBA85\uC790 \uC131\uD568\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694." };
  }

  const signatureCheck = decodeSignaturePng(input.signatureDataUrl);
  if (!signatureCheck.ok) {
    return { ok: false, status: 400, error: signatureCheck.error };
  }

  const originalFile = getContractOriginalFile(current);
  if (!originalFile) {
    return { ok: false, status: 404, error: "\uC6D0\uBCF8 \uACC4\uC57D PDF\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." };
  }

  const originalBuffer = fs.readFileSync(originalFile.path);
  const signatureStorageKey = `${current.id}-signature.png`;
  const signedStorageKey = `${current.id}-signed.pdf`;
  fs.writeFileSync(contractFilePath(signatureStorageKey), signatureCheck.buffer);

  let signedPdfBuffer;
  try {
    signedPdfBuffer = await applySignatureToContractPdf(originalBuffer, signatureCheck.buffer, {
      signatureRect: current.signatureRect,
      dateField: current.dateField,
      signedAt: new Date().toISOString(),
    });
    fs.writeFileSync(contractFilePath(signedStorageKey), signedPdfBuffer);
  } catch (error) {
    console.error("[client-contracts] signed pdf build failed:", error);
    signedPdfBuffer = null;
  }

  const next = {
    ...current,
    status: "signed",
    signedAt: new Date().toISOString(),
    signedByName,
    signatureDataUrl: signatureCheck.signatureDataUrl,
    signatureStorageKey,
    signedStorageKey: signedPdfBuffer ? signedStorageKey : undefined,
    signToken: undefined,
    tokenExpiresAt: undefined,
  };

  const nextContracts = [...contracts];
  nextContracts[index] = next;
  const saved = saveErpState({ ...data, clientContracts: nextContracts }, state.version, `contract-signed:${current.id}`);
  return {
    ok: true,
    contract: sanitizeContractForClient(withResolvedStatus(next)),
    version: saved.version,
  };
}

export function getPublicSignPayload(token) {
  const contract = getContractByToken(token);
  if (!contract) return { ok: false, status: 404, error: "\uC720\uD6A8\uD558\uC9C0 \uC54A\uC740 \uC11C\uBA85 \uB9C1\uD06C\uC785\uB2C8\uB2E4." };
  if (contract.status === "signed") {
    return { ok: false, status: 409, error: "\uC774\uBBF8 \uC11C\uBA85\uC774 \uC644\uB8CC\uB41C \uACC4\uC57D\uC785\uB2C8\uB2E4." };
  }
  if (isTokenExpired(contract)) {
    return { ok: false, status: 410, error: "\uC11C\uBA85 \uB9C1\uD06C\uAC00 \uB9CC\uB8CC\uB418\uC5C8\uC2B5\uB2C8\uB2E4." };
  }
  return {
    ok: true,
    contract: {
      id: contract.id,
      clientName: contract.clientName,
      title: contract.title,
      contactName: contract.contactName,
      status: resolveContractStatus(contract),
      originalFileName: contract.originalFileName,
      tokenExpiresAt: contract.tokenExpiresAt,
    },
  };
}
