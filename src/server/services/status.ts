import type { Tx } from '../db';
import { remaining } from '@/lib/nutrition/calc';
import type { Slot } from '@/lib/nutrition/types';
import { round } from '@/lib/nutrition/format';
import { todayIn } from '@/lib/dates';
import { getDay, type DayView } from './diary';
import { getProfile, type Profile } from './profile';

/** Daily totals vs targets, rounded for reporting (MCP + summaries). */
export function statusFromDay(day: DayView, p: Profile) {
  const t = day.totals;
  return {
    date: day.date,
    consumed: {
      kcal: round(t.kcal, 0),
      protein_g: t.protein_g == null ? null : round(t.protein_g),
      carbs_g: t.carbs_g == null ? null : round(t.carbs_g),
      fat_g: t.fat_g == null ? null : round(t.fat_g),
    },
    targets: {
      kcal: p.kcal_target,
      protein_g: p.protein_target_g,
      carbs_g: p.carbs_target_g,
      fat_g: p.fat_target_g,
    },
    remaining: {
      kcal: round(remaining(p.kcal_target, t.kcal), 0),
      protein_g: round(remaining(p.protein_target_g, t.protein_g ?? 0)),
    },
    incomplete_macros: t.missing,
    incomplete_note: t.missing.length
      ? `${day.incompleteEntries} entr${day.incompleteEntries === 1 ? 'y has' : 'ies have'} unknown ${t.missing.map((m) => m.replace('_g', '')).join('/')}; those totals are lower bounds.`
      : null,
  };
}

export async function dailyStatus(tx: Tx, userId: string, date: string) {
  const [day, p] = await Promise.all([getDay(tx, date), getProfile(tx, userId)]);
  return statusFromDay(day, p);
}

/** Default meal slot from the local time of day. */
export function slotForHour(hour: number): Slot {
  if (hour >= 4 && hour < 11) return 'breakfast';
  if (hour >= 11 && hour < 16) return 'lunch';
  if (hour >= 16 && hour < 22) return 'dinner';
  return 'snacks';
}

export function localHour(tz: string, now = new Date()): number {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hour12: false }).format(now)) % 24;
}

/**
 * The diary date and meal a log lands on when the caller didn't say: the user's local
 * calendar date and time of day in their timezone (00:15 in Skopje is the new day).
 */
export function defaultLogTarget(tz: string, now: Date = new Date()): { date: string; slot: Slot } {
  return { date: todayIn(tz, now), slot: slotForHour(localHour(tz, now)) };
}
