import React, { useCallback, useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { WorkerPortalSignaturePad } from "@/components/WorkerPortalSignaturePad";
import {
  fetchPublicContractSignInfo,
  publicContractPdfUrl,
  submitPublicContractSignature,
  type PublicClientContractSignInfo,
} from "@/utils/clientContracts";

const L = {
  loadFail: "\uACC4\uC57D \uC815\uBCF4\uB97C \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.",
  needName: "\uC11C\uBA85\uC790 \uC131\uD568\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694.",
  needSign: "\uC11C\uBA85\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694.",
  saveFail: "\uC11C\uBA85 \uC800\uC7A5\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.",
  pageTitle: "\uACC4\uC57D \uC804\uC790\uC11C\uBA85",
  pageDesc: "\uD300\uBC00\uB9AC\uBBF8\uD130 \uAC70\uB798\uCC98 \uACC4\uC57D\uC11C\uC785\uB2C8\uB2E4.",
  loading: "\uACC4\uC57D\uC11C\uB97C \uBD88\uB7EC\uC624\uB294 \uC911...",
  doneTitle: "\uC11C\uBA85\uC774 \uC644\uB8CC\uB418\uC5C8\uC2B5\uB2C8\uB2E4",
  doneBody: "\uC5D0 \uC815\uC0C1\uC801\uC73C\uB85C \uC11C\uBA85\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uCC3D\uC744 \uB2EB\uC73C\uC2DC\uBA74 \uB429\uB2C8\uB2E4.",
  client: "\uAC70\uB798\uCC98",
  contract: "\uACC4\uC57D",
  expires: "\uC11C\uBA85 \uB9C1\uD06C \uB9CC\uB8CC: ",
  signer: "\uC11C\uBA85\uC790 \uC131\uD568",
  signerPh: "\uC131\uD568",
  sign: "\uC11C\uBA85",
  saving: "\uC800\uC7A5 \uC911...",
  submit: "\uC11C\uBA85 \uC644\uB8CC",
};

type ClientContractSignPageProps = {
  token: string;
};

export function ClientContractSignPage({ token }: ClientContractSignPageProps) {
  const [info, setInfo] = useState<PublicClientContractSignInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [signedByName, setSignedByName] = useState("");
  const [signatureDataUrl, setSignatureDataUrl] = useState("");

  const loadInfo = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await fetchPublicContractSignInfo(token);
      setInfo(result);
      setSignedByName(result.contactName || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : L.loadFail);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadInfo();
  }, [loadInfo]);

  const handleSubmit = async () => {
    if (!signedByName.trim()) {
      setError(L.needName);
      return;
    }
    if (!signatureDataUrl) {
      setError(L.needSign);
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await submitPublicContractSignature(token, {
        signedByName: signedByName.trim(),
        signatureDataUrl,
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : L.saveFail);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 p-4 text-slate-900 sm:p-6" lang="ko">
      <div className="mx-auto max-w-3xl">
        <div className="mb-5 text-center">
          <img src="/team-millimeter-login-logo.jpg" alt="TEAM MILLIMETER" className="mx-auto mb-3 h-12 w-auto rounded-xl" />
          <h1 className="erp-text-section">{L.pageTitle}</h1>
          <p className="erp-text-caption mt-1 text-slate-500">{L.pageDesc}</p>
        </div>

        {loading ? (
          <Card className="rounded-2xl shadow-sm">
            <CardContent className="p-8 text-center text-slate-500">{L.loading}</CardContent>
          </Card>
        ) : done ? (
          <Card className="rounded-2xl shadow-sm">
            <CardContent className="p-8 text-center">
              <CheckCircle2 size={48} className="mx-auto text-emerald-600" />
              <h2 className="erp-text-section mt-4">{L.doneTitle}</h2>
              <p className="erp-text-body mt-2 text-slate-600">{(info?.title || "\uACC4\uC57D\uC11C") + L.doneBody}</p>
            </CardContent>
          </Card>
        ) : error && !info ? (
          <Card className="rounded-2xl shadow-sm">
            <CardContent className="p-8 text-center">
              <p className="erp-text-body font-semibold text-red-600">{error}</p>
            </CardContent>
          </Card>
        ) : info ? (
          <div className="space-y-4">
            <Card className="rounded-2xl shadow-sm">
              <CardContent className="p-5">
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <div className="erp-text-caption text-slate-500">{L.client}</div>
                    <div className="erp-text-body font-bold">{info.clientName}</div>
                  </div>
                  <div>
                    <div className="erp-text-caption text-slate-500">{L.contract}</div>
                    <div className="erp-text-body font-bold">{info.title}</div>
                  </div>
                </div>
                {info.tokenExpiresAt ? (
                  <p className="erp-text-caption mt-3 text-amber-700">{L.expires + new Date(info.tokenExpiresAt).toLocaleString("ko-KR")}</p>
                ) : null}
              </CardContent>
            </Card>

            <Card className="rounded-2xl shadow-sm">
              <CardContent className="p-3 sm:p-4">
                <iframe
                  title={info.originalFileName}
                  src={publicContractPdfUrl(token)}
                  className="h-[52vh] min-h-[320px] w-full rounded-xl border border-slate-200 bg-white"
                />
              </CardContent>
            </Card>

            <Card className="rounded-2xl shadow-sm">
              <CardContent className="space-y-4 p-5">
                <div>
                  <label className="erp-text-caption mb-1 block font-semibold text-slate-600">{L.signer}</label>
                  <Input value={signedByName} onChange={(e) => setSignedByName(e.target.value)} placeholder={L.signerPh} />
                </div>
                <div>
                  <label className="erp-text-caption mb-2 block font-semibold text-slate-600">{L.sign}</label>
                  <WorkerPortalSignaturePad onChange={setSignatureDataUrl} disabled={submitting} />
                </div>
                {error ? <p className="erp-text-caption font-semibold text-red-600">{error}</p> : null}
                <Button className="w-full rounded-2xl py-6 text-base font-bold" onClick={() => void handleSubmit()} disabled={submitting}>
                  {submitting ? L.saving : L.submit}
                </Button>
              </CardContent>
            </Card>
          </div>
        ) : null}
      </div>
    </div>
  );
}
