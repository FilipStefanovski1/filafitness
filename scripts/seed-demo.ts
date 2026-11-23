/**
 * LOCAL DEMO ONLY. Creates two demo accounts on the local Supabase stack and fills them
 * with sample data. Refuses to run against a non-local database.
 *
 *   npm run seed:demo
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';
import { asUser, closeDb } from '../src/server/db';
import { seedDemoBulker, seedDemoPartner } from '../src/server/demo';
import { todayIn } from '../src/lib/dates';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const dbUrl = process.env.DATABASE_URL!;
if (!/127\.0\.0\.1|localhost/.test(url) || !/127\.0\.0\.1|localhost/.test(dbUrl)) {
  console.error('Refusing to seed demo data outside local development.');
  process.exit(1);
}
const admin = createClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });

const ACCOUNTS = [
  {
    email: 'filip@demo.local',
    password: 'demo-filip-1234',
    meta: { display_name: 'Filip (demo)', kcal_target: 2900, protein_target_g: 150, goal_weight_kg: 80 },
    seed: seedDemoBulker,
  },
  {
    email: 'partner@demo.local',
    password: 'demo-partner-1234',
    meta: { display_name: 'Partner (demo)', kcal_target: 1800, protein_target_g: 100 },
    seed: seedDemoPartner,
  },
];

async function main() {
  const { data: list } = await admin.auth.admin.listUsers();
  for (const a of ACCOUNTS) {
    const existing = list.users.find((u) => u.email === a.email);
    if (existing) await admin.auth.admin.deleteUser(existing.id);
    const { data, error } = await admin.auth.admin.createUser({
      email: a.email,
      password: a.password,
      email_confirm: true,
      user_metadata: a.meta,
    });
    if (error || !data.user) throw error;
    const id = data.user.id;
    await asUser(id, async (tx) => {
      await tx`update profiles set onboarded = true`;
      await a.seed(tx, todayIn('Europe/Skopje'));
    });
    console.log(`✓ ${a.email} / ${a.password}`);
  }
  await closeDb();
}
main().catch(async (e) => {
  console.error(e);
  await closeDb();
  process.exit(1);
});
