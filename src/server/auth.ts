import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { asUser } from './db';
import { getProfile, type Profile } from './services/profile';

/** The verified user id from the Supabase session (JWT signature checked), or null. */
export const currentUserId = cache(async (): Promise<string | null> => {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  return typeof sub === 'string' ? sub : null;
});

export const requireUser = cache(async (opts: { allowNotOnboarded?: boolean } = {}): Promise<{ userId: string; profile: Profile }> => {
  const userId = await currentUserId();
  if (!userId) redirect('/login');
  const profile = await asUser(userId, (tx) => getProfile(tx, userId));
  if (!profile.onboarded && !opts.allowNotOnboarded) redirect('/onboarding');
  return { userId, profile };
});
