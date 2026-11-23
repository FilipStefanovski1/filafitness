import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { privileged } from '../db';
import { randomToken, sha256 } from '../services/tokens';

/**
 * Minimal OAuth 2.1 authorization server for MCP clients (ChatGPT, Claude, Inspector):
 * dynamic client registration, authorization code + PKCE (S256), refresh-token rotation.
 * Tokens are opaque, stored hashed, and map to exactly one user.
 */
export const ACCESS_TTL_S = 60 * 60; // 1 hour
export const REFRESH_TTL_S = 60 * 60 * 24 * 90; // 90 days
const CODE_TTL_S = 300;

export interface OAuthClient {
  client_id: string;
  client_name: string | null;
  redirect_uris: string[];
}

export function validRedirectUri(u: string): boolean {
  try {
    const url = new URL(u);
    if (url.hash) return false;
    if (url.protocol === 'https:') return true;
    return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
}

export async function registerClient(input: { client_name?: unknown; redirect_uris?: unknown }): Promise<OAuthClient> {
  const uris = Array.isArray(input.redirect_uris) ? input.redirect_uris.filter((u): u is string => typeof u === 'string') : [];
  if (uris.length === 0 || uris.length > 10 || !uris.every(validRedirectUri)) throw new Error('invalid_redirect_uri');
  const name = typeof input.client_name === 'string' ? input.client_name.slice(0, 100) : null;
  const client_id = `ffc_${randomBytes(16).toString('base64url')}`;
  const db = privileged();
  await db`insert into oauth_clients (client_id, client_name, redirect_uris) values (${client_id}, ${name}, ${uris})`;
  return { client_id, client_name: name, redirect_uris: uris };
}

export async function getClient(clientId: string): Promise<OAuthClient | null> {
  if (!clientId || clientId.length > 100) return null;
  const [c] = await privileged()<
    OAuthClient[]
  >`select client_id, client_name, redirect_uris from oauth_clients where client_id = ${clientId}`;
  return c ?? null;
}

/** Called after the signed-in user approves on the consent page. */
export async function issueCode(p: { clientId: string; userId: string; redirectUri: string; codeChallenge: string; scope: string }) {
  const code = randomToken('ffo');
  await privileged()`
    insert into oauth_codes (code_hash, client_id, user_id, redirect_uri, code_challenge, scope, expires_at)
    values (${sha256(code)}, ${p.clientId}, ${p.userId}, ${p.redirectUri}, ${p.codeChallenge}, ${p.scope}, now() + make_interval(secs => ${CODE_TTL_S}))`;
  return code;
}

const s256 = (verifier: string) => createHash('sha256').update(verifier).digest('base64url');

async function issueTokens(userId: string, clientId: string, clientName: string | null, scope: string) {
  const access = randomToken('ffa');
  const refresh = randomToken('ffr');
  const db = privileged();
  const name = `OAuth: ${clientName ?? clientId}`;
  await db`
    insert into api_tokens (user_id, name, kind, token_hash, token_prefix, client_id, expires_at) values
      (${userId}, ${name}, 'oauth_access', ${sha256(access)}, ${access.slice(0, 8)}, ${clientId}, now() + make_interval(secs => ${ACCESS_TTL_S})),
      (${userId}, ${name}, 'oauth_refresh', ${sha256(refresh)}, ${refresh.slice(0, 8)}, ${clientId}, now() + make_interval(secs => ${REFRESH_TTL_S}))`;
  return { access_token: access, token_type: 'Bearer', expires_in: ACCESS_TTL_S, refresh_token: refresh, scope };
}

export type TokenResult = { ok: true; body: Awaited<ReturnType<typeof issueTokens>> } | { ok: false; error: string; description: string };

export async function exchangeCode(p: { code: string; clientId: string; redirectUri: string; verifier: string }): Promise<TokenResult> {
  const db = privileged();
  return db.begin(async (tx) => {
    const [row] = await tx<
      {
        client_id: string;
        user_id: string;
        redirect_uri: string;
        code_challenge: string;
        scope: string;
        expired: boolean;
        used_at: Date | null;
      }[]
    >`
      select client_id, user_id, redirect_uri, code_challenge, scope, expires_at < now() as expired, used_at
      from oauth_codes where code_hash = ${sha256(p.code)} for update`;
    if (!row || row.expired || row.used_at)
      return { ok: false, error: 'invalid_grant', description: 'Code is invalid, expired or already used' } as const;
    if (row.client_id !== p.clientId || row.redirect_uri !== p.redirectUri)
      return { ok: false, error: 'invalid_grant', description: 'Client or redirect_uri mismatch' } as const;
    if (!p.verifier || s256(p.verifier) !== row.code_challenge)
      return { ok: false, error: 'invalid_grant', description: 'PKCE verification failed' } as const;
    await tx`update oauth_codes set used_at = now() where code_hash = ${sha256(p.code)}`;
    const client = await getClient(p.clientId);
    return { ok: true, body: await issueTokens(row.user_id, p.clientId, client?.client_name ?? null, row.scope) } as const;
  }) as Promise<TokenResult>;
}

export async function refresh(p: { refreshToken: string; clientId: string }): Promise<TokenResult> {
  const db = privileged();
  const [row] = await db<{ user_id: string; client_id: string }[]>`
    update api_tokens set revoked_at = now()
    where token_hash = ${sha256(p.refreshToken)} and kind = 'oauth_refresh' and revoked_at is null and expires_at > now()
      and (${p.clientId} = '' or client_id = ${p.clientId})
    returning user_id, client_id`;
  if (!row) return { ok: false, error: 'invalid_grant', description: 'Refresh token is invalid or expired' };
  const client = await getClient(row.client_id);
  return { ok: true, body: await issueTokens(row.user_id, row.client_id, client?.client_name ?? null, 'diary') };
}
