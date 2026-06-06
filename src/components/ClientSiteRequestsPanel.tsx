import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Copy, Link2, RefreshCw, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AutocompleteSelect } from "@/components/AutocompleteInput";
import { isApiModeEnabled } from "@/utils/erpApi";
import {
  clientSiteRequestStatusLabel,
  ensureClientSiteRequestLink,
  formatClientSiteRequestWorkPeriod,
  listClientSiteRequestLinks,
  listClientSiteRequests,
  openClientSiteRequestLink,
  postStaffClientSiteRequestMessage,
  resolveClientSiteRequestLinkUrl,
  rotateClientSiteRequestLink,
  setClientSiteRequestLinkDisabled,
  updateClientSiteRequestStatus,
  type ClientSiteRequest,
  type ClientSiteRequestLink,
  type ClientSiteRequestStatus,
} from "@/utils/clientSiteRequests";
import { ClientSiteRequestCalendarModal } from "@/components/ClientSiteRequestCalendarModal";
import { ClientSiteRequestChat } from "@/components/ClientSiteRequestChat";

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
  confirm: "\uCC98\uB9AC \uC644\uB8CC",
  reject: "\uBC18\uB824",
  reopen: "\uB300\uAE30 \uBCF5\uADC0",
  processNotePh: "\uB0B4\uBD80 \uBA54\uBAA8 (\uAC70\uB798\uCC98 \uBE44\uACF5\uAC1C)",
  processedBy: "\uCC98\uB9AC\uC790",
  linkCopied: "\uB9C1\uD06C\uB97C \uBCF5\uC0AC\uD588\uC2B5\uB2C8\uB2E4.",
  linkIssued: "\uB9C1\uD06C\uAC00 \uBC1C\uAE09\uB418\uC5C8\uC2B5\uB2C8\uB2E4.",
  updated: "\uCC98\uB9AC \uC644\uB8CC.",
  fail: "\uC694\uCCAD \uCC98\uB9AC\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.",
  messageFail: "\uBA54\uC2DC\uC9C0 \uC804\uC1A1\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.",
  unreadChat: "\uC0C8 \uBA54\uC2DC\uC9C0",
  calendarTitle: "\uC811\uC218 \uCE98\uB9B0\uB354",
};

type ClientLike = {
  id?: number | string;
  name?: string;
};

type PanelTab = "inbox" | "done" | "links";
type LinkClassFilter = "all" | "active" | "disabled";

type ClientSiteRequestsPanelProps = {
  clients: ClientLike[];
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
  onClientNameClick?: (request: ClientSiteRequest) => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            {onClientNameClick ? (
              <button
                type="button"
                className="text-base font-bold text-blue-700 underline decoration-blue-300 underline-offset-2 hover:text-blue-900"
                title={L.calendarTitle}
                onClick={() => onClientNameClick(request)}
              >
                {request.clientName}
              </button>
            ) : (
              <span className="text-base font-bold text-slate-900">{request.clientName}</span>
            )}
            <span
              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ${
                request.status === "pending"
                  ? "bg-amber-100 text-amber-800"
                  : request.status === "confirmed"
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-red-100 text-red-700"
              }`}
            >
              {clientSiteRequestStatusLabel(request.status)}
            </span>
            {request.unreadByStaff ? (
              <span className="inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700">
                {L.unreadChat}
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
            <div className="flex flex-wrap gap-1.5">
              {request.status !== "confirmed" ? (
                <Button
                  type="button"
                  size="sm"
                  className="rounded-lg"
                  disabled={saving}
                  onClick={() => onUpdateStatus(request, "confirmed")}
                >
                  <Check size={13} className="mr-1" />
                  {L.confirm}
                </Button>
              ) : null}
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
          </div>
        ) : (
          <div className="w-full max-w-sm">
            {request.processNote ? (
              <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">{request.processNote}</p>
            ) : null}
            {request.status !== "pending" ? (
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

export function ClientSiteRequestsPanel({ clients }: ClientSiteRequestsPanelProps) {
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

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadAll();
    }, 8000);
    return () => window.clearInterval(timer);
  }, [loadAll]);

  const inboxRequests = useMemo(
    () => requests.filter((row) => row.status === "pending"),
    [requests],
  );
  const doneRequests = useMemo(
    () => requests.filter((row) => row.status === "confirmed" || row.status === "rejected"),
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
      setMessage(L.updated);
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
        </div>

        {message ? <p className="text-sm font-semibold text-blue-700">{message}</p> : null}

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
            </div>

            {loading && !requests.length ? (
              <p className="text-sm text-slate-500">{L.loading}</p>
            ) : activeTab === "inbox" && !inboxRequests.length ? (
              <p className="text-sm text-slate-500">{L.emptyInbox}</p>
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
                    onClientNameClick={(row) =>
                      setCalendarModalClient({ clientId: row.clientId, clientName: row.clientName })
                    }
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>

      {calendarModalClient ? (
        <ClientSiteRequestCalendarModal
          open
          clientId={calendarModalClient.clientId}
          clientName={calendarModalClient.clientName}
          link={calendarModalLink}
          onClose={() => setCalendarModalClient(null)}
        />
      ) : null}
    </Card>
  );
}
