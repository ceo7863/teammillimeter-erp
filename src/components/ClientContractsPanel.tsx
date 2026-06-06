import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, Eye, FileText, Link2, RefreshCw, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  contractStatusLabel,
  deleteClientContract,
  generateClientContract,
  listClientContractTemplates,
  listClientContracts,
  openClientContractPdf,
  sendClientContract,
  type ClientContract,
  type ClientContractTemplate,
} from "@/utils/clientContracts";
import { isApiModeEnabled } from "@/utils/erpApi";

const L = {
  loadFail: "\uACC4\uC57D \uBAA9\uB85D\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.",
  needClient: "\uAC70\uB798\uCC98\uB97C \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.",
  needPhone: "\uAC70\uB798\uCC98 \uB9C8\uC2A4\uD130\uC5D0 \uB300\uD45C\uC790 \uC5F0\uB77D\uCC98\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.",
  generated: "\uACC4\uC57D\uC11C\uAC00 \uC0DD\uC131\uB418\uC5C8\uC2B5\uB2C8\uB2E4.",
  generateFail: "\uACC4\uC57D\uC11C \uC0DD\uC131\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.",
  sent: "\uC54C\uB9BC\uD1A1 \uBC1C\uC1A1 \uC694\uCCAD\uC774 \uC644\uB8CC\uB418\uC5C8\uC2B5\uB2C8\uB2E4.",
  linkCopied: "\uC11C\uBA85 \uB9C1\uD06C\uB97C \uBCF5\uC0AC\uD588\uC2B5\uB2C8\uB2E4.",
  copyLink: "\uB9C1\uD06C \uBCF5\uC0AC",
  openLink: "\uC11C\uBA85 \uD398\uC774\uC9C0",
  needSend: "\uC0DD\uC131\uB9CC \uD558\uBA74 \uB9C1\uD06C\uAC00 \uC0DD\uAE30\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4. \uBAA9\uB85D \uC624\uB978\uCABD \u2708\uFE0F \uBC1C\uC1A1 \uBC84\uD2BC\uC744 \uB20C\uB7EC\uC8FC\uC138\uC694.",
  sendFail: "\uC54C\uB9BC\uD1A1 \uBC1C\uC1A1\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.",
  deleted: "\uACC4\uC57D\uC774 \uC0AD\uC81C\uB418\uC5C8\uC2B5\uB2C8\uB2E4.",
  deleteFail: "\uC0AD\uC81C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.",
  apiOnly: "\uAC70\uB798\uCC98 \uACC4\uC57D \uC804\uC790\uC11C\uBA85\uC740 API \uC5F0\uB3D9 \uBAA8\uB4DC\uC5D0\uC11C \uC0AC\uC6A9\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
  title: "\uAC70\uB798\uCC98 \uACC4\uC57D \uC804\uC790\uC11C\uBA85",
  desc: "\uB2E8\uAC00\uD611\uC57D \uD15C\uD074\uB9BF \u2192 \uAC70\uB798\uCC98 \uC790\uB3D9 \uAE30\uC785 \u2192 \uC54C\uB9BC\uD1A1 \uBC1C\uC1A1 \u2192 \uACE0\uAC1D \uC11C\uBA85",
  refresh: "\uC0C8\uB85C\uACE0\uCE68",
  pickClient: "\uAC70\uB798\uCC98 \uC120\uD0DD",
  pickTemplate: "\uACC4\uC57D \uD15C\uD074\uB9BF",
  contactName: "\uB300\uD45C\uC790 \uC131\uD6C4",
  contactPhone: "\uB300\uD45C\uC790 \uC5F0\uB77D\uCC98",
  generate: "\uACC4\uC57D\uC11C \uC0DD\uC131",
  search: "\uAC70\uB798\uCC98\uBA85 \uB610\uB294 \uACC4\uC57D\uC81C\uBAA9 \uAC80\uC0C9",
  client: "\uAC70\uB798\uCC98",
  contract: "\uACC4\uC57D",
  contact: "\uB300\uD45C\uC790",
  phone: "\uC5F0\uB77D\uCC98",
  status: "\uC0C1\uD0DC",
  timeline: "\uBC1C\uC1A1/\uC11C\uBA85",
  actions: "\uAD00\uB9AC",
  loading: "\uBD88\uB7EC\uC624\uB294 \uC911...",
  empty: "\uB4F1\uB85D\uB41C \uACC4\uC57D\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  sentAt: "\uBC1C\uC1A1: ",
  signedAt: "\uC11C\uBA85: ",
  signer: "\uC11C\uBA85\uC790: ",
  masterHint: "\uB300\uD45C\uC790 \uC131\uD6C4\u00B7\uC5F0\uB77D\uCC98\uB294 \uAC70\uB798\uCC98 \uB9C8\uC2A4\uD130\uC5D0\uC11C \uC790\uB3D9 \uC785\uB825\uB429\uB2C8\uB2E4.",
};

type ClientLike = {
  id?: number | string;
  name?: string;
  ceoName?: string;
  manager?: string;
  phone?: string;
};

type ClientContractsPanelProps = {
  clients: ClientLike[];
};

const DEFAULT_TEMPLATE_ID = "unit-price-agreement";

export function ClientContractsPanel({ clients }: ClientContractsPanelProps) {
  const apiMode = isApiModeEnabled();
  const [contracts, setContracts] = useState<ClientContract[]>([]);
  const [templates, setTemplates] = useState<ClientContractTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sendingId, setSendingId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [filterClient, setFilterClient] = useState("");
  const [clientName, setClientName] = useState("");
  const [templateId, setTemplateId] = useState(DEFAULT_TEMPLATE_ID);
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [lastSignUrl, setLastSignUrl] = useState("");

  const copySignUrl = async (url: string) => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setSuccess(L.linkCopied);
    } catch {
      window.prompt(L.copyLink, url);
    }
  };

  const loadContracts = useCallback(async () => {
    if (!apiMode) return;
    setLoading(true);
    setError("");
    try {
      const [rows, templateRows] = await Promise.all([listClientContracts(), listClientContractTemplates()]);
      setContracts(rows);
      setTemplates(templateRows);
      if (templateRows.length > 0 && !templateRows.some((row) => row.id === templateId)) {
        setTemplateId(templateRows[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : L.loadFail);
    } finally {
      setLoading(false);
    }
  }, [apiMode, templateId]);

  useEffect(() => {
    void loadContracts();
  }, [loadContracts]);

  const filteredContracts = useMemo(() => {
    const query = filterClient.trim().toLowerCase();
    if (!query) return contracts;
    return contracts.filter((row) => row.clientName.toLowerCase().includes(query) || row.title.toLowerCase().includes(query));
  }, [contracts, filterClient]);

  const applyClientPreset = (nextClientName: string) => {
    const match = clients.find((row) => String(row.name || "").trim() === nextClientName);
    setClientName(nextClientName);
    setContactName(match?.ceoName ? String(match.ceoName) : match?.manager ? String(match.manager) : "");
    setContactPhone(match?.phone ? String(match.phone) : "");
  };

  const handleGenerate = async () => {
    if (!clientName.trim()) {
      setError(L.needClient);
      return;
    }
    if (!contactPhone.trim()) {
      setError(L.needPhone);
      return;
    }
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const saved = await generateClientContract({
        templateId: templateId || DEFAULT_TEMPLATE_ID,
        clientName: clientName.trim(),
      });
      setContracts((prev) => [saved, ...prev.filter((row) => row.id !== saved.id)]);
      setContactName(saved.contactName || contactName);
      setContactPhone(saved.contactPhone || contactPhone);
      setSuccess(L.generated + " " + L.needSend);
    } catch (err) {
      setError(err instanceof Error ? err.message : L.generateFail);
    } finally {
      setSaving(false);
    }
  };

  const handleSend = async (contract: ClientContract) => {
    setSendingId(contract.id);
    setError("");
    setSuccess("");
    try {
      const result = await sendClientContract(contract.id);
      setContracts((prev) => prev.map((row) => (row.id === contract.id ? { ...result.contract, signUrl: result.signUrl } : row)));
      setLastSignUrl(result.signUrl);
      setSuccess(L.sent);
    } catch (err) {
      setError(err instanceof Error ? err.message : L.sendFail);
    } finally {
      setSendingId("");
    }
  };

  const handleDelete = async (contract: ClientContract) => {
    const msg = `"${contract.title}" \uACC4\uC57D\uC744 \uC0AD\uC81C\uD560\uAE4C\uC694?`;
    if (!window.confirm(msg)) return;
    setError("");
    setSuccess("");
    try {
      await deleteClientContract(contract.id);
      setContracts((prev) => prev.filter((row) => row.id !== contract.id));
      setSuccess(L.deleted);
    } catch (err) {
      setError(err instanceof Error ? err.message : L.deleteFail);
    }
  };

  if (!apiMode) {
    return (
      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-5">
          <p className="erp-text-body text-slate-600">{L.apiOnly}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-2xl shadow-sm">
      <CardContent className="p-4 md:p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="erp-text-section">{L.title}</h2>
            <p className="erp-text-caption mt-1 text-slate-500">{L.desc}</p>
          </div>
          <Button variant="outline" className="rounded-2xl" onClick={() => void loadContracts()} disabled={loading}>
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            {L.refresh}
          </Button>
        </div>

        <div className="mb-2 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
          <select
            className="erp-input w-full rounded-xl px-3 py-2 text-sm font-semibold"
            value={clientName}
            onChange={(e) => applyClientPreset(e.target.value)}
          >
            <option value="">{L.pickClient}</option>
            {clients.map((client) => (
              <option key={String(client.id ?? client.name)} value={String(client.name || "")}>
                {client.name}
              </option>
            ))}
          </select>
          <select
            className="erp-input w-full rounded-xl px-3 py-2 text-sm font-semibold"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
          >
            {templates.length === 0 ? (
              <option value={DEFAULT_TEMPLATE_ID}>{L.pickTemplate}</option>
            ) : (
              templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.title}
                </option>
              ))
            )}
          </select>
          <Input value={contactName} readOnly placeholder={L.contactName} className="bg-slate-50" />
          <Input value={contactPhone} readOnly placeholder={L.contactPhone} className="bg-slate-50" />
          <Button className="rounded-2xl" onClick={() => void handleGenerate()} disabled={saving}>
            {L.generate}
          </Button>
        </div>
        <p className="erp-text-caption mb-5 text-slate-500">{L.masterHint}</p>

        {error ? <p className="erp-text-caption mb-3 font-semibold text-red-600">{error}</p> : null}
        {success ? <p className="erp-text-caption mb-3 font-semibold text-emerald-600">{success}</p> : null}
        {lastSignUrl ? (
          <div className="mb-4 flex flex-col gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="erp-text-caption font-bold text-emerald-800">{"\uC11C\uBA85 \uB9C1\uD06C"}</p>
              <p className="erp-text-caption mt-1 break-all text-emerald-900">{lastSignUrl}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button size="sm" variant="outline" className="rounded-xl" onClick={() => void copySignUrl(lastSignUrl)}>
                <Copy size={14} />
                {L.copyLink}
              </Button>
              <a
                href={lastSignUrl}
                target="_blank"
                rel="noreferrer"
                className="erp-ui-btn erp-ui-btn--primary erp-ui-btn--sm inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-semibold"
              >
                <Link2 size={14} />
                {L.openLink}
              </a>
            </div>
          </div>
        ) : null}

        <Input value={filterClient} onChange={(e) => setFilterClient(e.target.value)} placeholder={L.search} className="mb-3" />

        <div className="erp-table-wrap">
          <table className="erp-table erp-table--lg">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className="text-left">{L.client}</th>
                <th className="text-left">{L.contract}</th>
                <th className="text-left">{L.contact}</th>
                <th className="text-left">{L.phone}</th>
                <th className="text-center">{L.status}</th>
                <th className="text-left">{L.timeline}</th>
                <th className="text-center">{L.actions}</th>
              </tr>
            </thead>
            <tbody>
              {filteredContracts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    {loading ? L.loading : L.empty}
                  </td>
                </tr>
              ) : (
                filteredContracts.map((contract) => (
                  <tr key={contract.id} className="border-t hover:bg-slate-50">
                    <td className="font-semibold">{contract.clientName}</td>
                    <td>
                      <div className="font-semibold">{contract.title}</div>
                      <div className="erp-text-caption text-slate-500">{contract.originalFileName}</div>
                    </td>
                    <td>{contract.contactName || "-"}</td>
                    <td>{contract.contactPhone || "-"}</td>
                    <td className="text-center">
                      <span
                        className={`erp-text-caption inline-flex rounded-full px-2.5 py-1 font-bold ${
                          contract.status === "signed"
                            ? "bg-emerald-100 text-emerald-700"
                            : contract.status === "sent"
                              ? "bg-blue-100 text-blue-700"
                              : contract.status === "expired"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {contractStatusLabel(contract.status)}
                      </span>
                    </td>
                    <td className="text-slate-600">
                      {contract.sentAt ? <div>{L.sentAt + new Date(contract.sentAt).toLocaleString("ko-KR")}</div> : "-"}
                      {contract.signedAt ? <div>{L.signedAt + new Date(contract.signedAt).toLocaleString("ko-KR")}</div> : null}
                      {contract.signedByName ? <div>{L.signer + contract.signedByName}</div> : null}
                    </td>
                    <td>
                      <div className="flex flex-wrap justify-center gap-2">
                        <Button size="sm" variant="outline" className="rounded-xl" onClick={() => void openClientContractPdf(contract.id, "original")}>
                          <FileText size={14} />
                        </Button>
                        {contract.status === "signed" ? (
                          <Button size="sm" variant="outline" className="rounded-xl" onClick={() => void openClientContractPdf(contract.id, "signed")}>
                            <Eye size={14} />
                          </Button>
                        ) : null}
                        {contract.signUrl ? (
                          <Button size="sm" variant="outline" className="rounded-xl" onClick={() => void copySignUrl(contract.signUrl!)} title={L.copyLink}>
                            <Copy size={14} />
                          </Button>
                        ) : null}
                        {contract.status === "draft" || contract.status === "expired" ? (
                          <Button size="sm" className="rounded-xl" onClick={() => void handleSend(contract)} disabled={sendingId === contract.id}>
                            <Send size={14} />
                          </Button>
                        ) : null}
                        {contract.status === "sent" ? (
                          <Button size="sm" variant="outline" className="rounded-xl" onClick={() => void handleSend(contract)} disabled={sendingId === contract.id}>
                            <Send size={14} />
                          </Button>
                        ) : null}
                        <Button size="sm" className="rounded-xl bg-red-600 hover:bg-red-700" onClick={() => void handleDelete(contract)}>
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
