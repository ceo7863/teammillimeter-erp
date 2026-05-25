import React, { useEffect, useState } from "react";
import { Building2, Globe, Landmark, ListVideo, Save, Share2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_COMPANY_PROFILE,
  normalizeCompanyProfile,
  type CompanyProfile,
} from "@/utils/companyProfile";

const L = {
  pageTitle: "\uD68C\uC0AC \uC815\uBCF4",
  pageDesc:
    "\uC785\uB825\uD55C \uC815\uBCF4\uB294 \uB0B4\uC5ED\uC11C \uB4F1 \uBB38\uC11C\uC5D0 \uC790\uB3D9 \uBC18\uC601\uB429\uB2C8\uB2E4.",
  basicSection: "\uAE30\uBCF8 \uC815\uBCF4",
  bankSection: "\uACC4\uC88C \uC815\uBCF4",
  linkSection: "\uC628\uB77C\uC778 \uC815\uBCF4",
  name: "\uD68C\uC0AC\uBA85",
  businessNo: "\uC0AC\uC5C5\uC790\uBC88\uD638",
  phone: "\uC804\uD654\uBC88\uD638",
  fax: "\uD329\uC2A4",
  address: "\uC8FC\uC18C",
  bankVatIncluded: "\uACC4\uC88C (\uBD80\uAC00\uC138 \uD3EC\uD568 \uB0B4\uC5ED\uC11C)",
  bankVatExcluded: "\uACC4\uC88C (\uBD80\uAC00\uC138 \uBBF8\uD3EC\uD568 \uB0B4\uC5ED\uC11C)",
  bankVatIncludedHint: "\uAC70\uB798\uCC98 \uBD80\uAC00\uC138 \u2018Y\u2019 \uC778 \uACBD\uC6B0 \uC774 \uACC4\uC88C\uAC00 \uB0B4\uC5ED\uC11C\uC5D0 \uD45C\uC2DC\uB429\uB2C8\uB2E4.",
  bankVatExcludedHint: "\uAC70\uB798\uCC98 \uBD80\uAC00\uC138 \u2018N\u2019 \uC778 \uACBD\uC6B0 \uC774 \uACC4\uC88C\uAC00 \uB0B4\uC5ED\uC11C\uC5D0 \uD45C\uC2DC\uB429\uB2C8\uB2E4.",
  website: "\uD648\uD398\uC774\uC9C0 \uC8FC\uC18C",
  instagram: "Instagram \uC8FC\uC18C",
  youtube: "YouTube \uC8C0\uC18C",
  save: "\uC800\uC7A5",
  reset: "\uAE30\uBCF8\uAC12 \uBD88\uB7EC\uC624\uAE30",
  saved: "\uD68C\uC0AC \uC815\uBCF4\uAC00 \uC800\uC7A5\uB418\uC5C8\uC2B5\uB2C8\uB2E4.",
  autoSaveHint: "\uC785\uB825 \uD6C4 \uC790\uB3D9 \uC800\uC7A5\uB429\uB2C8\uB2E4.",
  previewTitle: "\uBB38\uC11C \uD45C\uC2DC \uBBF8\uB9AC\uBCF4\uAE30",
};

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="erp-text-body font-bold text-slate-700">{label}</span>
      {children}
      {hint ? <span className="erp-text-caption block text-slate-400">{hint}</span> : null}
    </label>
  );
}

function ProfileInput({
  value,
  onChange,
  placeholder = "",
  type = "text",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      lang="ko"
      className="erp-input w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-slate-900 outline-none transition focus:border-slate-900 md:px-4 md:py-3"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
    />
  );
}

export function CompanyProfilePage({
  companyProfile,
  setCompanyProfile,
}: {
  companyProfile: CompanyProfile;
  setCompanyProfile: React.Dispatch<React.SetStateAction<CompanyProfile>>;
}) {
  const [draft, setDraft] = useState(() => normalizeCompanyProfile(companyProfile));
  const [message, setMessage] = useState("");

  useEffect(() => {
    setDraft(normalizeCompanyProfile(companyProfile));
  }, [companyProfile]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = normalizeCompanyProfile(draft);
      const current = normalizeCompanyProfile(companyProfile);
      const changed = (Object.keys(next) as Array<keyof CompanyProfile>).some((key) => next[key] !== current[key]);
      if (changed) {
        setCompanyProfile(next);
        setMessage(L.saved);
      }
    }, 600);
    return () => window.clearTimeout(timer);
  }, [draft, companyProfile, setCompanyProfile]);

  const update = (key: keyof CompanyProfile, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const saveProfile = () => {
    const next = normalizeCompanyProfile(draft);
    setCompanyProfile(next);
    setDraft(next);
    setMessage(L.saved);
  };

  const resetProfile = () => {
    if (!window.confirm("\uAE30\uBCF8 \uAC12\uC73C\uB85C \uB418\uB3CC\uB9B4\uAE4C\uC694?")) return;
    const next = { ...DEFAULT_COMPANY_PROFILE };
    setDraft(next);
    setCompanyProfile(next);
    setMessage(L.saved);
  };

  return (
    <div className="erp-company-profile-page erp-page space-y-5 md:space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="erp-text-page-title">{L.pageTitle}</h1>
          <p className="erp-text-body mt-1 text-slate-500 md:mt-2">{L.pageDesc}</p>
          <p className="erp-text-caption mt-1 text-slate-400">{L.autoSaveHint}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="rounded-2xl" onClick={resetProfile}>
            {L.reset}
          </Button>
          <Button className="rounded-2xl" onClick={saveProfile}>
            <Save size={16} /> {L.save}
          </Button>
        </div>
      </div>

      {message ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 erp-text-body font-semibold text-emerald-700">
          {message}
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,0.9fr)]">
        <div className="space-y-5">
          <Card className="rounded-2xl border-slate-200 shadow-sm">
            <CardContent className="space-y-4 p-4 md:p-5">
              <div className="flex items-center gap-2">
                <Building2 size={18} className="text-slate-500" />
                <h2 className="erp-text-section font-bold">{L.basicSection}</h2>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label={L.name}>
                  <ProfileInput value={draft.name} onChange={(value) => update("name", value)} placeholder="(\uC8FC)\uD300\uBC00\uB9AC\uBBF8\uD130" />
                </Field>
                <Field label={L.businessNo}>
                  <ProfileInput value={draft.businessNo} onChange={(value) => update("businessNo", value)} placeholder="000-00-00000" />
                </Field>
                <Field label={L.phone}>
                  <ProfileInput value={draft.phone} onChange={(value) => update("phone", value)} placeholder="02-0000-0000" />
                </Field>
                <Field label={L.fax}>
                  <ProfileInput value={draft.fax} onChange={(value) => update("fax", value)} placeholder="02-0000-0000" />
                </Field>
                <div className="md:col-span-2">
                  <Field label={L.address}>
                    <ProfileInput value={draft.address} onChange={(value) => update("address", value)} placeholder="\uC11C\uC6B8\uD2B9\uBCC4\uC2DC ..." />
                  </Field>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-slate-200 shadow-sm">
            <CardContent className="space-y-4 p-4 md:p-5">
              <div className="flex items-center gap-2">
                <Landmark size={18} className="text-slate-500" />
                <h2 className="erp-text-section font-bold">{L.bankSection}</h2>
              </div>
              <Field label={L.bankVatIncluded} hint={L.bankVatIncludedHint}>
                <ProfileInput
                  value={draft.bankAccountVatIncluded}
                  onChange={(value) => update("bankAccountVatIncluded", value)}
                  placeholder="000-000000-00-000 \uC740\uD589 (\uC8FC)\uD68C\uC0AC\uBA85"
                />
              </Field>
              <Field label={L.bankVatExcluded} hint={L.bankVatExcludedHint}>
                <ProfileInput
                  value={draft.bankAccountVatExcluded}
                  onChange={(value) => update("bankAccountVatExcluded", value)}
                  placeholder="000-000000-00-000 \uC740\uD589 (\uC8FC)\uD68C\uC0AC\uBA85"
                />
              </Field>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-slate-200 shadow-sm">
            <CardContent className="space-y-4 p-4 md:p-5">
              <div className="flex items-center gap-2">
                <Globe size={18} className="text-slate-500" />
                <h2 className="erp-text-section font-bold">{L.linkSection}</h2>
              </div>
              <Field label={L.website}>
                <ProfileInput value={draft.website} onChange={(value) => update("website", value)} placeholder="https://example.com" />
              </Field>
              <Field label={L.instagram}>
                <ProfileInput value={draft.instagram} onChange={(value) => update("instagram", value)} placeholder="https://instagram.com/..." />
              </Field>
              <Field label={L.youtube}>
                <ProfileInput value={draft.youtube} onChange={(value) => update("youtube", value)} placeholder="https://youtube.com/@..." />
              </Field>
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit rounded-2xl border-slate-200 bg-slate-950 text-white shadow-sm">
          <CardContent className="space-y-4 p-5 md:p-6">
            <h2 className="erp-text-section font-bold">{L.previewTitle}</h2>
            <div className="rounded-2xl bg-white/10 p-4">
              <div className="text-lg font-black tracking-tight">{draft.name || "-"}</div>
              {draft.businessNo ? <div className="mt-2 text-slate-300">{"\uC0AC\uC5C5\uC790\uBC88\uD638 "}{draft.businessNo}</div> : null}
              {draft.phone ? <div className="mt-2 text-slate-300">Tel {draft.phone}</div> : null}
              {draft.fax ? <div className="text-slate-300">Fax {draft.fax}</div> : null}
              {draft.address ? <div className="mt-2 text-slate-300">{draft.address}</div> : null}
            </div>
            <div className="space-y-2 rounded-2xl bg-white/5 p-4 text-sm">
              <div>
                <div className="text-slate-400">VAT Y</div>
                <div className="font-semibold">{draft.bankAccountVatIncluded || "-"}</div>
              </div>
              <div>
                <div className="text-slate-400">VAT N</div>
                <div className="font-semibold">{draft.bankAccountVatExcluded || "-"}</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {draft.website ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-xs">
                  <Globe size={12} /> Web
                </span>
              ) : null}
              {draft.instagram ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-xs">
                  <Share2 size={12} /> IG
                </span>
              ) : null}
              {draft.youtube ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-xs">
                  <ListVideo size={12} /> YT
                </span>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
