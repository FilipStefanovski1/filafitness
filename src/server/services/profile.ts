import type { Tx } from '../db';
import { DEFAULT_TZ, isValidTimeZone } from '@/lib/dates';
import { AppError } from './errors';
import { profileInputSchema } from './schemas';

export interface Profile {
  user_id: string;
  display_name: string;
  timezone: string;
  kcal_target: number;
  protein_target_g: number;
  carbs_target_g: number | null;
  fat_target_g: number | null;
  goal_weight_kg: number | null;
  onboarded: boolean;
}

export async function getProfile(tx: Tx, userId: string): Promise<Profile> {
  const [p] = await tx<Profile[]>`select * from profiles where user_id = ${userId}`;
  if (p) return { ...p, timezone: isValidTimeZone(p.timezone) ? p.timezone : DEFAULT_TZ };
  // Created by trigger on invite; recreate defensively for users made before the trigger.
  const [created] = await tx<Profile[]>`insert into profiles (user_id) values (${userId}) returning *`;
  return created;
}

export async function updateProfile(tx: Tx, userId: string, raw: unknown, opts: { onboard?: boolean } = {}): Promise<Profile> {
  const input = profileInputSchema.parse(raw);
  if (!isValidTimeZone(input.timezone)) throw new AppError('Unknown timezone');
  const [p] = await tx<Profile[]>`
    update profiles set
      display_name = ${input.display_name},
      timezone = ${input.timezone},
      kcal_target = ${input.kcal_target},
      protein_target_g = ${input.protein_target_g},
      carbs_target_g = ${input.carbs_target_g ?? null},
      fat_target_g = ${input.fat_target_g ?? null},
      goal_weight_kg = ${input.goal_weight_kg ?? null},
      onboarded = onboarded or ${!!opts.onboard}
    where user_id = ${userId} returning *`;
  if (!p) throw new AppError('Profile not found', 404);
  return p;
}
