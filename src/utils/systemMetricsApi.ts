import { apiRequest } from "@/utils/erpApi";

export type SystemMetricsDisk = {
  label: string;
  path: string;
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  usedPercent: number;
};

export type SystemMetricsPm2Process = {
  name: string;
  status: string;
  cpu: number;
  memoryBytes: number;
  pid: number;
  restarts: number;
  uptimeMs: number | null;
};

export type SystemMetricsStorageItem = {
  key: string;
  label: string;
  path: string;
  bytes: number;
};

export type SystemMetrics = {
  generatedAt: string;
  host: {
    hostname: string;
    platform: string;
    arch: string;
    release: string;
    uptimeSeconds: number;
  };
  cpu: {
    model: string;
    cores: number;
    speedMhz: number;
    usagePercent: number;
    loadAverage: [number, number, number] | null;
  };
  memory: {
    totalBytes: number;
    usedBytes: number;
    freeBytes: number;
    usedPercent: number;
  };
  disk: SystemMetricsDisk[];
  process: {
    pid: number;
    uptimeSeconds: number;
    nodeVersion: string;
    memoryRssBytes: number;
    memoryHeapUsedBytes: number;
    memoryHeapTotalBytes: number;
  };
  pm2: SystemMetricsPm2Process[] | null;
  storage: {
    dbPath: string;
    dbBytes: number | null;
    dataDir: string;
    dataDirBytes: number | null;
    breakdown: SystemMetricsStorageItem[];
  };
};

export async function fetchSystemMetrics() {
  return apiRequest<{ metrics: SystemMetrics }>("/system/metrics");
}
