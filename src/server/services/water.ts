import type { Tx } from '../db';
import { AppError } from './errors';

export async function getWater(tx: Tx, date: string): Promise<number> {
  const [r] = await tx<{ ml: number }[]>`select ml from water_days where local_date = ${date}`;
  return r?.ml ?? 0;
}

/** Add (or subtract, with a negative delta) water for a day. Never goes below 0. */
export async function addWater(tx: Tx, date: string, deltaMl: number): Promise<number> {
  if (!Number.isInteger(deltaMl) || Math.abs(deltaMl) > 5000) throw new AppError('Invalid amount');
  const [r] = await tx<{ ml: number }[]>`
    insert into water_days (local_date, ml) values (${date}, greatest(0, ${deltaMl}))
    on conflict (user_id, local_date) do update set ml = least(20000, greatest(0, water_days.ml + ${deltaMl}))
    returning ml`;
  return r.ml;
}
