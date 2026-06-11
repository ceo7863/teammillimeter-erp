import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  fetchPublicProbationEvalInfo,
  submitPublicProbationEval,
  verifyPublicProbationEvalPhone,
  type PublicProbationEvalInfo,
} from "@/utils/probationEvalApi";
import type { ProbationEvalAnswer } from "@/utils/probationEval";

const L = {
  loadFail: "\uD3C9\uAC00 \uC815\uBCF4\uB97C \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.",
  pageTitle: "\uC218\uC2B5 \uC2DC\uACF5\uC790 \uD3C9\uAC00",
  pageDesc: "\uD14C\uC784\uBC00\uB9AC\uBBF8\uD130 \uC218\uC2B5 \uAE30\uAC04 \uC77C\uC77C \uD3C9\uAC00 \uC124\uBB38\uC785\uB2C8\uB2E4.",
  loading: "\uC815\uBCF4\uB97C \uBD88\uB7EC\uC624\uB294 \uC911...",
  doneTitle: "\uD3C9\uAC00\uAC00 \uC644\uB8CC\uB418\uC5C8\uC2B5\uB2C8\uB2E4",
  doneBody: "\uC218\uACE0\uD558\uC168\uC2B5\uB2C8\uB2E4.",
  workDate: "\uADDC\uC5F4 \uC77C\uC790",
  site: "\uD604\uC7A5",
  worker: "\uD3C9\uAC00 \uB300\uC0C1",
  evaluator: "\uD3C9\uAC00\uC790",
  phoneVerifyTitle: "\uC218\uC2E0 \uD734\uB300\uD3F0 \uD655\uC778",
  phoneVerifyDesc: "\uC54C\uB9BC\uD1A1\uC744 \uBC1B\uC740 \uD734\uB300\uD3F0 \uBC88\uD638 \uB4A4 4\uC790\uB9AC\uB97C \uC785\uB825\uD574 \uC8FC\uC138\uC694.",
  phoneLast4: "\uD578\uB4DC\uD3F0 \uB4A4 4\uC790\uB9AC",
  phoneVerifyBtn: "\uD655\uC778",
  phoneVerifying: "\uD655\uC778 \uC911...",
  needPhoneLast4: "\uD578\uB4DC\uD3F0 \uB4A4 4\uC790\uB9AC\uB97C \uC785\uB825\uD574 \uC8FC\uC138\uC694.",
  phoneVerifyFail: "\uD578\uB4DC\uD3F0 \uB4A4 4\uC790\uB9AC\uAC00 \uC77C\uCE58\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.",
  submit: "\uD3C9\uAC00 \uC81C\uCD9C",
  submitting: "\uC81C\uCD9C \uC911...",
  saveFail: "\uD3C9\uAC00 \uC81C\uCD9C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.",
  score: "\uC885\uD569 \uC810\uC218",
  yes: "\uC608",
  no: "\uC544\uB2C8\uC624",
  scaleHint: "1(\uB098\uC81C) ~ 5(\uB9E4\uC6B0 \uC88B\uC74C)",
};

type ProbationEvalSurveyPageProps = {
  token: string;
};

export function ProbationEvalSurveyPage({ token }: ProbationEvalSurveyPageProps) {
  const [info, setInfo] = useState<PublicProbationEvalInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [phoneLast4, setPhoneLast4] = useState("");
  const [phoneVerifying, setPhoneVerifying] = useState(false);
  const [answers, setAnswers] = useState<Record<string, number | boolean>>({});

  const submittedComplete = done || info?.status === "submitted";
  const canAnswer = submittedComplete || phoneVerified;

  const loadInfo = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await fetchPublicProbationEvalInfo(token);
      setInfo(result);
      if (result.status === "submitted") {
        setDone(true);
        setPhoneVerified(true);
      } else {
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

  const handleVerifyPhone = async () => {
    if (phoneLast4.replace(/\D/g, "").length !== 4) {
      setError(L.needPhoneLast4);
      return;
    }
    setPhoneVerifying(true);
    setError("");
    try {
      await verifyPublicProbationEvalPhone(token, phoneLast4);
      setPhoneVerified(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : L.phoneVerifyFail);
    } finally {
      setPhoneVerifying(false);
    }
  };

  const answerList = useMemo(
    () =>
      Object.entries(answers).map(([questionId, value]) => ({
        questionId,
        value,
      })) satisfies ProbationEvalAnswer[],
    [answers],
  );

  const handleSubmit = async () => {
    if (!info) return;
    setSubmitting(true);
    setError("");
    try {
      const result = await submitPublicProbationEval(token, answerList);
      setDone(true);
      setInfo((prev) =>
        prev
          ? {
              ...prev,
              status: result.status,
              totalScore: result.totalScore,
              submittedAt: result.submittedAt,
            }
          : prev,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : L.saveFail);
    } finally {
      setSubmitting(false);
    }
  };

  const updateAnswer = (questionId: string, value: number | boolean) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <p className="text-sm text-slate-500">{L.loading}</p>
      </div>
    );
  }

  if (!info) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <p className="text-sm text-red-600">{error || L.loadFail}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-6 px-4">
      <div className="mx-auto max-w-lg space-y-4">
        <div className="text-center">
          <h1 className="text-xl font-bold text-slate-900">{L.pageTitle}</h1>
          <p className="mt-1 text-sm text-slate-500">{L.pageDesc}</p>
        </div>

        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardContent className="p-4 space-y-2 text-sm">
            <div className="flex justify-between gap-2">
              <span className="text-slate-500">{L.workDate}</span>
              <span className="font-semibold text-slate-900">{info.workDate}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-slate-500">{L.site}</span>
              <span className="font-semibold text-slate-900 text-right">{info.siteName || "-"}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-slate-500">{L.worker}</span>
              <span className="font-semibold text-slate-900">{info.probationWorkerName}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-slate-500">{L.evaluator}</span>
              <span className="font-semibold text-slate-900">{info.evaluatorName}</span>
            </div>
          </CardContent>
        </Card>

        {submittedComplete ? (
          <Card className="rounded-2xl border-emerald-200 bg-emerald-50">
            <CardContent className="p-6 text-center space-y-3">
              <CheckCircle2 className="mx-auto text-emerald-600" size={40} />
              <h2 className="text-lg font-bold text-emerald-900">{L.doneTitle}</h2>
              <p className="text-sm text-emerald-800">{L.doneBody}</p>
              {info.totalScore != null && (
                <p className="text-base font-bold text-emerald-900">
                  {L.score}: {info.totalScore}
                </p>
              )}
            </CardContent>
          </Card>
        ) : !canAnswer ? (
          <Card className="rounded-2xl border-slate-200">
            <CardContent className="p-4 space-y-3">
              <h2 className="text-sm font-bold text-slate-900">{L.phoneVerifyTitle}</h2>
              <p className="text-sm text-slate-500">{L.phoneVerifyDesc}</p>
              {info.phoneHint && <p className="text-xs text-slate-400">{info.phoneHint}</p>}
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-slate-600">{L.phoneLast4}</span>
                <Input
                  inputMode="numeric"
                  maxLength={4}
                  value={phoneLast4}
                  onChange={(event) => setPhoneLast4(event.target.value.replace(/\D/g, "").slice(0, 4))}
                  placeholder="0000"
                  className="rounded-xl text-center tracking-widest"
                />
              </label>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <Button
                type="button"
                className="w-full rounded-xl"
                onClick={() => void handleVerifyPhone()}
                disabled={phoneVerifying}
              >
                {phoneVerifying ? L.phoneVerifying : L.phoneVerifyBtn}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {info.template.questions.map((question) => (
              <Card key={question.id} className="rounded-2xl border-slate-200">
                <CardContent className="p-4 space-y-3">
                  <h3 className="text-sm font-bold text-slate-900">
                    {question.label}
                    {question.required && <span className="text-red-500 ml-1">*</span>}
                  </h3>
                  {question.type === "scale5" && (
                    <>
                      <p className="text-xs text-slate-400">{L.scaleHint}</p>
                      <div className="grid grid-cols-5 gap-2">
                        {[1, 2, 3, 4, 5].map((value) => (
                          <button
                            key={value}
                            type="button"
                            className={`rounded-xl border py-2 text-sm font-bold ${
                              answers[question.id] === value
                                ? "border-blue-600 bg-blue-50 text-blue-700"
                                : "border-slate-200 bg-white text-slate-700"
                            }`}
                            onClick={() => updateAnswer(question.id, value)}
                          >
                            {value}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                  {question.type === "yesno" && (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        className={`rounded-xl border py-2 text-sm font-bold ${
                          answers[question.id] === true
                            ? "border-blue-600 bg-blue-50 text-blue-700"
                            : "border-slate-200 bg-white text-slate-700"
                        }`}
                        onClick={() => updateAnswer(question.id, true)}
                      >
                        {L.yes}
                      </button>
                      <button
                        type="button"
                        className={`rounded-xl border py-2 text-sm font-bold ${
                          answers[question.id] === false
                            ? "border-blue-600 bg-blue-50 text-blue-700"
                            : "border-slate-200 bg-white text-slate-700"
                        }`}
                        onClick={() => updateAnswer(question.id, false)}
                      >
                        {L.no}
                      </button>
                    </div>
                  )}
                  {question.type === "checkbox" && (
                    <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                      <input
                        type="checkbox"
                        checked={answers[question.id] === true}
                        onChange={(event) => updateAnswer(question.id, event.target.checked)}
                      />
                      {question.label}
                    </label>
                  )}
                </CardContent>
              </Card>
            ))}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button
              type="button"
              className="w-full rounded-xl"
              onClick={() => void handleSubmit()}
              disabled={submitting}
            >
              {submitting ? L.submitting : L.submit}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
