import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, Copy, Link2, RefreshCw, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AutocompleteSelect } from "@/components/AutocompleteInput";
import { isApiModeEnabled } from "@/utils/erpApi";
import {
  clientSiteRequestStatusLabel,
  countsAsClientSiteRequestInbox,
  ensureClientSiteRequestLink,
  formatClientSiteRequestWorkPeriod,
  isClientSiteRequestChangeRequest,
  listClientSiteRequestLinks,
  listClientSiteRequests,
  openClientSiteRequestLink,
  postStaffClientSiteRequestMessage,
  resolveClientSiteRequestLinkUrl,
  rotateClientSiteRequestLink,
  setClientSiteRequestLinkDisabled,
  updateClientSiteRequestStatus,
  type ClientSiteRequest,
  type ClientSiteRequestCompletionStep,
  type ClientSiteRequestLink,
  type ClientSiteRequestStatus,
} from "@/utils/clientSiteRequests";
import { ClientSiteRequestCalendarModal } from "@/components/ClientSiteRequestCalendarModal";
import { deferAfterTouch, openCalendarForClient } from "@/utils/modalBackdrop";
import { ClientSiteRequestChat } from "@/components/ClientSiteRequestChat";
import {
  fetchScProjectMappingStatus,
  fetchScScheduleSyncStatus,
  removeScProjectClientMapping,
  runScScheduleSyncNow,
  saveScProjectClientMapping,
  type ScProjectMappingRow,
  type ScProjectMappingStatus,
  type ScScheduleSyncStatus,
  type ScUnmappedProjectRow,
} from "@/utils/scSchedules";

const L = {
  apiOnly: "\uD604\uC7A5 \uC811\uC218 \uB9C1\uD06C\uB294 API \uC5F0\uB3D9 \uBAA8\uB4DC\uC5D0\uC11C \uC0AC\uC6A9\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
  refresh: "\uC0C8\uB85C\uACE0\uCE68",
  tabInbox: "\uC811\uC218 \uBAA9\uB85D",
  tabDone: "\uCC98\uB9AC \uC644\uB8CC",
  tabLinks: "\uB9C1\uD06C \uAD00\uB9AC",
  pickClient: "\uAC70\uB798\uCC98 \uC120\uD0DD",
  issueLink: "\uB9C1\uD06C \uBC1C\uAE09",
  rotateLink: "\uB9C1\uD06C \uC7AC\uBC1C\uAE09",
  copyLink: "\uB9C1\uD06C \uBCF5\uC0AC",
  openLink: "\uB9C1\uD06C \uC5F4\uAE30",
  linkUrl: "\uACF5\uAC1C \uB9C1\uD06C",
  disableLink: "\uC911\uB2E8",
  enableLink: "\uC7AC\uAC1C",
  linkDisabled: "\uC911\uB2E8\uB428",
  linkActive: "\uC0AC\uC6A9 \uC911",
  pendingBadge: (count: number) => `\uB300\uAE30 ${count}\uAC74`,
  linkIssueTitle: "\uAC70\uB798\uCC98 \uB9C1\uD06C \uBC1C\uAE09",
  linkIssueDesc: "\uAC70\uB798\uCC98\uBCC4 \uACF5\uAC1C \uC811\uC218 \uB9C1\uD06C\uB97C \uBC1C\uAE09\u00B7\uAD00\uB9AC\uD569\uB2C8\uB2E4.",
  linkClassAll: "\uC804\uCCB4",
  linkClassActive: "\uC0AC\uC6A9 \uC911",
  linkClassDisabled: "\uC911\uB2E8",
  linkSearchPh: "\uAC70\uB798\uCC98\uBA85 \uAC80\uC0C9",
  filterClient: "\uAC70\uB798\uCC98 \uD544\uD130",
  filterAllClients: "\uC804\uCCB4 \uAC70\uB798\uCC98",
  loading: "\uBD88\uB7EC\uC624\uB294 \uC911...",
  emptyLinks: "\uBC1C\uAE09\uB41C \uB9C1\uD06C\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.",
  emptyInbox: "\uB300\uAE30 \uC911\uC778 \uC811\uC218 \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  emptyDone: "\uCC98\uB9AC \uC644\uB8CC\uB41C \uC811\uC218 \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  client: "\uAC70\uB798\uCC98",
  workDate: "\uC791\uC5C5 \uAE30\uAC04",
  site: "\uD604\uC7A5",
  workers: "\uC778\uC6D0",
  workerUnit: "\uBA85",
  contact: "\uC791\uC131\uC790",
  submittedAt: "\uC811\uC218",
  status: "\uC0C1\uD0DC",
  actions: "\uAD00\uB9AC",
  confirm: "\uC811\uC218 \uC644\uB8CC",
  registerComplete: "\uB4F1\uB85D \uC644\uB8CC",
  reject: "\uBC18\uB824",
  confirmCancel: "\uCDE8\uC18C \uD655\uC815",
  denyCancel: "\uCDE8\uC18C \uAC70\uBD80",
  cancelRequestedBadge: "\uAC70\uB798\uCC98 \uCDE8\uC18C \uC694\uCCAD",
  cancelRequestedFromDoneBadge: "\uCC98\uB9AC\uC644\uB8CC \uAC74 \uCDE8\uC18C \uC694\uCCAD",
  changeRequestedBadge: "\uC77C\uC815 \uBCC0\uACBD \uC694\uCCAD",
  cancelled: "\uCDE8\uC18C \uC644\uB8CC \uCC98\uB9AC\uD588\uC2B5\uB2C8\uB2E4.",
  cancelDenied: "\uCDE8\uC18C \uC694\uCCAD\uC744 \uAC70\uBD80\uD588\uC2B5\uB2C8\uB2E4.",
  reopen: "\uB300\uAE30 \uBCF5\uADC0",
  processNotePh: "\uB0B4\uBD80 \uBA54\uBAA8 (\uAC70\uB798\uCC98 \uBE44\uACF5\uAC1C)",
  processedBy: "\uCC98\uB9AC\uC790",
  receiptDoneBadge: "\uC811\uC218 \uC644\uB8CC",
  registerDoneBadge: "\uB4F1\uB85D \uC644\uB8CC",
  linkCopied: "\uB9C1\uD06C\uB97C \uBCF5\uC0AC\uD588\uC2B5\uB2C8\uB2E4.",
  linkIssued: "\uB9C1\uD06C\uAC00 \uBC1C\uAE09\uB418\uC5C8\uC2B5\uB2C8\uB2E4.",
  updatedReceipt: "\uC811\uC218 \uC644\uB8CC\uB97C \uD655\uC778\uD588\uC2B5\uB2C8\uB2E4.",
  updatedRegister: "\uB4F1\uB85D \uC644\uB8CC\uB97C \uD655\uC778\uD588\uC2B5\uB2C8\uB2E4.",
  updated: "\uCC98\uB9AC \uC644\uB8CC \uBAA9\uB85D\uC73C\uB85C \uC774\uB3D9\uD588\uC2B5\uB2C8\uB2E4.",
  rejected: "\uBC18\uB824 \uCC98\uB9AC\uD588\uC2B5\uB2C8\uB2E4.",
  reopened: "\uC811\uC218 \uBAA9\uB85D\uC73C\uB85C \uB418\uB418\uB140\uC2B5\uB2C8\uB2E4.",
  fail: "\uC694\uCCAD \uCC98\uB9AC\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.",
  messageFail: "\uBA54\uC2DC\uC9C0 \uC804\uC1A1\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.",
  unreadChat: "\uC0C8 \uBA54\uC2DC\uC9C0",
  calendarTitle: "\uC811\uC218 \uCE98\uB9B0\uB354",
  scSync: "SC \uB3D9\uAE30\uD654",
  scSyncing: "\uB3D9\uAE30\uD654 \uC911...",
  scSyncDone: (count: number) => `SC \uC77C\uC815 ${count}\uAC74 \uB3D9\uAE30\uD654\uD588\uC2B5\uB2C8\uB2E4.`,
  scSyncNotConfigured: "SC \uB3D9\uAE30\uD654 \uC124\uC815 \uBBF8\uC644\uB8CC",
  scMapping: "SC \uAC70\uB798\uCC98 \uB9E4\uCE6D",
  scMappingTitle: "SC \uAC70\uB798\uCC98 \uC218\uB3D9 \uB9E4\uCE6D",
  scMappingDesc:
    "\uC790\uB3D9 \uB9E4\uCE6D\uB418\uC9C0 \uC54A\uC740 SC \uD504\uB85C\uC81D\uD2B8\uB97C ERP \uAC70\uB798\uCC98\uC640 \uC5F0\uACB0\uD569\uB2C8\uB2E4.",
  scProject: "SC \uD504\uB85C\uC81D\uD2B8",
  scMappedClient: "\uC5F0\uACB0 \uAC70\uB798\uCC98",
  scMappingType: "\uB9E4\uCE6D",
  scMappingManual: "\uC218\uB3D9",
  scMappingAuto: "\uC790\uB3D9",
  scUnmapped: (count: number) => `\uBBF8\uB9E4\uCE6D ${count}\uAC74`,
  scUnmappedEmpty: "\uBBF8\uB9E4\uCE6D SC \uD504\uB85C\uC81D\uD2B8\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.",
  scMappedEmpty: "\uB4F1\uB85D\uB41C SC \uAC70\uB798\uCC98 \uB9E4\uCE6D\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  scSaveMapping: "\uB9E4\uCE6D \uC800\uC7A5",
  scRemoveMapping: "\uB9E4\uCE6D \uD574\uC81C",
  scMappingSaved: "SC \uAC70\uB798\uCC98 \uB9E4\uCE6D\uC744 \uC800\uC7A5\uD588\uC2B5\uB2C8\uB2E4.",
  scMappingRemoved: "SC \uAC70\uB798\uCC98 \uB9E4\uCE6D\uC744 \uD574\uC81C\uD588\uC2B5\uB2C8\uB2E4.",
  scPickMappingClient: "ERP \uAC70\uB798\uCC98 \uC120\uD0DD",
};

type ClientLike = {
  id?: number | string;
  name?: string;
};

type PanelTab = "inbox" | "done" | "links";
type LinkClassFilter = "all" | "active" | "disabled";

type ClientSiteRequestsPanelProps = {
  clients: ClientLike[];
  isAdmin?: boolean;
};

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function RequestCard({
  request,
  noteDrafts,
  chatDrafts,
  chatSendingId,
  saving,
  showActions,
  onNoteChange,
  onChatDraftChange,
  onSendMessage,
  onUpdateStatus,
  onCompleteStep,
  onClientNameClick,
}: {
  request: ClientSiteRequest;
  noteDrafts: Record<string, string>;
  chatDrafts: Record<string, string>;
  chatSendingId: string;
  saving: boolean;
  showActions: boolean;
  onNoteChange: (id: string, value: string) => void;
  onChatDraftChange: (id: string, value: string) => void;
  onSendMessage: (request: ClientSiteRequest) => void;
  onUpdateStatus: (request: ClientSiteRequest, status: ClientSiteRequestStatus) => void;
  onCompleteStep: (request: ClientSiteRequest, step: ClientSiteRequestCompletionStep) => void;
  onClientNameClick?: (request: ClientSiteRequest) => void;
}) {
  const receiptDone = Boolean(request.receiptCompletedAt);
  const registerDone = Boolean(request.registerCompletedAt);
  const isCancelPending = request.status === "cancel_pending";

  const openCalendar = () => {
    if (!onClientNameClick) return;
    deferAfterTouch(() => onClientNameClick(request), 80);
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            {onClientNameClick ? (
              <>
                <button
                  type="button"
                  className="erp-touch-target text-base font-bold text-blue-700 underline decoration-blue-300 underline-offset-2 hover:text-blue-900"
                  title={L.calendarTitle}
                  data-no-action-feedback=""
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    openCalendar();
                  }}
                >
                  {request.clientName}
                </button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="rounded-lg lg:hidden"
                  noFeedback
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    openCalendar();
                  }}
                >
                  <CalendarDays size={14} className="mr-1" />
                  {L.calendarTitle}
                </Button>
              </>
            ) : (
              <span className="text-base font-bold text-slate-900">{request.clientName}</span>
            )}
            <span
              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ${
                request.status === "pending"
                  ? "bg-amber-100 text-amber-800"
                  : request.status === "cancel_pending"
                    ? "bg-orange-100 text-orange-800"
                    : request.status === "confirmed"
                      ? "bg-emerald-100 text-emerald-700"
                      : request.status === "cancelled"
                        ? "bg-slate-200 text-slate-700"
                        : "bg-red-100 text-red-700"
              }`}
            >
              {clientSiteRequestStatusLabel(request.status)}
            </span>
            {isCancelPending ? (
              <span className="inline-flex rounded-full bg-orange-100 px-2 py-0.5 text-xs font-bold text-orange-800">
                {request.cancelRestoreStatus === "confirmed"
                  ? L.cancelRequestedFromDoneBadge
                  : L.cancelRequestedBadge}
              </span>
            ) : null}
            {request.unreadByStaff ? (
              <span className="inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700">
                {L.unreadChat}
              </span>
            ) : null}
            {isClientSiteRequestChangeRequest(request) ? (
              <span className="inline-flex rounded-full bg-violet-100 px-2 py-0.5 text-xs font-bold text-violet-700">
                {L.changeRequestedBadge}
              </span>
            ) : null}
            {showActions && receiptDone ? (
              <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">
                {L.receiptDoneBadge}
              </span>
            ) : null}
            {showActions && registerDone ? (
              <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">
                {L.registerDoneBadge}
              </span>
            ) : null}
          </div>
          <div className="text-sm text-slate-700">
            <span className="font-semibold">{L.workDate}:</span> {formatClientSiteRequestWorkPeriod(request)}
            <span className="mx-2 text-slate-300">|</span>
            <span className="font-semibold">{L.site}:</span> {request.siteName}
            <span className="mx-2 text-slate-300">|</span>
            <span className="font-semibold">{L.workers}:</span> {request.workerCount}
            {L.workerUnit}
          </div>
          {request.memo ? <p className="text-sm text-slate-600">{request.memo}</p> : null}
          {(request.contactName || request.contactPhone) && (
            <p className="text-xs text-slate-500">
              {L.contact}: {[request.contactName, request.contactPhone].filter(Boolean).join(" \u00B7 ")}
            </p>
          )}
          <p className="text-xs text-slate-400">
            {L.submittedAt}: {formatDateTime(request.submittedAt)}
            {request.processedAt ? (
              <>
                {" \u00B7 "}
                {L.processedBy}: {request.processedBy || "-"} ({formatDateTime(request.processedAt)})
              </>
            ) : null}
          </p>
        </div>

        {showActions ? (
          <div className="w-full max-w-sm space-y-2">
            <Input
              value={noteDrafts[request.id] ?? request.processNote ?? ""}
              onChange={(event) => onNoteChange(request.id, event.target.value)}
              placeholder={L.processNotePh}
              className="rounded-xl"
            />
            {isCancelPending ? (
              <div className="flex flex-wrap gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  className="rounded-lg"
                  disabled={saving}
                  onClick={() => onUpdateStatus(request, "cancelled")}
                >
                  <Check size={13} className="mr-1" />
                  {L.confirmCancel}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="rounded-lg"
                  disabled={saving}
                  onClick={() => onUpdateStatus(request, "pending")}
                >
                  <RotateCcw size={13} className="mr-1" />
                  {L.denyCancel}
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  className={`rounded-lg ${receiptDone ? "bg-emerald-600 hover:bg-emerald-600" : ""}`}
                  variant={receiptDone ? "default" : "default"}
                  disabled={saving || receiptDone}
                  onClick={() => onCompleteStep(request, "receipt")}
                >
                  <Check size={13} className="mr-1" />
                  {L.confirm}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className={`rounded-lg ${registerDone ? "bg-emerald-600 hover:bg-emerald-600" : ""}`}
                  variant={registerDone ? "default" : "outline"}
                  disabled={saving || registerDone}
                  onClick={() => onCompleteStep(request, "register")}
                >
                  <Check size={13} className="mr-1" />
                  {L.registerComplete}
                </Button>
                {request.status !== "rejected" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="rounded-lg border-red-200 text-red-700"
                    disabled={saving}
                    onClick={() => onUpdateStatus(request, "rejected")}
                  >
                    <X size={13} className="mr-1" />
                    {L.reject}
                  </Button>
                ) : null}
              </div>
            )}
          </div>
        ) : (
          <div className="w-full max-w-sm">
            {request.processNote ? (
              <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">{request.processNote}</p>
            ) : null}
            {request.status !== "pending" &&
            request.status !== "cancel_pending" &&
            request.status !== "cancelled" ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-2 rounded-lg"
                disabled={saving}
                onClick={() => onUpdateStatus(request, "pending")}
              >
                {L.reopen}
              </Button>
            ) : null}
          </div>
        )}
      </div>

      <ClientSiteRequestChat
        messages={request.messages || []}
        draft={chatDrafts[request.id] || ""}
        onDraftChange={(value) => onChatDraftChange(request.id, value)}
        onSend={() => onSendMessage(request)}
        sending={chatSendingId === request.id}
        viewer="staff"
      />
    </div>
  );
}

export function ClientSiteRequestsPanel({ clients, isAdmin = false }: ClientSiteRequestsPanelProps) {
  const apiMode = isApiModeEnabled();
  const [activeTab, setActiveTab] = useState<PanelTab>("inbox");
  const [links, setLinks] = useState<ClientSiteRequestLink[]>([]);
  const [requests, setRequests] = useState<ClientSiteRequest[]>([]);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [issueClientId, setIssueClientId] = useState("");
  const [linkClassFilter, setLinkClassFilter] = useState<LinkClassFilter>("all");
  const [linkSearch, setLinkSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [chatDrafts, setChatDrafts] = useState<Record<string, string>>({});
  const [chatSendingId, setChatSendingId] = useState("");
  const [lastIssuedUrl, setLastIssuedUrl] = useState("");
  const [calendarModalClient, setCalendarModalClient] = useState<{
    clientId: number | string;
    clientName: string;
  } | null>(null);
  const [scSyncStatus, setScSyncStatus] = useState<ScScheduleSyncStatus | null>(null);
  const [scSyncing, setScSyncing] = useState(false);
  const [scMappingOpen, setScMappingOpen] = useState(false);
  const [scMappingStatus, setScMappingStatus] = useState<ScProjectMappingStatus | null>(null);
  const [scMappingLoading, setScMappingLoading] = useState(false);
  const [scMappingDrafts, setScMappingDrafts] = useState<Record<string, string>>({});

  const clientOptions = useMemo(
    () =>
      clients
        .filter((client) => String(client.name || "").trim())
        .map((client) => ({ value: String(client.id ?? ""), label: String(client.name || "").trim() }))
        .sort((a, b) => a.label.localeCompare(b.label, "ko")),
    [clients],
  );

  const loadAll = useCallback(async () => {
    if (!apiMode) return;
    setLoading(true);
    try {
      const [nextLinks, nextRequests] = await Promise.all([
        listClientSiteRequestLinks(),
        listClientSiteRequests({ status: "all", clientId: selectedClientId || undefined }),
      ]);
      setLinks(nextLinks);
      setRequests(nextRequests);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : L.fail);
    } finally {
      setLoading(false);
    }
  }, [apiMode, selectedClientId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const loadScSyncStatus = useCallback(async () => {
    if (!apiMode) return;
    try {
      const status = await fetchScScheduleSyncStatus();
      setScSyncStatus(status);
    } catch {
      setScSyncStatus(null);
    }
  }, [apiMode]);

  useEffect(() => {
    void loadScSyncStatus();
  }, [loadScSyncStatus]);

  const loadScMappingStatus = useCallback(async () => {
    if (!apiMode) return;
    setScMappingLoading(true);
    try {
      const status = await fetchScProjectMappingStatus();
      setScMappingStatus(status);
    } catch {
      setScMappingStatus(null);
    } finally {
      setScMappingLoading(false);
    }
  }, [apiMode]);

  useEffect(() => {
    if (scMappingOpen) {
      void loadScMappingStatus();
    }
  }, [scMappingOpen, loadScMappingStatus]);

  const handleScSync = useCallback(async () => {
    if (!apiMode || scSyncing) return;
    setScSyncing(true);
    setMessage("");
    try {
      const result = await runScScheduleSyncNow();
      if (result.skipped && result.reason === "not_configured") {
        setMessage(L.scSyncNotConfigured);
      } else if (result.ok === false && result.error) {
        setMessage(result.error);
      } else {
        setMessage(L.scSyncDone(Number(result.lastScheduleCount || 0)));
      }
      await loadScSyncStatus();
      if (scMappingOpen) {
        await loadScMappingStatus();
      }
      await loadAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : L.fail);
    } finally {
      setScSyncing(false);
    }
  }, [apiMode, scSyncing, loadAll, loadScSyncStatus, scMappingOpen, loadScMappingStatus]);

  const handleSaveScMapping = async (project: ScUnmappedProjectRow) => {
    const clientId = scMappingDrafts[project.scProjectId] || "";
    if (!clientId) return;
    setSaving(true);
    setMessage("");
    try {
      await saveScProjectClientMapping(project.scProjectId, clientId);
      setMessage(L.scMappingSaved);
      setScMappingDrafts((prev) => {
        const next = { ...prev };
        delete next[project.scProjectId];
        return next;
      });
      await loadScMappingStatus();
      await loadScSyncStatus();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : L.fail);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateScMapping = async (mapping: ScProjectMappingRow) => {
    const clientId = scMappingDrafts[`mapped:${mapping.scProjectId}`] || "";
    if (!clientId || String(mapping.clientId ?? "") === clientId) return;
    setSaving(true);
    setMessage("");
    try {
      await saveScProjectClientMapping(mapping.scProjectId, clientId);
      setMessage(L.scMappingSaved);
      setScMappingDrafts((prev) => {
        const next = { ...prev };
        delete next[`mapped:${mapping.scProjectId}`];
        return next;
      });
      await loadScMappingStatus();
      await loadScSyncStatus();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : L.fail);
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveScMapping = async (mapping: ScProjectMappingRow) => {
    setSaving(true);
    setMessage("");
    try {
      await removeScProjectClientMapping(mapping.scProjectId);
      setMessage(L.scMappingRemoved);
      await loadScMappingStatus();
      await loadScSyncStatus();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : L.fail);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadAll();
    }, 8000);
    return () => window.clearInterval(timer);
  }, [loadAll]);

  const inboxRequests = useMemo(
    () => requests.filter((row) => countsAsClientSiteRequestInbox(row)),
    [requests],
  );
  const doneRequests = useMemo(
    () =>
      requests.filter(
        (row) =>
          row.status === "confirmed" ||
          row.status === "rejected" ||
          row.status === "cancelled",
      ),
    [requests],
  );

  const filteredLinks = useMemo(() => {
    const query = linkSearch.trim().toLowerCase();
    return links.filter((link) => {
      if (linkClassFilter === "active" && link.disabled) return false;
      if (linkClassFilter === "disabled" && !link.disabled) return false;
      if (query && !String(link.clientName || "").toLowerCase().includes(query)) return false;
      return true;
    });
  }, [links, linkClassFilter, linkSearch]);

  const selectedIssueLink = useMemo(
    () => links.find((link) => String(link.clientId) === issueClientId) || null,
    [links, issueClientId],
  );

  const calendarModalLink = useMemo(
    () =>
      calendarModalClient
        ? links.find((link) => String(link.clientId) === String(calendarModalClient.clientId)) || null
        : null,
    [links, calendarModalClient],
  );

  const selectedClientLabel = useMemo(
    () => clientOptions.find((option) => option.value === selectedClientId)?.label || "",
    [clientOptions, selectedClientId],
  );

  const openClientCalendar = useCallback(
    (clientId: number | string, clientName: string) => {
      openCalendarForClient(setCalendarModalClient, clientId, clientName);
    },
    [],
  );

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setMessage(L.linkCopied);
    } catch {
      setMessage(text);
    }
  };

  const openLink = (link: { url?: string | null; token?: string | null }) => {
    const url = resolveClientSiteRequestLinkUrl(link);
    if (!url) {
      setMessage(L.fail);
      return;
    }
    openClientSiteRequestLink(url);
  };

  const handleIssueLink = async () => {
    if (!issueClientId) return;
    setSaving(true);
    setMessage("");
    try {
      const link = await ensureClientSiteRequestLink(issueClientId);
      setMessage(L.linkIssued);
      setLastIssuedUrl(resolveClientSiteRequestLinkUrl(link));
      await loadAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : L.fail);
    } finally {
      setSaving(false);
    }
  };

  const handleCopyIssueLink = async () => {
    if (!issueClientId) return;
    setSaving(true);
    setMessage("");
    try {
      const link = selectedIssueLink || (await ensureClientSiteRequestLink(issueClientId));
      const url = resolveClientSiteRequestLinkUrl(link);
      setLastIssuedUrl(url);
      await copyText(url);
      if (!selectedIssueLink) {
        setMessage(L.linkIssued);
        await loadAll();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : L.fail);
    } finally {
      setSaving(false);
    }
  };

  const handleRotateLink = async (clientId: number | string) => {
    setSaving(true);
    setMessage("");
    try {
      const link = await rotateClientSiteRequestLink(clientId);
      const url = resolveClientSiteRequestLinkUrl(link);
      setMessage(L.linkIssued);
      setLastIssuedUrl(url);
      await copyText(url);
      await loadAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : L.fail);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleLink = async (clientId: number | string, disabled: boolean) => {
    setSaving(true);
    setMessage("");
    try {
      await setClientSiteRequestLinkDisabled(clientId, disabled);
      await loadAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : L.fail);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateStatus = async (request: ClientSiteRequest, status: ClientSiteRequestStatus) => {
    setSaving(true);
    setMessage("");
    try {
      await updateClientSiteRequestStatus(request.id, {
        status,
        processNote: noteDrafts[request.id] ?? request.processNote ?? "",
      });
      setMessage(
        status === "cancelled"
          ? L.cancelled
          : status === "pending" && request.status === "cancel_pending"
            ? L.cancelDenied
            : status === "rejected"
              ? L.rejected
              : L.reopened,
      );
      await loadAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : L.fail);
    } finally {
      setSaving(false);
    }
  };

  const handleCompleteStep = async (request: ClientSiteRequest, step: ClientSiteRequestCompletionStep) => {
    setSaving(true);
    setMessage("");
    try {
      const updated = await updateClientSiteRequestStatus(request.id, {
        completionStep: step,
        processNote: noteDrafts[request.id] ?? request.processNote ?? "",
      });
      if (updated.status === "confirmed") {
        setMessage(L.updated);
      } else if (step === "receipt") {
        setMessage(L.updatedReceipt);
      } else {
        setMessage(L.updatedRegister);
      }
      await loadAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : L.fail);
    } finally {
      setSaving(false);
    }
  };

  const handleSendStaffMessage = async (request: ClientSiteRequest) => {
    const body = (chatDrafts[request.id] || "").trim();
    if (!body) return;
    setChatSendingId(request.id);
    setMessage("");
    try {
      await postStaffClientSiteRequestMessage(request.id, { body });
      setChatDrafts((prev) => ({ ...prev, [request.id]: "" }));
      await loadAll();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : L.messageFail);
    } finally {
      setChatSendingId("");
    }
  };

  if (!apiMode) {
    return (
      <Card className="rounded-2xl border-dashed border-slate-300 shadow-sm">
        <CardContent className="p-5 text-sm font-medium text-slate-500">{L.apiOnly}</CardContent>
      </Card>
    );
  }

  const tabItems: Array<{ key: PanelTab; label: string; count: number }> = [
    { key: "inbox", label: L.tabInbox, count: inboxRequests.length },
    { key: "done", label: L.tabDone, count: doneRequests.length },
    { key: "links", label: L.tabLinks, count: links.length },
  ];

  return (
    <>
    <Card className="rounded-2xl shadow-sm">
      <CardContent className="space-y-5 p-4 md:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex gap-2 rounded-2xl bg-slate-100 p-1">
            {tabItems.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`flex-1 rounded-xl px-3 py-2 text-sm font-bold sm:flex-none ${
                  activeTab === item.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                }`}
                onClick={() => setActiveTab(item.key)}
              >
                {item.label}
                {item.count > 0 ? ` (${item.count})` : ""}
              </button>
            ))}
          </div>
          <Button type="button" variant="outline" className="rounded-xl" onClick={() => void loadAll()} disabled={loading || saving}>
            <RefreshCw size={14} className={`mr-1 ${loading ? "animate-spin" : ""}`} />
            {L.refresh}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="rounded-xl"
            onClick={() => void handleScSync()}
            disabled={loading || saving || scSyncing || scSyncStatus?.configured === false}
            title={
              scSyncStatus?.lastSuccessAt
                ? `\uB9C8\uC9C0\uB9C9 \uB3D9\uAE30\uD654: ${scSyncStatus.lastSuccessAt}`
                : undefined
            }
          >
            <RefreshCw size={14} className={`mr-1 ${scSyncing ? "animate-spin" : ""}`} />
            {scSyncing ? L.scSyncing : L.scSync}
          </Button>
          <Button
            type="button"
            variant={scMappingOpen ? "default" : "outline"}
            className="rounded-xl"
            onClick={() => setScMappingOpen((prev) => !prev)}
            disabled={loading || saving || scSyncStatus?.configured === false}
          >
            <Link2 size={14} className="mr-1" />
            {L.scMapping}
            {scSyncStatus?.lastUnmappedProjectCount ? ` (${scSyncStatus.lastUnmappedProjectCount})` : ""}
          </Button>
        </div>

        {message ? <p className="text-sm font-semibold text-blue-700">{message}</p> : null}

        {scMappingOpen ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">{L.scMappingTitle}</h3>
                <p className="mt-1 text-xs text-slate-500">{L.scMappingDesc}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-xl"
                onClick={() => void loadScMappingStatus()}
                disabled={scMappingLoading || saving}
              >
                <RefreshCw size={13} className={`mr-1 ${scMappingLoading ? "animate-spin" : ""}`} />
                {L.refresh}
              </Button>
            </div>

            {scMappingLoading && !scMappingStatus ? (
              <p className="mt-3 text-sm text-slate-500">{L.loading}</p>
            ) : (
              <div className="mt-4 space-y-4">
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <h4 className="text-xs font-bold text-slate-700">{L.scUnmapped(scMappingStatus?.unmappedCount || 0)}</h4>
                  </div>
                  {!scMappingStatus?.unmapped.length ? (
                    <p className="text-sm text-slate-500">{L.scUnmappedEmpty}</p>
                  ) : (
                    <div className="space-y-2">
                      {scMappingStatus.unmapped.map((project) => (
                        <div
                          key={project.scProjectId}
                          className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50/70 p-3 lg:flex-row lg:items-center"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-slate-900">{project.scProjectName}</p>
                            {project.address ? <p className="text-xs text-slate-500">{project.address}</p> : null}
                          </div>
                          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:max-w-md">
                            <AutocompleteSelect
                              value={scMappingDrafts[project.scProjectId] || ""}
                              options={clientOptions}
                              placeholder={L.scPickMappingClient}
                              onChange={(value) =>
                                setScMappingDrafts((prev) => ({ ...prev, [project.scProjectId]: value }))
                              }
                              inputProps={{ className: "rounded-xl" }}
                            />
                            <Button
                              type="button"
                              size="sm"
                              className="rounded-xl"
                              disabled={!scMappingDrafts[project.scProjectId] || saving}
                              onClick={() => void handleSaveScMapping(project)}
                            >
                              {L.scSaveMapping}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <h4 className="mb-2 text-xs font-bold text-slate-700">
                    {"\uB4F1\uB85D\uB41C \uB9E4\uCE6D"} ({scMappingStatus?.mappedCount || 0})
                  </h4>
                  {!scMappingStatus?.mappings.length ? (
                    <p className="text-sm text-slate-500">{L.scMappedEmpty}</p>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                      <table className="erp-table w-full min-w-[640px] text-sm">
                        <thead>
                          <tr>
                            <th>{L.scProject}</th>
                            <th>{L.scMappedClient}</th>
                            <th>{L.scMappingType}</th>
                            <th>{L.actions}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {scMappingStatus.mappings.map((mapping) => {
                            const editKey = `mapped:${mapping.scProjectId}`;
                            const editClientId = scMappingDrafts[editKey] ?? String(mapping.clientId ?? "");
                            const canUpdate =
                              Boolean(editClientId) && String(mapping.clientId ?? "") !== editClientId;
                            return (
                              <tr key={mapping.scProjectId}>
                                <td className="font-semibold text-slate-900">{mapping.scProjectName}</td>
                                <td>
                                  <AutocompleteSelect
                                    value={editClientId}
                                    options={clientOptions}
                                    placeholder={L.scPickMappingClient}
                                    onChange={(value) =>
                                      setScMappingDrafts((prev) => ({ ...prev, [editKey]: value }))
                                    }
                                    inputProps={{ className: "rounded-xl min-w-[180px]" }}
                                  />
                                </td>
                                <td>
                                  <span
                                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ${
                                      mapping.manual ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600"
                                    }`}
                                  >
                                    {mapping.manual ? L.scMappingManual : L.scMappingAuto}
                                  </span>
                                </td>
                                <td>
                                  <div className="flex flex-wrap gap-1.5">
                                    <Button
                                      type="button"
                                      size="sm"
                                      className="rounded-lg"
                                      disabled={!canUpdate || saving}
                                      onClick={() => void handleUpdateScMapping(mapping)}
                                    >
                                      {L.scSaveMapping}
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      className="rounded-lg"
                                      disabled={saving}
                                      onClick={() => void handleRemoveScMapping(mapping)}
                                    >
                                      {L.scRemoveMapping}
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : null}

        {activeTab === "links" ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
              <h3 className="text-sm font-bold text-slate-900">{L.linkIssueTitle}</h3>
              <p className="mt-1 text-xs text-slate-500">{L.linkIssueDesc}</p>
              <div className="mt-3 space-y-3">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold text-slate-600">{L.pickClient}</span>
                  <AutocompleteSelect
                    value={issueClientId}
                    options={clientOptions}
                    placeholder={L.pickClient}
                    onChange={setIssueClientId}
                    inputProps={{ className: "rounded-xl" }}
                  />
                </label>

                {selectedIssueLink ? (
                  <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                    <p className="text-xs font-bold text-slate-500">{L.linkUrl}</p>
                    <button
                      type="button"
                      className="mt-1 block w-full break-all text-left text-sm font-semibold text-blue-700 underline decoration-blue-300 underline-offset-2 hover:text-blue-900"
                      onClick={() => openLink(selectedIssueLink)}
                    >
                      {resolveClientSiteRequestLinkUrl(selectedIssueLink)}
                    </button>
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <Button type="button" className="rounded-xl" disabled={!issueClientId || saving} onClick={() => void handleIssueLink()}>
                    <Link2 size={14} className="mr-1" />
                    {L.issueLink}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-xl"
                    disabled={!issueClientId || saving}
                    onClick={() => void handleCopyIssueLink()}
                  >
                    <Copy size={14} className="mr-1" />
                    {L.copyLink}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-xl"
                    disabled={!issueClientId || saving || (!selectedIssueLink && !lastIssuedUrl)}
                    noFeedback
                    onClick={() => {
                      if (selectedIssueLink) {
                        openLink(selectedIssueLink);
                        return;
                      }
                      if (lastIssuedUrl) openClientSiteRequestLink(lastIssuedUrl);
                    }}
                  >
                    <Link2 size={14} className="mr-1" />
                    {L.openLink}
                  </Button>
                </div>
              </div>
            </div>

            {lastIssuedUrl ? (
              <div className="flex flex-col gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-emerald-800">{L.linkUrl}</p>
                  <button
                    type="button"
                    className="mt-1 block w-full break-all text-left text-sm font-semibold text-emerald-900 underline decoration-emerald-400 underline-offset-2 hover:text-emerald-700"
                    onClick={() => openClientSiteRequestLink(lastIssuedUrl)}
                  >
                    {lastIssuedUrl}
                  </button>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button type="button" size="sm" variant="outline" className="rounded-xl" onClick={() => void copyText(lastIssuedUrl)}>
                    <Copy size={14} className="mr-1" />
                    {L.copyLink}
                  </Button>
                  <Button type="button" size="sm" className="rounded-xl" noFeedback onClick={() => openClientSiteRequestLink(lastIssuedUrl)}>
                    <Link2 size={14} className="mr-1" />
                    {L.openLink}
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["all", L.linkClassAll],
                    ["active", L.linkClassActive],
                    ["disabled", L.linkClassDisabled],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    className={`rounded-xl px-3 py-1.5 text-xs font-bold ${
                      linkClassFilter === key ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"
                    }`}
                    onClick={() => setLinkClassFilter(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <Input
                value={linkSearch}
                onChange={(event) => setLinkSearch(event.target.value)}
                placeholder={L.linkSearchPh}
                className="max-w-xs rounded-xl"
              />
            </div>

            {loading && !links.length ? (
              <p className="text-sm text-slate-500">{L.loading}</p>
            ) : !filteredLinks.length ? (
              <p className="text-sm text-slate-500">{L.emptyLinks}</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="erp-table w-full min-w-[720px] text-sm">
                  <thead>
                    <tr>
                      <th>{L.client}</th>
                      <th>{L.linkUrl}</th>
                      <th>{L.status}</th>
                      <th>{L.actions}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLinks.map((link) => (
                      <tr key={String(link.clientId)}>
                        <td className="font-semibold text-slate-900">
                          {link.clientName}
                          {link.pendingCount > 0 ? (
                            <span className="ml-2 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
                              {L.pendingBadge(link.pendingCount)}
                            </span>
                          ) : null}
                        </td>
                        <td className="max-w-[280px]">
                          <button
                            type="button"
                            className="block max-w-full truncate text-left text-sm font-semibold text-blue-700 underline decoration-blue-300 underline-offset-2 hover:text-blue-900"
                            title={resolveClientSiteRequestLinkUrl(link)}
                            onClick={() => openLink(link)}
                          >
                            {resolveClientSiteRequestLinkUrl(link)}
                          </button>
                        </td>
                        <td>
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ${
                              link.disabled ? "bg-slate-100 text-slate-500" : "bg-emerald-100 text-emerald-700"
                            }`}
                          >
                            {link.disabled ? L.linkDisabled : L.linkActive}
                          </span>
                        </td>
                        <td>
                          <div className="flex flex-wrap gap-1.5">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="rounded-lg"
                              noFeedback
                              onClick={() => openClientCalendar(link.clientId, link.clientName)}
                            >
                              <CalendarDays size={13} className="mr-1" />
                              {L.calendarTitle}
                            </Button>
                            <Button type="button" size="sm" variant="outline" className="rounded-lg" noFeedback onClick={() => openLink(link)}>
                              <Link2 size={13} className="mr-1" />
                              {L.openLink}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="rounded-lg"
                              onClick={() => void copyText(resolveClientSiteRequestLinkUrl(link))}
                            >
                              <Copy size={13} className="mr-1" />
                              {L.copyLink}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="rounded-lg"
                              disabled={saving}
                              onClick={() => void handleRotateLink(link.clientId)}
                            >
                              <RotateCcw size={13} className="mr-1" />
                              {L.rotateLink}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="rounded-lg"
                              disabled={saving}
                              onClick={() => void handleToggleLink(link.clientId, !link.disabled)}
                            >
                              {link.disabled ? L.enableLink : L.disableLink}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-slate-500">{L.filterClient}</span>
              <select
                className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                value={selectedClientId}
                onChange={(event) => setSelectedClientId(event.target.value)}
              >
                <option value="">{L.filterAllClients}</option>
                {clientOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {selectedClientId ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="rounded-lg"
                  noFeedback
                  onClick={() => openClientCalendar(selectedClientId, selectedClientLabel)}
                >
                  <CalendarDays size={14} className="mr-1" />
                  {L.calendarTitle}
                </Button>
              ) : null}
            </div>

            {loading && !requests.length ? (
              <p className="text-sm text-slate-500">{L.loading}</p>
            ) : activeTab === "inbox" && !inboxRequests.length ? (
              <div className="space-y-3">
                <p className="text-sm text-slate-500">{L.emptyInbox}</p>
                {selectedClientId ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="erp-touch-target rounded-xl"
                    noFeedback
                    onClick={() => openClientCalendar(selectedClientId, selectedClientLabel)}
                  >
                    <CalendarDays size={16} className="mr-1.5" />
                    {L.calendarTitle}
                  </Button>
                ) : null}
              </div>
            ) : activeTab === "done" && !doneRequests.length ? (
              <p className="text-sm text-slate-500">{L.emptyDone}</p>
            ) : (
              <div className="space-y-3">
                {(activeTab === "inbox" ? inboxRequests : doneRequests).map((request) => (
                  <RequestCard
                    key={request.id}
                    request={request}
                    noteDrafts={noteDrafts}
                    chatDrafts={chatDrafts}
                    chatSendingId={chatSendingId}
                    saving={saving}
                    showActions={activeTab === "inbox"}
                    onNoteChange={(id, value) => setNoteDrafts((prev) => ({ ...prev, [id]: value }))}
                    onChatDraftChange={(id, value) => setChatDrafts((prev) => ({ ...prev, [id]: value }))}
                    onSendMessage={handleSendStaffMessage}
                    onUpdateStatus={(row, status) => void handleUpdateStatus(row, status)}
                    onCompleteStep={(row, step) => void handleCompleteStep(row, step)}
                    onClientNameClick={(row) => openClientCalendar(row.clientId, row.clientName)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>

    </Card>

      {calendarModalClient ? (
        <ClientSiteRequestCalendarModal
          open
          clientId={calendarModalClient.clientId}
          clientName={calendarModalClient.clientName}
          link={calendarModalLink}
          canSendScAlimtalk={isAdmin}
          onClose={() => setCalendarModalClient(null)}
        />
      ) : null}
    </>
  );
}
