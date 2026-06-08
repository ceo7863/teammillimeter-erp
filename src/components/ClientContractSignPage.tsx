import React, { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { WorkerPortalSignaturePad } from "@/components/WorkerPortalSignaturePad";
import {
  downloadPublicSignedContractPdf,
  fetchPublicContractSignInfo,
  publicContractPreviewUrl,
  submitPublicContractSignature,
  verifyPublicContractPhone,
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
  doneBody: "\uC5D0 \uC815\uC0C1\uC801\uC73C\uB85C \uC11C\uBA85\uB418\uC5C8\uC2B5\uB2C8\uB2E4.",
  download: "\uACC4\uC57D\uC11C \uB2E4\uC6B4\uBC1B\uAE30",
  downloading: "\uB2E4\uC6B4\uB85C\uB4DC \uC911...",
  downloadFail: "\uACC4\uC57D\uC11C \uB2E4\uC6B4\uB85C\uB4DC\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.",
  downloadMissing: "\uC11C\uBA85\uB41C \uACC4\uC57D\uC11C \uD30C\uC77C\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.",
  client: "\uAC70\uB798\uCC98",
  contract: "\uACC4\uC57D",
  expires: "\uC11C\uBA85 \uB9C1\uD06C \uB9CC\uB8CC: ",
  signer: "\uC11C\uBA85\uC790 \uC131\uD568",
  signerPh: "\uC131\uD568",
  sign: "\uC11C\uBA85",
  saving: "\uC800\uC7A5 \uC911...",
  submit: "\uC11C\uBA85 \uC644\uB8CC",
  prevPage: "\uC774\uC804",
  nextPage: "\uB2E4\uC74C",
  pageLabel: "\uCABD",
  legal1:
    "\u203B \uC0C1\uAE30 \uAE08\uC561\uC740 \uBD80\uAC00\uAC00\uCE58\uC138 \uBCC4\uB3C4 \uAE30\uC900\uC774\uBA70, \uBCC4\uB3C4 \uC11C\uBA74 \uD569\uC758\uAC00 \uC5C6\uB294 \uD55C \uBCF8 \uB2E8\uAC00\uB97C \uC801\uC6A9\uD55C\uB2E4.",
  legal2:
    "\u203B \uBCF8 \uD611\uC57D\uC11C\uB294 \uC804\uC790\uBB38\uC11C \uBC0F \uC804\uC790\uC11C\uBA85 \uAD00\uB828 \uBC95\uB839\uC5D0 \uB530\uB77C \uC804\uC790\uC11C\uBA85\uC73C\uB85C \uCCB4\uACB0\uD560 \uC218 \uC788\uC73C\uBA70, \uC804\uC790\uC11C\uBA85\uB41C \uBB38\uC11C\uB294 \uC790\uD544\uC11C\uBA85 \uB610\uB294 \uB0A0\uC778\uD55C \uBB38\uC11C\uC640 \uB3D9\uC77C\uD55C \uD6A8\uB825\uC744 \uAC00\uC9C4\uB2E4.",
  phoneVerifyTitle: "\uC218\uC2E0 \uD734\uB300\uD3F0 \uD655\uC778",
  phoneVerifyDesc: "\uC54C\uB9BC\uD1A1\uC744 \uBC1B\uC740 \uD734\uB300\uD3F0 \uBC88\uD638 \uB204\uC801 4\uC790\uB9AC\uB97C \uC785\uB825\uD574 \uC8FC\uC138\uC694.",
  phoneLast4: "\uB204\uC801 4\uC790\uB9AC",
  phoneLast4Ph: "0000",
  phoneVerifyBtn: "\uD655\uC778",
  phoneVerifying: "\uD655\uC778 \uC911...",
  needPhoneLast4: "\uD734\uB300\uD3F0 \uBC88\uD638 \uB204\uC801 4\uC790\uB9AC\uB97C \uC785\uB825\uD574 \uC8FC\uC138\uC694.",
  phoneVerifyFail: "\uD734\uB300\uD3F0 \uBC88\uD638 \uB204\uC801 4\uC790\uB9AC\uAC00 \uC77C\uCE58\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.",
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
  const [previewPage, setPreviewPage] = useState(1);
  const [previewPageCount, setPreviewPageCount] = useState(1);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [phoneLast4, setPhoneLast4] = useState("");
  const [phoneVerifying, setPhoneVerifying] = useState(false);

  const signedComplete = done || info?.status === "signed";
  const canViewContract = signedComplete || phoneVerified;
  const canDownloadSigned = signedComplete && info?.hasSignedPdf !== false;

  const signedDownloadName = info?.originalFileName
    ? info.originalFileName.replace(/\.pdf$/i, "") + "-signed.pdf"
    : "contract-signed.pdf";

  const handleDownload = async () => {
    setDownloading(true);
    setDownloadError("");
    try {
      await downloadPublicSignedContractPdf(token, signedDownloadName);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : L.downloadFail);
    } finally {
      setDownloading(false);
    }
  };

  const loadPreviewMeta = useCallback(async (page = 1) => {
    const response = await fetch(publicContractPreviewUrl(token, page), { method: "HEAD" });
    if (!response.ok) return;
    setPreviewPage(Number.parseInt(response.headers.get("X-Preview-Page") || String(page), 10) || page);
    setPreviewPageCount(Number.parseInt(response.headers.get("X-Preview-Page-Count") || "1", 10) || 1);
  }, [token]);

  const loadInfo = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await fetchPublicContractSignInfo(token);
      setInfo(result);
      if (result.status === "signed") {
        setDone(true);
        setPhoneVerified(true);
      } else {
        setSignedByName(result.contactName || "");
        setPhoneVerified(Boolean(result.phoneVerified));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : L.loadFail);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadInfo();
  }, [loadInfo]);

  useEffect(() => {
    if (!info || !canViewContract) return;
    void loadPreviewMeta(1);
  }, [info, canViewContract, loadPreviewMeta]);

  const handleVerifyPhone = async () => {
    const digits = phoneLast4.replace(/\D/g, "").slice(-4);
    if (digits.length !== 4) {
      setError(L.needPhoneLast4);
      return;
    }
    setPhoneVerifying(true);
    setError("");
    try {
      const result = await verifyPublicContractPhone(token, digits);
      setPhoneVerified(true);
      setPhoneLast4(digits);
      setInfo((prev) =>
        prev
          ? { ...prev, phoneVerified: true, contactPhoneHint: result.contactPhoneHint || prev.contactPhoneHint }
          : prev,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : L.phoneVerifyFail);
    } finally {
      setPhoneVerifying(false);
    }
  };

  const handleSubmit = async () => {
    if (!phoneLast4 || phoneLast4.replace(/\D/g, "").length !== 4) {
      setError(L.needPhoneLast4);
      return;
    }
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
        phoneLast4: phoneLast4.replace(/\D/g, "").slice(-4),
      });
      setInfo((prev) =>
        prev
          ? { ...prev, status: "signed", signedByName: signedByName.trim(), hasSignedPdf: true }
          : prev,
      );
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
        ) : signedComplete && info ? (
          <Card className="rounded-2xl shadow-sm">
            <CardContent className="p-8 text-center">
              <CheckCircle2 size={48} className="mx-auto text-emerald-600" />
              <h2 className="erp-text-section mt-4">{L.doneTitle}</h2>
              <p className="erp-text-body mt-2 text-slate-600">{(info.title || "\uACC4\uC57D\uC11C") + L.doneBody}</p>
              {info.signedByName ? (
                <p className="erp-text-caption mt-2 text-slate-500">{L.signer}: {info.signedByName}</p>
              ) : null}
              {canDownloadSigned ? (
                <Button
                  className="mt-6 rounded-2xl px-6 py-5 text-base font-bold"
                  onClick={() => void handleDownload()}
                  disabled={downloading}
                >
                  <Download size={18} className="mr-2" />
                  {downloading ? L.downloading : L.download}
                </Button>
              ) : (
                <p className="erp-text-caption mt-4 font-semibold text-amber-700">{L.downloadMissing}</p>
              )}
              {downloadError ? <p className="erp-text-caption mt-3 font-semibold text-red-600">{downloadError}</p> : null}
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

            {!canViewContract ? (
              <Card className="rounded-2xl shadow-sm">
                <CardContent className="space-y-4 p-5">
                  <div>
                    <h2 className="erp-text-body font-bold text-slate-900">{L.phoneVerifyTitle}</h2>
                    <p className="erp-text-caption mt-1 text-slate-600">{L.phoneVerifyDesc}</p>
                    {info.contactPhoneHint ? (
                      <p className="erp-text-caption mt-2 font-semibold text-slate-700">{info.contactPhoneHint}</p>
                    ) : null}
                  </div>
                  <div>
                    <label className="erp-text-caption mb-1 block font-semibold text-slate-600">{L.phoneLast4}</label>
                    <Input
                      value={phoneLast4}
                      onChange={(e) => setPhoneLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
                      placeholder={L.phoneLast4Ph}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={4}
                      className="max-w-[10rem] text-center text-lg tracking-[0.35em]"
                    />
                  </div>
                  {error ? <p className="erp-text-caption font-semibold text-red-600">{error}</p> : null}
                  <Button
                    className="w-full rounded-2xl py-5 text-base font-bold"
                    onClick={() => void handleVerifyPhone()}
                    disabled={phoneVerifying}
                  >
                    {phoneVerifying ? L.phoneVerifying : L.phoneVerifyBtn}
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <>
            <Card className="rounded-2xl shadow-sm">
              <CardContent className="p-3 sm:p-4">
                <img
                  alt={info.originalFileName}
                  src={publicContractPreviewUrl(token, previewPage)}
                  className="mx-auto w-full rounded-xl border border-slate-200 bg-white"
                />
                {previewPageCount > 1 ? (
                  <div className="mt-3 flex items-center justify-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-xl"
                      disabled={previewPage <= 1}
                      onClick={() => setPreviewPage((p) => Math.max(1, p - 1))}
                    >
                      {L.prevPage}
                    </Button>
                    <span className="erp-text-caption font-semibold text-slate-600">
                      {previewPage} / {previewPageCount} {L.pageLabel}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-xl"
                      disabled={previewPage >= previewPageCount}
                      onClick={() => setPreviewPage((p) => Math.min(previewPageCount, p + 1))}
                    >
                      {L.nextPage}
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card className="rounded-2xl shadow-sm">
              <CardContent className="space-y-4 p-5">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="erp-text-caption leading-relaxed text-slate-700">{L.legal1}</p>
                  <p className="erp-text-caption mt-2 leading-relaxed text-slate-700">{L.legal2}</p>
                </div>
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
              </>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
