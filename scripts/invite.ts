/**
 * Invite one of the two real accounts (public sign-up is disabled).
 *
 *   npm run invite -- --email you@example.com --name Filip --kcal 2900 --protein 150 --goal 80
 *   npm run invite -- --email her@example.com --name Ana            (she sets her own goals)
 *
 * Prints a one-time invite link you can send yourself (no email setup needed). Add --send
 * to also have Supabase email the invite. The targets only prefill onboarding.
 * Uses SUPABASE_SECRET_KEY + NEXT_PUBLIC_SUPABASE_URL + APP_URL from the environment
 * (.env.local by default, or pass --env .env.production.local).
 */
import { config } from 'dotenv';
import { parseArgs } from 'node:util';
import { createClient } from '@supabase/supabase-js';

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    name: { type: 'string' },
    kcal: { type: 'string' },
    protein: { type: 'string' },
    goal: { type: 'string' },
    tz: { type: 'string' },
    send: { type: 'boolean' },
    env: { type: 'string' },
  },
});
config({ path: values.env ?? '.env.local' });
if (!values.email) {
  console.error('Usage: npm run invite -- --email someone@example.com [--name Name] [--kcal 2900 --protein 150 --goal 80] [--send]');
  process.exit(1);
}
const appUrl = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const data: Record<string, unknown> = { display_name: values.name ?? values.email.split('@')[0] };
if (values.kcal) data.kcal_target = Number(values.kcal);
if (values.protein) data.protein_target_g = Number(values.protein);
if (values.goal) data.goal_weight_kg = Number(values.goal);
if (values.tz) data.timezone = values.tz;

async function main() {
  if (values.send) {
    const { error } = await admin.auth.admin.inviteUserByEmail(values.email!, { data, redirectTo: `${appUrl}/auth/set-password` });
    if (error) throw error;
    console.log(`✓ Supabase sent an invite email to ${values.email}`);
    return;
  }
  const { data: link, error } = await admin.auth.admin.generateLink({
    type: 'invite',
    email: values.email!,
    options: { data, redirectTo: `${appUrl}/auth/set-password` },
  });
  if (error) throw error;
  const url = `${appUrl}/auth/confirm?token_hash=${link.properties.hashed_token}&type=invite`;
  console.log(`✓ Invited ${values.email}. Send them this one-time link (expires in 24 h by default):\n\n${url}\n`);
}
main().catch((e) => {
  console.error('Invite failed:', e.message ?? e);
  process.exit(1);
});
