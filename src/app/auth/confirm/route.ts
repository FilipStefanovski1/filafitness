import { NextResponse } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { supabaseServer } from '@/lib/supabase/server';

/** Invite / recovery links (token_hash). Invited users set a password next. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token_hash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') as EmailOtpType | null;
  if (token_hash && type) {
    const { error } = await (await supabaseServer()).auth.verifyOtp({ token_hash, type });
    if (!error) return NextResponse.redirect(new URL(type === 'invite' || type === 'recovery' ? '/auth/set-password' : '/', url.origin));
  }
  return NextResponse.redirect(new URL('/login?error=That invite link is invalid or expired. Ask for a new one.', url.origin));
}
