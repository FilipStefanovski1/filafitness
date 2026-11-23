import Decimal from 'decimal.js';
import type { Tx } from '../db';
import { addDays, weekStart } from '@/lib/dates';

export interface DailyTotal {
  local_date: string;
  kcal: number;
  protein_g: number;
  entries: number;
  incomplete: number;
}

export async function dailyTotals(tx: Tx, from: string, to: string): Promise<DailyTotal[]> {
  return tx<DailyTotal[]>`
    select to_char(local_date,'YYYY-MM-DD') as local_date, sum(kcal) as kcal, coalesce(sum(protein_g),0) as protein_g,
           count(*)::int as entries, count(*) filter (where 'protein_g' = any(missing))::int as incomplete
    from diary_entries where local_date between ${from} and ${to}
    group by local_date order by local_date`;
}

export interface WeekAverage {
  week_start: string;
  days_logged: number;
  avg_kcal: number | null;
  avg_protein_g: number | null;
  /** Days where at least one entry had unknown protein. */
  protein_incomplete_days: number;
}

/** Averages over days that have at least one entry (unlogged days are not counted as zero). */
export async function weeklyAverages(tx: Tx, today: string, weeks = 8): Promise<WeekAverage[]> {
  const thisWeek = weekStart(today);
  const from = addDays(thisWeek, -7 * (weeks - 1));
  const days = await dailyTotals(tx, from, today);
  const out: WeekAverage[] = [];
  for (let w = 0; w < weeks; w++) {
    const start = addDays(thisWeek, -7 * w);
    const end = addDays(start, 6);
    const ds = days.filter((d) => d.local_date >= start && d.local_date <= end);
    const n = ds.length;
    out.push({
      week_start: start,
      days_logged: n,
      avg_kcal: n
        ? ds
            .reduce((s, d) => s.add(d.kcal), new Decimal(0))
            .div(n)
            .toNumber()
        : null,
      avg_protein_g: n
        ? ds
            .reduce((s, d) => s.add(d.protein_g), new Decimal(0))
            .div(n)
            .toNumber()
        : null,
      protein_incomplete_days: ds.filter((d) => d.incomplete > 0).length,
    });
  }
  return out;
}
