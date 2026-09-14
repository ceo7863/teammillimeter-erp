/**
 * Lightweight depositor-name alias manager for a client.
 * Explicit opt-in checkbox required before create.
 */
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  createDepositorAliasApi,
  disableDepositorAliasApi,
  fetchDepositorAliasesApi,
  type DepositorAliasRow,
} from "@/utils/erpApi";

export type DepositorAliasManagerProps = {
  clientId: string | number;
  clientName?: string;
  compact?: boolean;
  onChanged?: () => void;
};

function makeOpId() {
  return `depalias-ui-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function DepositorAliasManager({
  clientId,
  clientName,
  compact = false,
  onChanged,
}: DepositorAliasManagerProps) {
  const [aliases, setAliases] = useState<DepositorAliasRow[]>([]);
  const [rawName, setRawName] = useState("");
  const [explicitOptIn, setExplicitOptIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    setError("");
    try {
      const payload = await fetchDepositorAliasesApi({ clientId });
      setAliases(
        (payload as { depositorAliases?: DepositorAliasRow[] }).depositorAliases ||
          payload.aliases ||
          [],
      );
    } catch (err: any) {
      setError(err?.message || "입금자명 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate() {
    setError("");
    setMessage("");
    if (!explicitOptIn) {
      setError("자동 인식에 동의해야 저장됩니다.");
      return;
    }
    if (!String(rawName || "").trim()) {
      setError("입금자명을 입력하세요.");
      return;
    }
    setBusy(true);
    try {
      await createDepositorAliasApi({
        operationId: makeOpId(),
        clientId,
        rawName: String(rawName).trim(),
        explicitOptIn: true,
      });
      setRawName("");
      setExplicitOptIn(false);
      setMessage("입금자명 자동 인식이 등록되었습니다.");
      await load();
      onChanged?.();
    } catch (err: any) {
      setError(err?.message || "등록에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable(id: string) {
    setBusy(true);
    setError("");
    try {
      await disableDepositorAliasApi(id);
      await load();
      onChanged?.();
    } catch (err: any) {
      setError(err?.message || "비활성화에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  const active = aliases.filter((row) => row.status === "active");
  const disabled = aliases.filter((row) => row.status !== "active");

  return (
    <div
      className={compact ? "rounded-lg border border-slate-200 p-3" : "rounded-xl border border-slate-200 bg-white p-4"}
      data-depositor-alias-manager="true"
    >
      <div className="mb-3">
        <h3 className="text-sm font-bold text-slate-800">입금자명 자동 인식</h3>
        <p className="text-xs text-slate-500">
          {clientName || `거래처 ${clientId}`} · 명시적 동의 후에만 저장됩니다.
        </p>
      </div>

      <div className="mb-3 grid gap-2">
        <input
          className="rounded border border-slate-300 px-3 py-2 text-sm"
          placeholder="통장 입금자명 (예: 홍길동)"
          value={rawName}
          onChange={(e) => setRawName(e.target.value)}
          data-depositor-alias-name="true"
        />
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            className="mt-1"
            checked={explicitOptIn}
            onChange={(e) => setExplicitOptIn(e.target.checked)}
            data-depositor-alias-opt-in="true"
          />
          <span>앞으로 이 입금자명을 자동 인식</span>
        </label>
        <div className="flex justify-end">
          <Button type="button" size="sm" onClick={handleCreate} disabled={busy || !explicitOptIn}>
            등록
          </Button>
        </div>
      </div>

      {loading ? <div className="text-xs text-slate-500">불러오는 중…</div> : null}
      {error ? <div className="mb-2 text-xs text-red-600">{error}</div> : null}
      {message ? <div className="mb-2 text-xs text-emerald-700">{message}</div> : null}

      <ul className="space-y-2">
        {active.length === 0 && !loading ? (
          <li className="text-xs text-slate-400">활성 별칭 없음</li>
        ) : null}
        {active.map((row) => (
          <li
            key={row.id}
            className="flex items-center justify-between gap-2 rounded border border-slate-100 bg-slate-50 px-2 py-1.5 text-sm"
          >
            <span>
              <span className="font-medium text-slate-800">{row.rawName}</span>
              <span className="ml-2 text-xs text-slate-400">({row.normalizedName})</span>
            </span>
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => handleDisable(row.id)}>
              비활성
            </Button>
          </li>
        ))}
      </ul>

      {disabled.length ? (
        <details className="mt-3 text-xs text-slate-500">
          <summary>비활성 {disabled.length}건</summary>
          <ul className="mt-1 space-y-1">
            {disabled.map((row) => (
              <li key={row.id}>
                {row.rawName} · {row.disabledAt?.slice(0, 10) || "disabled"}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

export default DepositorAliasManager;
