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
import type { WorkerMasterLike } from "@/utils/workerPayments";

const L = {
  title: "\uC5C5\uCCB4\uBCC4 \uCE98\uB9B0\uB354",
  desc: "\uB9C1\uD06C\uAC00 \uBC1C\uAE09\uB41C \uAC70\uB798\uCC98 \uC811\uC218 \uCE98\uB9B0\uB354\uB97C \uD655\uC778\uD569\uB2C8\uB2E4.",
  search: "\uAC70\uB798\uCC98\uBA85 \uAC80\uC0C9",
  loading: "\uBAA9\uB85D\uC744 \uBD88\uB7EC\uC624\uB294 \uC911...",
  loadFail: "\uBAA9\uB85D\uC744 \uBD88\uB7EC\uC62C \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.",
  empty: "\uB9C1\uD06C\uAC00 \uBC1C\uAE09\uB41C \uAC70\uB798\uCC98\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.",
  pickClient: "\uC704 \uBAA9\uB85D\uC5D0\uC11C \uAC70\uB798\uCC98\uB97C \uC120\uD0DD\uD558\uC138\uC694.",
  openLink: "\uACF5\uAC1C \uD398\uC774\uC815 \uC5F4\uAE30",
  disabled: "\uBE44\uD65C\uC131",
  pending: "\uB300\uAE30",
};

type ClientSiteRequestCalendarsPageProps = {
  workers?: WorkerMasterLike[];
};

export function ClientSiteRequestCalendarsPage({ workers = [] }: ClientSiteRequestCalendarsPageProps) {
  const [links, setLinks] = useState<ClientSiteRequestLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selectedClientId, setSelectedClientId] = useState<string>("");

  const loadLinks = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const rows = await listClientSiteRequestLinks();
      const sorted = [...rows].sort((a, b) =>
        String(a.clientName || "").localeCompare(String(b.clientName || ""), "ko"),
      );
      setLinks(sorted);
      setSelectedClientId((current) => {
        if (current && sorted.some((row) => String(row.clientId) === current)) return current;
        return sorted[0] ? String(sorted[0].clientId) : "";
      });
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

  const filteredLinks = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return links;
    return links.filter((link) => String(link.clientName || "").toLowerCase().includes(query));
  }, [links, search]);

  const selectedLink = useMemo(
    () => links.find((link) => String(link.clientId) === selectedClientId) || null,
    [links, selectedClientId],
  );

  const publicUrl = selectedLink ? resolveClientSiteRequestLinkUrl(selectedLink) : "";

  return (
    <div className="erp-page erp-client-calendars-page flex min-h-0 flex-1 flex-col">
      <div className="mb-4 shrink-0">
        <h1 className="erp-text-page-title text-slate-900">{L.title}</h1>
        <p className="mt-1 erp-text-body text-slate-600">{L.desc}</p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <Card className="shrink-0 rounded-2xl shadow-sm">
          <CardContent className="p-3 md:p-4">
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={L.search}
                className="erp-input w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm"
              />
            </div>

            {loading ? (
              <p className="mt-3 text-sm text-slate-500">{L.loading}</p>
            ) : error ? (
              <p className="mt-3 text-sm font-semibold text-red-600">{error}</p>
            ) : !filteredLinks.length ? (
              <p className="mt-3 text-sm text-slate-500">{links.length ? L.search : L.empty}</p>
            ) : (
              <ul className="mt-3 max-h-52 space-y-1 overflow-y-auto overscroll-contain md:max-h-60">
                {filteredLinks.map((link) => {
                  const active = String(link.clientId) === selectedClientId;
                  return (
                    <li key={String(link.clientId)}>
                      <button
                        type="button"
                        className={`erp-touch-target flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-bold transition ${
                          active ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"
                        }`}
                        onClick={() => setSelectedClientId(String(link.clientId))}
                      >
                        <span className="min-w-0 truncate">{link.clientName}</span>
                        <span className="flex shrink-0 items-center gap-1.5 text-xs font-semibold opacity-80">
                          {link.disabled ? (
                            <span className={`rounded-full px-2 py-0.5 ${active ? "bg-white/15" : "bg-slate-200 text-slate-600"}`}>
                              {L.disabled}
                            </span>
                          ) : null}
                          {link.pendingCount > 0 ? (
                            <span className={`rounded-full px-2 py-0.5 ${active ? "bg-amber-400 text-amber-950" : "bg-amber-100 text-amber-800"}`}>
                              {L.pending} {link.pendingCount}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="flex min-h-[28rem] flex-1 flex-col rounded-2xl shadow-sm">
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
