import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Eye, FileText, RefreshCw, Send, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  contractStatusLabel,
  deleteClientContract,
  listClientContracts,
  openClientContractPdf,
  sendClientContract,
  uploadClientContract,
  type ClientContract,
} from "@/utils/clientContracts";
import { isApiModeEnabled } from "@/utils/erpApi";

const L = {
  loadFail: "\uACC4\uC57D \uBAA9\uB85D\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.",
  needPdf: "PDF \uACC4\uC57D\uC11C\uB97C \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.",
  needClient: "\uAC70\uB798\uCC98\uB97C \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.",
  needTitle: "\uACC4\uC57D \uC81C\uBAA9\uC744 \uC785\uB825\uD574 \uC8FC\uC138\uC694.",
  needPhone: "\uC218\uC2E0 \uC5F0\uB77D\uCC98\uB97C \uC785\uB825\uD574 \uC8FC\uC138\uC694.",
  uploaded: "\uACC4\uC57D\uC11C\uAC00 \uC5C5\uB85C\uB4DC\uB418\uC5C8\uC2B5\uB2C8\uB2E4.",
  uploadFail: "\uC5C5\uB85C\uB4DC\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.",
  sent: "\uC54C\uB9BC\uD1A1\uC774 \uBC1C\uC1A1\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uC11C\uBA85 \uB9C1\uD06C: ",
  sendFail: "\uC54C\uB9BC\uD1A1 \uBC1C\uC1A1\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.",
  deleted: "\uACC4\uC57D\uC774 \uC0AD\uC81C\uB418\uC5C8\uC2B5\uB2C8\uB2E4.",
  deleteFail: "\uC0AD\uC81C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.",
  apiOnly: "\uAC70\uB798\uCC98 \uACC4\uC57D \uC804\uC790\uC11C\uBA85\uC740 API \uC5F0\uB3D9 \uBAA8\uB4DC\uC5D0\uC11C \uC0AC\uC6A9\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
  title: "\uAC70\uB798\uCC98 \uACC4\uC57D \uC804\uC790\uC11C\uBA85",
  desc: "PDF \uC5C5\uB85C\uB4DC \u2192 \uC54C\uB9BC\uD1A1 \uBC1C\uC1A1 \u2192 \uACE0\uAC1D \uBAA8\uBC14\uC77C \uC11C\uBA85",
  refresh: "\uC0C8\uB85C\uACE0\uCE68",
  pickClient: "\uAC70\uB798\uCC98 \uC120\uD0DD",
  contractTitle: "\uACC4\uC57D \uC81C\uBAA9",
  contactName: "\uC218\uC2E0\uC790 \uC131\uD568",
  contactPhone: "\uC218\uC2E0 \uC5F0\uB77D\uCC98",
  pickPdf: "PDF \uC120\uD0DD",
  upload: "\uC5C5\uB85C\uB4DC",
  search: "\uAC70\uB798\uCC98\uBA85 \uB610\uB294 \uACC4\uC57D\uC81C\uBAA9 \uAC80\uC0C9",
  client: "\uAC70\uB798\uCC98",
  contract: "\uACC4\uC57D",
  contact: "\uC218\uC2E0\uC790",
  phone: "\uC5F0\uB77D\uCC98",
  status: "\uC0C1\uD0DC",
  timeline: "\uBC1C\uC1A1/\uC11C\uBA85",
  actions: "\uAD00\uB9AC",
  loading: "\uBD88\uB7EC\uC624\uB294 \uC911...",
  empty: "\uB4F1\uB85D\uB41C \uACC4\uC57D\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  sentAt: "\uBC1C\uC1A1: ",
  signedAt: "\uC11C\uBA85: ",
  signer: "\uC11C\uBA85\uC790: ",
};

type ClientLike = {
  id?: number | string;
  name?: string;
  manager?: string;
  phone?: string;
};

type ClientContractsPanelProps = {
  clients: ClientLike[];
};

const EMPTY_FORM = {
  clientName: "",
  title: "",
  contactName: "",
  contactPhone: "",
};

export function ClientContractsPanel({ clients }: ClientContractsPanelProps) {
  const apiMode = isApiModeEnabled();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [contracts, setContracts] = useState<ClientContract[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sendingId, setSendingId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [filterClient, setFilterClient] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const loadContracts = useCallback(async () => {
    if (!apiMode) return;
    setLoading(true);
    setError("");
    try {
      const rows = await listClientContracts();
      setContracts(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : L.loadFail);
    } finally {
      setLoading(false);
    }
  }, [apiMode]);

  useEffect(() => {
    void loadContracts();
  }, [loadContracts]);

  const filteredContracts = useMemo(() => {
    const query = filterClient.trim().toLowerCase();
    if (!query) return contracts;
    return contracts.filter((row) => row.clientName.toLowerCase().includes(query) || row.title.toLowerCase().includes(query));
  }, [contracts, filterClient]);

  const applyClientPreset = (clientName: string) => {
    const match = clients.find((row) => String(row.name || "").trim() === clientName);
    setForm((prev) => ({
      ...prev,
      clientName,
      contactName: match?.manager ? String(match.manager) : prev.contactName,
      contactPhone: match?.phone ? String(match.phone) : prev.contactPhone,
    }));
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setError(L.needPdf);
      return;
    }
    if (!form.clientName.trim()) {
      setError(L.needClient);
      return;
    }
    if (!form.title.trim()) {
      setError(L.needTitle);
      return;
    }
    if (!form.contactPhone.trim()) {
      setError(L.needPhone);
      return;
    }
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const saved = await uploadClientContract({
        file: selectedFile,
        clientName: form.clientName.trim(),
        title: form.title.trim(),
        contactName: form.contactName.trim() || undefined,
        contactPhone: form.contactPhone.trim(),
      });
      setContracts((prev) => [saved, ...prev.filter((row) => row.id !== saved.id)]);
      setForm(EMPTY_FORM);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setSuccess(L.uploaded);
    } catch (err) {
      setError(err instanceof Error ? err.message : L.uploadFail);
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
      setContracts((prev) => prev.map((row) => (row.id === contract.id ? result.contract : row)));
      setSuccess(L.sent + result.signUrl);
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

        <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
          <select
            className="erp-input w-full rounded-xl px-3 py-2 text-sm font-semibold"
            value={form.clientName}
            onChange={(e) => applyClientPreset(e.target.value)}
          >
            <option value="">{L.pickClient}</option>
            {clients.map((client) => (
              <option key={String(client.id ?? client.name)} value={String(client.name || "")}>
                {client.name}
              </option>
            ))}
          </select>
          <Input value={form.title} onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))} placeholder={L.contractTitle} />
          <Input value={form.contactName} onChange={(e) => setForm((prev) => ({ ...prev, contactName: e.target.value }))} placeholder={L.contactName} />
          <Input value={form.contactPhone} onChange={(e) => setForm((prev) => ({ ...prev, contactPhone: e.target.value }))} placeholder={L.contactPhone} />
          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
            />
            <Button variant="outline" className="flex-1 rounded-2xl" onClick={() => fileInputRef.current?.click()}>
              <Upload size={14} />
              {selectedFile ? selectedFile.name : L.pickPdf}
            </Button>
            <Button className="rounded-2xl" onClick={() => void handleUpload()} disabled={saving}>
              {L.upload}
            </Button>
          </div>
        </div>

        {error ? <p className="erp-text-caption mb-3 font-semibold text-red-600">{error}</p> : null}
        {success ? <p className="erp-text-caption mb-3 font-semibold text-emerald-600">{success}</p> : null}

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
