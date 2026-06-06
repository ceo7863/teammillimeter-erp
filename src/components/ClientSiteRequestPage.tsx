import React, { useCallback, useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { KoreanDateInput } from "@/components/KoreanDateInput";
import {
  fetchPublicClientSiteRequestInfo,
  submitPublicClientSiteRequest,
  type PublicClientSiteRequestInfo,
} from "@/utils/clientSiteRequests";

const L = {
  pageTitle: "\uD604\uC7A5 \uC811\uC218",
  pageDesc: "\uD300\uBC00\uB9AC\uBBF8\uD130 \uC77C\uC815 \uC811\uC218 \uD398\uC774\uC9C0\uC785\uB2C8\uB2E4.",
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
  doneBody: "\uB2F4\uB2F9\uC790\uAC00 \uD655\uC778 \uD6C4 \uCC98\uB9AC\uD569\uB2C8\uB2E4. \uCC3D\uC744 \uB2EB\uC73C\uC2DC\uBA74 \uB429\uB2C8\uB2E4.",
};

type ClientSiteRequestPageProps = {
  token: string;
};

export function ClientSiteRequestPage({ token }: ClientSiteRequestPageProps) {
  const [info, setInfo] = useState<PublicClientSiteRequestInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [workDate, setWorkDate] = useState("");
  const [siteName, setSiteName] = useState("");
  const [workerCount, setWorkerCount] = useState("");
  const [memo, setMemo] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");

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

  useEffect(() => {
    void loadInfo();
  }, [loadInfo]);

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
      await submitPublicClientSiteRequest(token, {
        workDate: workDate.trim(),
        siteName: siteName.trim(),
        workerCount: count,
        memo: memo.trim(),
        contactName: contactName.trim(),
        contactPhone: contactPhone.trim(),
      });
      setDone(true);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : L.submitFail);
    } finally {
      setSubmitting(false);
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

  if (done) {
    return (
      <div className="erp-public-page flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <Card className="w-full max-w-lg rounded-2xl shadow-sm">
          <CardContent className="space-y-4 p-8 text-center">
            <CheckCircle2 size={48} className="mx-auto text-emerald-500" />
            <h1 className="text-xl font-bold text-slate-900">{L.doneTitle}</h1>
            <p className="text-sm text-slate-600">{L.doneBody}</p>
          </CardContent>
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
      <div className="mx-auto w-full max-w-lg">
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
                  placeholder="?: 5"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-slate-700">{L.memo}</span>
                <textarea
                  className="erp-input min-h-[96px] w-full rounded-2xl border bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-900"
                  value={memo}
                  onChange={(event) => setMemo(event.target.value)}
                  placeholder="?? ??, ??, ???? ?"
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
