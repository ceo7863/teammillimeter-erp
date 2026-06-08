import React, { useCallback, useEffect, useState } from "react";
import { RefreshCw, Server } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DesktopTableWrap } from "@/components/MobileRecordCard";
import { fetchSystemMetrics, type SystemMetrics } from "@/utils/systemMetricsApi";

const L = {
  title: "\uC11C\uBC84 \uB9AC\uC18C\uC2A4",
  desc: "EC2 \uC11C\uBC84\uC758 CPU, \uBA54\uBAA8\uB9AC, \uB514\uC2A4\uD06C, Node \uD504\uB85C\uC138\uC2A4 \uC0C1\uD0DC\uB97C \uC2E4\uC2DC\uAC04\uC73C\uB85C \uD655\uC778\uD569\uB2C8\uB2E4.",
  refresh: "\uC0C8\uB85C\uACE0\uCE68",
  autoRefresh: "5\uCD08 \uC790\uB3D9 \uC0C8\uB85C\uACE0\uCE68",
  loading: "\uC11C\uBC84 \uC815\uBCF4\uB97C \uBD88\uB7EC\uC624\uB294 \uC911...",
  loadError: "\uC11C\uBC84 \uC815\uBCF4\uB97C \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.",
  host: "\uD638\uC2A4\uD2B8",
  cpu: "CPU",
  memory: "\uBA54\uBAA8\uB9AC",
  disk: "\uB514\uC2A4\uD06C",
  process: "Node \uD504\uB85C\uC138\uC2A4",
  pm2: "PM2 \uD504\uB85C\uC138\uC2A4",
  storage: "\uC800\uC7A5\uC18C",
  cores: "\uCF54\uC5B4",
  loadAvg: "Load avg",
  uptime: "\uAC00\uB3D9 \uC2DC\uAC04",
  dbFile: "ERP DB",
  noPm2: "PM2\uAC00 \uC124\uCE58\uB418\uC9C0 \uC54A\uC558\uAC70\uB098 \uC811\uADFC\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.",
  updatedAt: "\uC870\uD68C",
  status: "\uC0C1\uD0DC",
  pid: "PID",
  restarts: "\uC7AC\uC2DC\uC791",
};

function formatBytes(bytes: number) {
  const value = Number(bytes) || 0;
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${Math.round(value)} B`;
}

function formatDuration(seconds: number) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days > 0) return `${days}\uC77C ${hours}\uC2DC\uAC04`;
  if (hours > 0) return `${hours}\uC2DC\uAC04 ${minutes}\uBD84`;
  return `${minutes}\uBD84`;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("ko-KR");
}

function UsageBar({ percent }: { percent: number }) {
  const safe = Math.max(0, Math.min(100, Number(percent) || 0));
  const tone = safe >= 90 ? "bg-rose-500" : safe >= 75 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${safe}%` }} />
    </div>
  );
}

function MetricCard({
  title,
  value,
  hint,
  percent,
}: {
  title: string;
  value: string;
  hint?: string;
  percent?: number;
}) {
  return (
    <Card className="erp-summary-card erp-summary-card--compact rounded-2xl shadow-sm">
      <CardContent className="p-4">
        <div className="erp-text-caption text-slate-500">{title}</div>
        <div className="erp-text-stat mt-1 text-slate-950">{value}</div>
        {hint ? <div className="mt-1 text-xs text-slate-400">{hint}</div> : null}
        {typeof percent === "number" ? <UsageBar percent={percent} /> : null}
      </CardContent>
    </Card>
  );
}

export function SystemDashboardPanel({ isActive }: { isActive: boolean }) {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError("");
    try {
      const result = await fetchSystemMetrics();
      setMetrics(result.metrics);
    } catch (err) {
      setError(err instanceof Error ? err.message : L.loadError);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!isActive) return undefined;
    void load(false);
    const timer = window.setInterval(() => {
      void load(true);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [isActive, load]);

  return (
    <div className="erp-system-dashboard-page space-y-4">
      <Card className="rounded-2xl shadow-sm">
        <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between md:p-5">
          <div>
            <div className="flex items-center gap-2">
              <Server className="h-5 w-5 text-slate-500" />
              <h2 className="erp-text-page-title text-slate-900">{L.title}</h2>
            </div>
            <p className="mt-1 erp-text-body text-slate-600">{L.desc}</p>
            {metrics ? (
              <p className="mt-2 text-xs text-slate-400">
                {L.updatedAt}: {formatDateTime(metrics.generatedAt)} | {L.autoRefresh}
              </p>
            ) : null}
          </div>
          <Button
            type="button"
            variant="outline"
            className="rounded-xl"
            disabled={loading || refreshing}
            onClick={() => void load(true)}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            {L.refresh}
          </Button>
        </CardContent>
      </Card>

      {loading && !metrics ? (
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-6 text-sm text-slate-500">{L.loading}</CardContent>
        </Card>
      ) : null}

      {error ? (
        <Card className="rounded-2xl border-rose-200 shadow-sm">
          <CardContent className="p-6 text-sm text-rose-700">{error}</CardContent>
        </Card>
      ) : null}

      {metrics ? (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              title={L.cpu}
              value={`${metrics.cpu.usagePercent}%`}
              hint={`${metrics.cpu.cores}${L.cores} | ${metrics.cpu.model || "-"}`}
              percent={metrics.cpu.usagePercent}
            />
            <MetricCard
              title={L.memory}
              value={`${metrics.memory.usedPercent}%`}
              hint={`${formatBytes(metrics.memory.usedBytes)} / ${formatBytes(metrics.memory.totalBytes)}`}
              percent={metrics.memory.usedPercent}
            />
            <MetricCard
              title={L.process}
              value={formatBytes(metrics.process.memoryRssBytes)}
              hint={`PID ${metrics.process.pid} | ${metrics.process.nodeVersion} | ${L.uptime} ${formatDuration(metrics.process.uptimeSeconds)}`}
            />
            <MetricCard
              title={L.storage}
              value={metrics.storage.dbBytes != null ? formatBytes(metrics.storage.dbBytes) : "-"}
              hint={metrics.storage.dbPath}
            />
          </div>

          <Card className="rounded-2xl shadow-sm">
            <CardContent className="p-4 md:p-5">
              <h3 className="erp-text-body font-bold text-slate-900">{L.host}</h3>
              <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-slate-600 md:grid-cols-2 xl:grid-cols-3">
                <div>{metrics.host.hostname}</div>
                <div>
                  {metrics.host.platform} / {metrics.host.arch}
                </div>
                <div>{metrics.host.release}</div>
                <div>
                  {L.uptime}: {formatDuration(metrics.host.uptimeSeconds)}
                </div>
                {metrics.cpu.loadAverage ? (
                  <div>
                    {L.loadAvg}: {metrics.cpu.loadAverage.join(" / ")}
                  </div>
                ) : null}
                <div>
                  Heap: {formatBytes(metrics.process.memoryHeapUsedBytes)} /{" "}
                  {formatBytes(metrics.process.memoryHeapTotalBytes)}
                </div>
              </div>
            </CardContent>
          </Card>

          {metrics.disk.length ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {metrics.disk.map((disk) => (
                <MetricCard
                  key={`${disk.label}-${disk.path}`}
                  title={`${L.disk} | ${disk.label}`}
                  value={`${disk.usedPercent}%`}
                  hint={`${formatBytes(disk.usedBytes)} / ${formatBytes(disk.totalBytes)} | ${disk.path}`}
                  percent={disk.usedPercent}
                />
              ))}
            </div>
          ) : null}

          <Card className="rounded-2xl shadow-sm">
            <CardContent className="p-4 md:p-5">
              <h3 className="erp-text-body font-bold text-slate-900">{L.pm2}</h3>
              {metrics.pm2?.length ? (
                <DesktopTableWrap className="mt-3">
                  <table className="erp-table erp-table--md w-full">
                    <thead>
                      <tr>
                        <th className="text-left">{"\uC774\uB984"}</th>
                        <th className="text-left">{L.status}</th>
                        <th className="text-right">CPU</th>
                        <th className="text-right">{L.memory}</th>
                        <th className="text-right">{L.pid}</th>
                        <th className="text-right">{L.restarts}</th>
                        <th className="text-right">{L.uptime}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metrics.pm2.map((row) => (
                        <tr key={`${row.name}-${row.pid}`}>
                          <td>{row.name}</td>
                          <td>{row.status}</td>
                          <td className="text-right">{row.cpu}%</td>
                          <td className="text-right">{formatBytes(row.memoryBytes)}</td>
                          <td className="text-right">{row.pid || "-"}</td>
                          <td className="text-right">{row.restarts}</td>
                          <td className="text-right">
                            {row.uptimeMs != null ? formatDuration(Math.round(row.uptimeMs / 1000)) : "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </DesktopTableWrap>
              ) : (
                <p className="mt-3 text-sm text-slate-500">{L.noPm2}</p>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
