import type { Tx } from '../db';
import { addDays } from '@/lib/dates';
import { trendSeries, trendSummary, type WeighIn } from '@/lib/weight';
import { AppError } from './errors';
import { z } from 'zod';
import { dateSchema } from './schemas';

export const weighInSchema = z.object({
  date: dateSchema,
  weight_kg: z.coerce.number().finite().min(20).max(400),
  note: z.string().trim().max(500).nullable().optional(),
});

export interface WeighInRow extends WeighIn {
  id: string;
  note: string | null;
}

/** One weigh-in per local date; logging again for the same date replaces it. */
export async function upsertWeighIn(tx: Tx, raw: unknown): Promise<WeighInRow> {
  const input = weighInSchema.parse(raw);
  const [row] = await tx<WeighInRow[]>`
    insert into weigh_ins (local_date, weight_kg, note) values (${input.date}, ${input.weight_kg}, ${input.note ?? null})
    on conflict (user_id, local_date) do update set weight_kg = excluded.weight_kg, note = excluded.note
    returning id, to_char(local_date,'YYYY-MM-DD') as local_date, weight_kg, note`;
  return row;
}

export async function deleteWeighIn(tx: Tx, date: string) {
  const r = await tx`delete from weigh_ins where local_date = ${date} returning id`;
  if (r.length === 0) throw new AppError('No weigh-in on that date', 404);
}

export async function listWeighIns(tx: Tx, from: string, to: string): Promise<WeighInRow[]> {
  return tx<WeighInRow[]>`
    select id, to_char(local_date,'YYYY-MM-DD') as local_date, weight_kg, note from weigh_ins
    where local_date between ${from} and ${to} order by local_date`;
}

export async function weightTrend(tx: Tx, today: string, days = 56) {
  const from = addDays(today, -(days - 1));
  // Load 6 extra days so the first plotted 7-day average is complete.
  const weights = await listWeighIns(tx, addDays(from, -6), today);
  return {
    weights: weights.filter((w) => w.local_date >= from),
    series: trendSeries(weights, from, today),
    summary: trendSummary(weights, today),
  };
}
