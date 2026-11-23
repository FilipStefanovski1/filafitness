import { createHash, randomBytes } from 'node:crypto';
import { privileged, type Tx } from '../db';
import { AppError } from './errors';

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
export const randomToken = (prefix: string) => `${prefix}_${randomBytes(32).toString('base64url')}`;

export interface TokenRow {
  id: string;
  name: string;
  kind: string;
  token_prefix: string;
  client_id: string | null;
  expires_at: Date | null;
  last_used_at: Date | null;
  revoked_at: Date | null;
  created_at: Date;
}

/** Personal access token for MCP clients that accept a bearer header. Shown once. */
export async function createPersonalToken(tx: Tx, name: string): Promise<{ token: string; row: TokenRow }> {
  const clean = name.trim().slice(0, 60) || 'MCP client';
  const token = randomToken('ffp');
  const [row] = await tx<TokenRow[]>`
    insert into api_tokens (name, kind, token_hash, token_prefix)
    values (${clean}, 'pat', ${sha256(token)}, ${token.slice(0, 8)})
    returning id, name, kind, token_prefix, client_id, expires_at, last_used_at, revoked_at, created_at`;
  return { token, row };
}

export async function listTokens(tx: Tx): Promise<TokenRow[]> {
  return tx<TokenRow[]>`
    select id, name, kind, token_prefix, client_id, expires_at, last_used_at, revoked_at, created_at
    from api_tokens where kind <> 'oauth_refresh' and revoked_at is null and (expires_at is null or expires_at > now())
    order by created_at desc`;
}

export async function revokeToken(tx: Tx, id: string) {
  const r = await tx`update api_tokens set revoked_at = now() where id = ${id} returning id, client_id, user_id`;
  if (r.length === 0) throw new AppError('Token not found', 404);
  // Revoking an OAuth access token also revokes the connection's refresh tokens.
  const clientId = r[0].client_id as string | null;
  if (clientId) await tx`update api_tokens set revoked_at = now() where client_id = ${clientId} and revoked_at is null`;
}

/**
 * Resolve a bearer token to a user id. This is the ONLY way the MCP server learns who
 * is calling; tool arguments never influence identity.
 */
export async function resolveBearer(token: string): Promise<{ userId: string; tokenId: string } | null> {
  if (!token || token.length < 20 || token.length > 200) return null;
  const db = privileged();
  const [row] = await db<{ id: string; user_id: string }[]>`
    update api_tokens set last_used_at = now()
    where token_hash = ${sha256(token)} and kind in ('pat','oauth_access') and revoked_at is null
      and (expires_at is null or expires_at > now())
    returning id, user_id`;
  return row ? { userId: row.user_id, tokenId: row.id } : null;
}
