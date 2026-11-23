import type { Tx } from '../db';
import { addDays } from '@/lib/dates';

/** Consecutive days with at least one diary entry, ending today (or yesterday if today is still empty). */
export async function loggingStreak(tx: Tx, today: string): Promise<number> {
  const rows = await tx<{ d: string }[]>`
    select distinct to_char(local_date,'YYYY-MM-DD') as d from diary_entries
    where local_date between ${addDays(today, -400)} and ${today} order by d desc`;
  const days = new Set(rows.map((r) => r.d));
  let cur = days.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (days.has(cur)) {
    n++;
    cur = addDays(cur, -1);
  }
  return n;
}
