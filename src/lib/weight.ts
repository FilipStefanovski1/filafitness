import Decimal from 'decimal.js';
import { addDays } from './dates';

export interface WeighIn {
  local_date: string;
  weight_kg: number;
}

export interface WindowStat {
  start: string;
  end: string;
  average: number | null;
  /** Number of days in the window that have a recorded weight. */
  days: number;
  sparse: boolean;
}

/** Windows with fewer recorded days than this are flagged as sparse. */
export const SPARSE_THRESHOLD = 4;

/** Average of recorded weights in [end-6, end]. Missing days are skipped, never zero-filled. */
export function windowStat(weights: WeighIn[], end: string, length = 7): WindowStat {
  const start = addDays(end, -(length - 1));
  const inWindow = weights.filter((w) => w.local_date >= start && w.local_date <= end);
  const avg = inWindow.length
    ? inWindow
        .reduce((s, w) => s.add(w.weight_kg), new Decimal(0))
        .div(inWindow.length)
        .toNumber()
    : null;
  return { start, end, average: avg, days: inWindow.length, sparse: inWindow.length < SPARSE_THRESHOLD };
}

export interface TrendPoint {
  date: string;
  weight: number | null;
  avg7: number | null;
  days: number;
}

/** One point per calendar day from `from` to `to` (inclusive); weight is null where not recorded. */
export function trendSeries(weights: WeighIn[], from: string, to: string): TrendPoint[] {
  const byDate = new Map(weights.map((w) => [w.local_date, w.weight_kg]));
  const out: TrendPoint[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const s = windowStat(weights, d);
    out.push({ date: d, weight: byDate.get(d) ?? null, avg7: s.average, days: s.days });
  }
  return out;
}

export interface TrendSummary {
  current: WindowStat;
  previous: WindowStat;
  /** current.average - previous.average, when both windows have data. */
  change: number | null;
  latest: WeighIn | null;
}

export function trendSummary(weights: WeighIn[], today: string): TrendSummary {
  const current = windowStat(weights, today);
  const previous = windowStat(weights, addDays(today, -7));
  const change = current.average != null && previous.average != null ? new Decimal(current.average).sub(previous.average).toNumber() : null;
  const sorted = [...weights].filter((w) => w.local_date <= today).sort((a, b) => a.local_date.localeCompare(b.local_date));
  return { current, previous, change, latest: sorted.at(-1) ?? null };
}
