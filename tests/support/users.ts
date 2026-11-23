import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

config({ path: '.env.local' });

export function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface TestUser {
  id: string;
  email: string;
  password: string;
}

export async function createTestUser(name: string, meta: Record<string, unknown> = {}): Promise<TestUser> {
  const email = `test-${name.toLowerCase()}-${randomUUID().slice(0, 8)}@filafitness.test`;
  const password = `pw-${randomUUID()}`;
  const { data, error } = await admin().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: name, ...meta },
  });
  if (error || !data.user) throw error ?? new Error('no user');
  return { id: data.user.id, email, password };
}

export async function deleteTestUser(u: TestUser | undefined) {
  if (u) await admin().auth.admin.deleteUser(u.id);
}
