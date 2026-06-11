import type { DailyTrendPoint } from "@/utils/probationEvalAnalytics";
import type { WorkerQuestionScore } from "@/utils/probationEvalHrRecord";

type RadarChartProps = {
  scores: WorkerQuestionScore[];
  size?: number;
  className?: string;
};

export function EvalRadarChart({ scores, size = 280, className = "" }: RadarChartProps) {
  const active = scores.filter((row) => row.responseCount > 0);
  const count = active.length;
  if (!count) {
    return (
      <div className={`flex items-center justify-center text-sm text-slate-400 ${className}`} style={{ minHeight: size }}>
        {"\uD3C9\uAC00 \uB370\uC774\uD130 \uC5C6\uC74C"}
      </div>
    );
  }

  const cx = size / 2;
  const cy = size / 2;
  const maxR = size * 0.34;
  const levels = [20, 40, 60, 80, 100];

  const points = active.map((row, index) => {
    const angle = (Math.PI * 2 * index) / count - Math.PI / 2;
    const ratio = Math.min(100, Math.max(0, row.averageScore)) / 100;
    const x = cx + Math.cos(angle) * maxR * ratio;
    const y = cy + Math.sin(angle) * maxR * ratio;
    const labelR = maxR + 28;
    const lx = cx + Math.cos(angle) * labelR;
    const ly = cy + Math.sin(angle) * labelR;
    return { row, x, y, lx, ly, angle };
  });

  const polygon = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className={`block w-full max-w-[320px] mx-auto ${className}`}
      role="img"
      aria-label={"\uC5ED\uB7C9 \uB808\uC774\uB354 \uCC28\uD2B8"}
    >
      {levels.map((level) => {
        const r = (level / 100) * maxR;
        const ring = active
          .map((_, index) => {
            const angle = (Math.PI * 2 * index) / count - Math.PI / 2;
            const x = cx + Math.cos(angle) * r;
            const y = cy + Math.sin(angle) * r;
            return `${x.toFixed(1)},${y.toFixed(1)}`;
          })
          .join(" ");
        return (
          <polygon
            key={level}
            points={ring}
            fill="none"
            stroke={level === 100 ? "#cbd5e1" : "#e2e8f0"}
            strokeWidth={level === 100 ? 1.2 : 0.8}
          />
        );
      })}
      {points.map((p, index) => (
        <line
          key={`axis-${index}`}
          x1={cx}
          y1={cy}
          x2={cx + Math.cos(p.angle) * maxR}
          y2={cy + Math.sin(p.angle) * maxR}
          stroke="#e2e8f0"
          strokeWidth="0.8"
        />
      ))}
      <polygon points={polygon} fill="rgba(37, 99, 235, 0.18)" stroke="#2563eb" strokeWidth="2" />
      {points.map((p) => (
        <circle key={p.row.questionId} cx={p.x} cy={p.y} r="3.5" fill="#2563eb" />
      ))}
      {points.map((p) => (
        <text
          key={`label-${p.row.questionId}`}
          x={p.lx}
          y={p.ly}
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-slate-600"
          style={{ fontSize: 9, fontWeight: 600 }}
        >
          {p.row.label.length > 8 ? `${p.row.label.slice(0, 7)}\u2026` : p.row.label}
        </text>
      ))}
    </svg>
  );
}

type TrendChartProps = {
  points: DailyTrendPoint[];
  width?: number;
  height?: number;
  className?: string;
};

export function EvalTrendChart({ points, width = 420, height = 200, className = "" }: TrendChartProps) {
  if (!points.length) {
    return (
      <div className={`flex items-center justify-center text-sm text-slate-400 ${className}`} style={{ minHeight: height }}>
        {"\uCD94\uC774 \uB370\uC774\uD130 \uC5C6\uC74C"}
      </div>
    );
  }

  const padding = { top: 16, right: 16, bottom: 32, left: 40 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;
  const maxScore = Math.max(100, ...points.map((row) => row.averageScore));
  const minScore = Math.min(0, ...points.map((row) => row.averageScore));
  const range = Math.max(1, maxScore - minScore);

  const coords = points.map((row, index) => {
    const x = padding.left + (points.length === 1 ? plotW / 2 : (index / (points.length - 1)) * plotW);
    const y = padding.top + plotH - ((row.averageScore - minScore) / range) * plotH;
    return { ...row, x, y };
  });

  const path = coords.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={`block w-full ${className}`}
      role="img"
      aria-label={"\uC77C\uBCC4 \uC810\uC218 \uCD94\uC774"}
    >
      {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
        const y = padding.top + plotH - ratio * plotH;
        const value = Math.round(minScore + range * ratio);
        return (
          <g key={ratio}>
            <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="#e2e8f0" strokeWidth="0.8" />
            <text x={padding.left - 6} y={y + 3} textAnchor="end" className="fill-slate-400" style={{ fontSize: 9 }}>
              {value}
            </text>
          </g>
        );
      })}
      <path d={path} fill="none" stroke="#0f766e" strokeWidth="2.2" />
      {coords.map((p) => (
        <g key={p.workDate}>
          <circle cx={p.x} cy={p.y} r="3.5" fill="#0f766e" />
          <text x={p.x} y={height - 8} textAnchor="middle" className="fill-slate-500" style={{ fontSize: 8 }}>
            {p.workDate.slice(5)}
          </text>
        </g>
      ))}
    </svg>
  );
}

type BarChartProps = {
  scores: WorkerQuestionScore[];
  className?: string;
};

export function EvalQuestionBarChart({ scores, className = "" }: BarChartProps) {
  const active = scores.filter((row) => row.responseCount > 0);
  if (!active.length) {
    return <div className={`text-sm text-slate-400 ${className}`}>{"\uD56D\uBAA9\uBCC4 \uB370\uC774\uD130 \uC5C6\uC74C"}</div>;
  }

  return (
    <div className={`space-y-2.5 ${className}`}>
      {active.map((row) => {
        const pct = Math.min(100, Math.max(0, row.averageScore));
        return (
          <div key={row.questionId} className="grid grid-cols-[88px_1fr_40px] items-center gap-2 text-xs">
            <span className="truncate font-semibold text-slate-600" title={row.label}>
              {row.label}
            </span>
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-600 to-blue-400"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-right font-bold text-slate-900">{Math.round(pct)}</span>
          </div>
        );
      })}
    </div>
  );
}
