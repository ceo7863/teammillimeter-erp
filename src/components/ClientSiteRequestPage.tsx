import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { KoreanDateInput } from "@/components/KoreanDateInput";
import { ClientSiteRequestChat } from "@/components/ClientSiteRequestChat";
import {
  clientSiteRequestStatusLabel,
  fetchPublicClientSiteRequestInfo,
  listPublicClientSiteRequests,
  postPublicClientSiteRequestMessage,
  submitPublicClientSiteRequest,
  type ClientSiteRequest,
  type PublicClientSiteRequestInfo,
} from "@/utils/clientSiteRequests";

const L = {
  pageTitle: "\uD604\uC7A5 \uC811\uC218",
  pageDesc: "\uD300\uBC00\uB9AC\uBBF8\uD130 \uC77C\uC815 \uC811\uC218 \uD398\uC774\uC9C0\uC785\uB2C8\uB2E4.",
  tabNew: "\uC0C8 \uC811\uC218",
  tabHistory: "\uC811\uC218 \uB0B4\uC5ED \u00B7 \uCC44\uD305",
  client: "\uAC70\uB798\uCC98",
  workDate: "\uC791\uC5C5 \uC77C\uC790",
  siteName: "\uD604\uC7A5\uBA85",
  workerCount: "\uD544\uC694 \uC778\uC6D0",
  memo: "\uBE44\uACE0",
  contactName: "\uC791\uC131\uC790 \uC131\uD568",
  contactPhone: "\uC5F0\uB77D\uCC98",
  submit: "\uC811\uC218 \uC694\uCCAD",
  submitting: "\uC811\uC218 \uC911...",
  loading: "\uB85C\uB529 \uC911...",
  loadFail: "\uC811\uC218 \uB9C1\uD06C\uB97C \uBD88\uB7EC\uC62C \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.",
  needDate: "\uC791\uC5C5 \uC77C\uC790\uB97C \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.",
  needSite: "\uD604\uC7A5\uBA85\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694.",
  needWorkers: "\uD544\uC694 \uC778\uC6D0\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694.",
  submitFail: "\uC811\uC218\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.",
  doneTitle: "\uC811\uC218\uAC00 \uC644\uB8CC\uB418\uC5C8\uC2B5\uB2C8\uB2E4",
  doneBody: "\uB2F4\uB2F9\uC790\uC640 \uCC44\uD305\uC73C\uB85C \uC774\uC5B4\uC11C \uD655\uC778\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
  openChat: "\uCC44\uD305 \uBC14\uB85C\uAC00\uAE30",
  emptyHistory: "\uC811\uC218 \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  workerCountPh: "\uC608: 5",
  memoPh: "\uC791\uC5C5 \uB0B4\uC6A9, \uC2DC\uAC04, \uD2B9\uC774\uC0AC\uD56D \uB4F1",
  messageFail: "\uBA54\uC2DC\uC9C0 \uC804\uC1A1\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.",
};

type ClientSiteRequestPageProps = {
  token: string;
};

type PageTab = "new" | "history";

export function ClientSiteRequestPage({ token }: ClientSiteRequestPageProps) {
  const [info, setInfo] = useState<PublicClientSiteRequestInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [doneRequestId, setDoneRequestId] = useState("");
  const [tab, setTab] = useState<PageTab>("new");
  const [requests, setRequests] = useState<ClientSiteRequest[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState("");
  const [messageDraft, setMessageDraft] = useState("");
  const [messageSending, setMessageSending] = useState(false);
  const [workDate, setWorkDate] = useState("");
  const [siteName, setSiteName] = useState("");
  const [workerCount, setWorkerCount] = useState("");
  const [memo, setMemo] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");

  const selectedRequest = useMemo(
    () => requests.find((row) => row.id === selectedRequestId) || null,
    [requests, selectedRequestId],
  );

  const loadInfo = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const next = await fetchPublicClientSiteRequestInfo(token);
      setInfo(next);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : L.loadFail);
      setInfo(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const loadRequests = useCallback(async () => {
    try {
      const rows = await listPublicClientSiteRequests(token);
      setRequests(rows);
      setSelectedRequestId((current) => {
        if (current && rows.some((row) => row.id === current)) return current;
        return rows[0]?.id || "";
      });
    } catch {
      // ignore polling errors
    }
  }, [token]);

  useEffect(() => {
    void loadInfo();
  }, [loadInfo]);

  useEffect(() => {
    if (!info) return;
    void loadRequests();
  }, [info, loadRequests]);

  useEffect(() => {
    if (tab !== "history" || !info) return;
    const timer = window.setInterval(() => {
      void loadRequests();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [tab, info, loadRequests]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!workDate.trim()) {
      setError(L.needDate);
      return;
    }
    if (!siteName.trim()) {
      setError(L.needSite);
      return;
    }
    const count = Number.parseInt(workerCount, 10);
    if (!Number.isFinite(count) || count < 1) {
      setError(L.needWorkers);
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const request = await submitPublicClientSiteRequest(token, {
        workDate: workDate.trim(),
        siteName: siteName.trim(),
        workerCount: count,
        memo: memo.trim(),
        contactName: contactName.trim(),
        contactPhone: contactPhone.trim(),
      });
      setDoneRequestId(request.id);
      setSelectedRequestId(request.id);
      setWorkDate("");
      setSiteName("");
      setWorkerCount("");
      setMemo("");
      await loadRequests();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : L.submitFail);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendMessage = async () => {
    if (!selectedRequestId || !messageDraft.trim()) return;
    setMessageSending(true);
    setError("");
    try {
      await postPublicClientSiteRequestMessage(token, selectedRequestId, {
        body: messageDraft.trim(),
        senderName: contactName.trim(),
      });
      setMessageDraft("");
      await loadRequests();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : L.messageFail);
    } finally {
      setMessageSending(false);
    }
  };

  if (loading) {
    return (
      <div className="erp-public-page flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <Card className="w-full max-w-lg rounded-2xl shadow-sm">
          <CardContent className="p-8 text-center text-sm font-medium text-slate-500">{L.loading}</CardContent>
        </Card>
      </div>
    );
  }

  if (!info) {
    return (
      <div className="erp-public-page flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <Card className="w-full max-w-lg rounded-2xl shadow-sm">
          <CardContent className="p-8 text-center text-sm font-semibold text-red-600">{error || L.loadFail}</CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="erp-public-page min-h-screen bg-slate-50 p-4 py-8">
      <div className="mx-auto w-full max-w-2xl">
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="space-y-5 p-6 md:p-8">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{info.companyName}</p>
              <h1 className="mt-1 text-2xl font-bold text-slate-900">{L.pageTitle}</h1>
              <p className="mt-1 text-sm text-slate-600">{L.pageDesc}</p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-xs font-bold text-slate-500">{L.client}</div>
              <div className="text-lg font-bold text-slate-900">{info.clientName}</div>
            </div>

            <div className="flex gap-2 rounded-2xl bg-slate-100 p-1">
              <button
                type="button"
                className={`flex-1 rounded-xl px-3 py-2 text-sm font-bold ${tab === "new" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
                onClick={() => setTab("new")}
              >
                {L.tabNew}
              </button>
              <button
                type="button"
                className={`flex-1 rounded-xl px-3 py-2 text-sm font-bold ${tab === "history" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
                onClick={() => {
                  setTab("history");
                  void loadRequests();
                }}
              >
                {L.tabHistory}
              </button>
            </div>

            {doneRequestId && tab === "new" ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-center">
                <CheckCircle2 size={32} className="mx-auto text-emerald-500" />
                <div className="mt-2 text-base font-bold text-emerald-900">{L.doneTitle}</div>
                <p className="mt-1 text-sm text-emerald-800">{L.doneBody}</p>
                <Button type="button" className="mt-3 rounded-xl" onClick={() => setTab("history")}>
                  {L.openChat}
                </Button>
              </div>
            ) : null}

            {tab === "new" ? (
              <form className="space-y-4" onSubmit={handleSubmit}>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-semibold text-slate-700">{L.workDate}</span>
                  <KoreanDateInput value={workDate} onChange={setWorkDate} className="w-full" />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-semibold text-slate-700">{L.siteName}</span>
                  <Input value={siteName} onChange={(event) => setSiteName(event.target.value)} placeholder={L.siteName} />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-semibold text-slate-700">{L.workerCount}</span>
                  <Input
                    type="number"
                    min={1}
                    max={999}
                    inputMode="numeric"
                    value={workerCount}
                    onChange={(event) => setWorkerCount(event.target.value)}
                    placeholder={L.workerCountPh}
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-semibold text-slate-700">{L.memo}</span>
                  <textarea
                    className="erp-input min-h-[96px] w-full rounded-2xl border bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-900"
                    value={memo}
                    onChange={(event) => setMemo(event.target.value)}
                    placeholder={L.memoPh}
                  />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-semibold text-slate-700">{L.contactName}</span>
                    <Input value={contactName} onChange={(event) => setContactName(event.target.value)} placeholder={L.contactName} />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-semibold text-slate-700">{L.contactPhone}</span>
                    <Input
                      value={contactPhone}
                      onChange={(event) => setContactPhone(event.target.value)}
                      placeholder="010-0000-0000"
                    />
                  </label>
                </div>

                {error ? <p className="text-sm font-semibold text-red-600">{error}</p> : null}

                <Button type="submit" className="w-full rounded-2xl" disabled={submitting}>
                  {submitting ? L.submitting : L.submit}
                </Button>
              </form>
            ) : (
              <div className="space-y-4">
                {!requests.length ? (
                  <p className="text-sm text-slate-500">{L.emptyHistory}</p>
                ) : (
                  <>
                    <div className="space-y-2">
                      {requests.map((request) => (
                        <button
                          key={request.id}
                          type="button"
                          className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                            selectedRequestId === request.id
                              ? "border-slate-900 bg-slate-900 text-white"
                              : "border-slate-200 bg-white text-slate-900 hover:bg-slate-50"
                          }`}
                          onClick={() => setSelectedRequestId(request.id)}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold">{request.siteName}</span>
                            <span className="text-xs font-semibold opacity-80">
                              {clientSiteRequestStatusLabel(request.status)}
                            </span>
                          </div>
                          <div className="mt-1 text-xs opacity-80">
                            {request.workDate}
                            {" \u00B7 "}
                            {request.workerCount}
                            {"\uBA85"}
                          </div>
                        </button>
                      ))}
                    </div>

                    {selectedRequest ? (
                      <ClientSiteRequestChat
                        messages={selectedRequest.messages || []}
                        draft={messageDraft}
                        onDraftChange={setMessageDraft}
                        onSend={() => void handleSendMessage()}
                        sending={messageSending}
                        viewer="client"
                      />
                    ) : null}
                  </>
                )}
                {error ? <p className="text-sm font-semibold text-red-600">{error}</p> : null}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
