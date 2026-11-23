'use server';
import { redirect } from 'next/navigation';
import { currentUserId } from '@/server/auth';
import { getClient, issueCode } from '@/server/oauth/oauth';
import { SCOPE } from '@/server/oauth/http';

async function validated(form: FormData) {
  const p = new URLSearchParams(String(form.get('q') ?? ''));
  const client = await getClient(p.get('client_id') ?? '');
  const redirectUri = p.get('redirect_uri') ?? '';
  if (!client || !client.redirect_uris.includes(redirectUri)) throw new Error('Invalid client');
  return { p, client, redirectUri };
}

export async function approve(form: FormData) {
  const userId = await currentUserId();
  if (!userId) redirect('/login');
  const { p, client, redirectUri } = await validated(form);
  const challenge = p.get('code_challenge') ?? '';
  if (!challenge || p.get('code_challenge_method') !== 'S256' || p.get('response_type') !== 'code') throw new Error('Invalid request');
  const code = await issueCode({ clientId: client.client_id, userId, redirectUri, codeChallenge: challenge, scope: SCOPE });
  const to = new URL(redirectUri);
  to.searchParams.set('code', code);
  if (p.get('state')) to.searchParams.set('state', p.get('state')!);
  redirect(to.toString());
}

export async function deny(form: FormData) {
  const { p, redirectUri } = await validated(form);
  const to = new URL(redirectUri);
  to.searchParams.set('error', 'access_denied');
  if (p.get('state')) to.searchParams.set('state', p.get('state')!);
  redirect(to.toString());
}
