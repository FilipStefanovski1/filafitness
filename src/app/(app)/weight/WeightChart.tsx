import type { TrendPoint } from '@/lib/weight';
import { formatShortDate } from '@/lib/dates';

/** Dots for recorded weigh-ins, a line for the 7-day average. Gaps stay gaps. */
export function WeightChart({ series, goal }: { series: TrendPoint[]; goal: number | null }) {
  const vals = series.flatMap((p) => [p.weight, p.avg7]).filter((v): v is number => v != null);
  if (vals.length === 0) return <p className="py-10 text-center text-sm text-muted">Log a weigh-in to see your trend.</p>;
  const W = 340,
    H = 180,
    L = 34,
    R = 8,
    T = 10,
    B = 22;
  let min = Math.min(...vals),
    max = Math.max(...vals);
  if (goal && goal - max < 1.5 && goal > max) max = goal;
  const pad = Math.max(0.3, (max - min) * 0.15);
  min -= pad;
  max += pad;
  const x = (i: number) => L + (i / Math.max(series.length - 1, 1)) * (W - L - R);
  const y = (v: number) => T + (1 - (v - min) / (max - min)) * (H - T - B);
  const segments: string[] = [];
  let cur = '';
  series.forEach((p, i) => {
    if (p.avg7 == null) {
      if (cur) segments.push(cur);
      cur = '';
      return;
    }
    cur += `${cur ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.avg7).toFixed(1)}`;
  });
  if (cur) segments.push(cur);
  const ticks = [min + pad, (min + max) / 2, max - pad];
  const labelIdx = [0, Math.floor((series.length - 1) / 2), series.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Weight and 7-day average chart">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth="1" />
          <text x={L - 4} y={y(t) + 3} textAnchor="end" fontSize="9" fill="var(--muted)">
            {t.toFixed(1)}
          </text>
        </g>
      ))}
      {goal && goal >= min && goal <= max && (
        <g>
          <line x1={L} x2={W - R} y1={y(goal)} y2={y(goal)} stroke="var(--good)" strokeDasharray="4 3" strokeWidth="1" />
          <text x={W - R} y={y(goal) - 3} textAnchor="end" fontSize="9" fill="var(--good)">
            goal {goal}
          </text>
        </g>
      )}
      {segments.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="var(--accent)" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
      ))}
      {series.map(
        (p, i) => p.weight != null && <circle key={p.date} cx={x(i)} cy={y(p.weight)} r="2.8" fill="var(--ink)" fillOpacity="0.45" />,
      )}
      {labelIdx.map(
        (i) =>
          series[i] && (
            <text
              key={i}
              x={x(i)}
              y={H - 6}
              textAnchor={i === 0 ? 'start' : i === series.length - 1 ? 'end' : 'middle'}
              fontSize="9"
              fill="var(--muted)"
            >
              {formatShortDate(series[i].date)}
            </text>
          ),
      )}
    </svg>
  );
}
