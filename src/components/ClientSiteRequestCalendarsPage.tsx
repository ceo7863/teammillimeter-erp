import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link2, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ClientSiteRequestCalendarPanel } from "@/components/ClientSiteRequestCalendarPanel";
import {
  listClientSiteRequestLinks,
  openClientSiteRequestLink,
  resolveClientSiteRequestLinkUrl,
  type ClientSiteRequestLink,
} from "@/utils/clientSiteRequests";
import {
  buildClientMonthlySalesTotals,
  normalizeClientCalendarName,
  type ClientCalendarSaleLike,
} from "@/utils/clientCalendarStats";
import { formatClientSiteRequestMonthLabel, getCurrentMonthKey } from "@/utils/clientSiteRequestCalendar";
import { formatKRW } from "@/utils/receivables";
import type { WorkerMasterLike } from "@/utils/workerPayments";

const L = {
  title: "\uC5C5\uCCB4\uBCC4 \uCE98\uB9B0\uB354",
  desc: "\uB9C1\uD06C\uAC00 \uBC1C\uAE09\uB41C \uAC70\uB798\uCC98 \uC811\uC218 \uCE98\uB9B0\uB354\uB97C \uD655\uC778\uD569\uB2C8\uB2E4.",
  search: "\uAC70\uB798\uCC98\uBA85 \uAC80\uC0C9",
  sortHint: "\uB2F9\uC6D4 \uB9E4\uCD9C \uB192\uC740 \uC21C",
  loading: "\uBAA9\uB85D\uC744 \uBD88\uB7EC\uC624\uB294 \uC911...",
  loadFail: "\uBAA9\uB85D\uC744 \uBD88\uB7EC\uC62C \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.",
  empty: "\uB9C1\uD06C\uAC00 \uBC1C\uAE09\uB41C \uAC70\uB798\uCC98\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.",
  pickClient: "\uC704 \uBAA9\uB85D\uC5D0\uC11C \uAC70\uB798\uCC98\uB97C \uC120\uD0DD\uD558\uC138\uC694.",
  openLink: "\uACF5\uAC1C \uD398\uC774\uC815 \uC5F4\uAE30",
  disabled: "\uBE44\uD65C\uC131",
  pending: "\uB300\uAE30",
};

type ClientSiteRequestCalendarsPageProps = {
  sales?: ClientCalendarSaleLike[];
  workers?: WorkerMasterLike[];
};

export function ClientSiteRequestCalendarsPage({ sales = [], workers = [] }: ClientSiteRequestCalendarsPageProps) {
  const [links, setLinks] = useState<ClientSiteRequestLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [monthKey, setMonthKey] = useState(getCurrentMonthKey);

  const loadLinks = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const rows = await listClientSiteRequestLinks();
      setLinks(rows);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : L.loadFail);
      setLinks([]);
      setSelectedClientId("");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLinks();
  }, [loadLinks]);

  const monthlySalesByClient = useMemo(
    () => buildClientMonthlySalesTotals(sales, monthKey),
    [sales, monthKey],
  );

  const sortedLinks = useMemo(() => {
    return [...links].sort((a, b) => {
      const aBill = monthlySalesByClient.get(normalizeClientCalendarName(a.clientName)) || 0;
      const bBill = monthlySalesByClient.get(normalizeClientCalendarName(b.clientName)) || 0;
      if (bBill !== aBill) return bBill - aBill;
      return String(a.clientName || "").localeCompare(String(b.clientName || ""), "ko");
    });
  }, [links, monthlySalesByClient]);

  useEffect(() => {
    if (!sortedLinks.length) {
      setSelectedClientId("");
      return;
    }
    setSelectedClientId((current) =>
      current && sortedLinks.some((row) => String(row.clientId) === current)
        ? current
        : String(sortedLinks[0].clientId),
    );
  }, [sortedLinks]);

  const filteredLinks = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return sortedLinks;
    return sortedLinks.filter((link) => String(link.clientName || "").toLowerCase().includes(query));
  }, [sortedLinks, search]);

  const selectedLink = useMemo(
    () => sortedLinks.find((link) => String(link.clientId) === selectedClientId) || null,
    [sortedLinks, selectedClientId],
  );

  const publicUrl = selectedLink ? resolveClientSiteRequestLinkUrl(selectedLink) : "";
  const monthLabel = formatClientSiteRequestMonthLabel(monthKey);

  return (
    <div className="erp-page erp-client-calendars-page flex min-h-0 flex-1 flex-col">
      <div className="erp-client-calendars-page__head shrink-0">
        <h1 className="erp-text-page-title text-slate-900">{L.title}</h1>
        <p className="mt-1 erp-text-body text-slate-600">{L.desc}</p>
      </div>

      <div className="erp-client-calendars-page__body flex min-h-0 flex-1 flex-col gap-4">
        <Card className="erp-client-calendars-page__list shrink-0 rounded-2xl shadow-sm">
          <CardContent className="p-3 md:p-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[12rem] flex-1">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={L.search}
                  className="erp-input w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm"
                />
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                {monthLabel} {L.sortHint}
              </span>
            </div>

            {loading ? (
              <p className="mt-3 text-sm text-slate-500">{L.loading}</p>
            ) : error ? (
              <p className="mt-3 text-sm font-semibold text-red-600">{error}</p>
            ) : !filteredLinks.length ? (
              <p className="mt-3 text-sm text-slate-500">{links.length ? L.search : L.empty}</p>
            ) : (
              <div className="erp-client-calendars-page__list-items mt-3 flex flex-wrap gap-2">
                {filteredLinks.map((link) => {
                  const active = String(link.clientId) === selectedClientId;
                  const monthBill = monthlySalesByClient.get(normalizeClientCalendarName(link.clientName)) || 0;
                  return (
                    <button
                      key={String(link.clientId)}
                      type="button"
                      className={`erp-client-calendars-page__chip erp-touch-target inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-2 text-left text-sm font-bold transition ${
                        active
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                      onClick={() => setSelectedClientId(String(link.clientId))}
                    >
                      <span className="min-w-0 truncate">{link.clientName}</span>
                      {monthBill > 0 ? (
                        <span className={`shrink-0 text-xs font-semibold ${active ? "text-slate-200" : "text-slate-500"}`}>
                          {formatKRW(monthBill)}
                        </span>
                      ) : null}
                      {link.disabled ? (
                        <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${active ? "bg-white/15 text-white" : "bg-slate-200 text-slate-600"}`}>
                          {L.disabled}
                        </span>
                      ) : null}
                      {link.pendingCount > 0 ? (
                        <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${active ? "bg-amber-400 text-amber-950" : "bg-amber-100 text-amber-800"}`}>
                          {L.pending} {link.pendingCount}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="erp-client-calendars-page__calendar flex min-h-[32rem] flex-1 flex-col rounded-2xl shadow-sm">
          <CardContent className="flex min-h-0 flex-1 flex-col p-3 md:p-4">
            {selectedLink ? (
              <>
                <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-bold text-slate-900 md:text-lg">{selectedLink.clientName}</h2>
                    {selectedLink.disabled ? (
                      <p className="mt-0.5 text-xs font-semibold text-slate-500">{L.disabled}</p>
                    ) : null}
                  </div>
                  {publicUrl ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="rounded-xl"
                      noFeedback
                      onClick={() => openClientSiteRequestLink(publicUrl)}
                    >
                      <Link2 size={14} className="mr-1" />
                      {L.openLink}
                    </Button>
                  ) : null}
                </div>
                <ClientSiteRequestCalendarPanel
                  key={String(selectedLink.clientId)}
                  clientId={selectedLink.clientId}
                  workers={workers}
                  drawerElevated
                  fullscreen
                  monthKey={monthKey}
                  onMonthKeyChange={setMonthKey}
                />
              </>
            ) : (
              <p className="py-16 text-center text-sm text-slate-500">{L.pickClient}</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
