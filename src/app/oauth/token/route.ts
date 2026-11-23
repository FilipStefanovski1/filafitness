import { json, preflight } from '@/server/oauth/http';
import { exchangeCode, refresh } from '@/server/oauth/oauth';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const ct = req.headers.get('content-type') ?? '';
  const params = ct.includes('application/json')
    ? new URLSearchParams(Object.entries((await req.json().catch(() => ({}))) as Record<string, string>))
    : new URLSearchParams(await req.text());
  let clientId = params.get('client_id') ?? '';
  const basic = req.headers.get('authorization')?.match(/^Basic\s+(.+)$/i)?.[1];
  if (!clientId && basic) clientId = Buffer.from(basic, 'base64').toString().split(':')[0] ?? '';

  const grant = params.get('grant_type');
  const result =
    grant === 'authorization_code'
      ? await exchangeCode({
          code: params.get('code') ?? '',
          clientId,
          redirectUri: params.get('redirect_uri') ?? '',
          verifier: params.get('code_verifier') ?? '',
        })
      : grant === 'refresh_token'
        ? await refresh({ refreshToken: params.get('refresh_token') ?? '', clientId })
        : { ok: false as const, error: 'unsupported_grant_type', description: 'Use authorization_code or refresh_token' };
  if (!result.ok) return json({ error: result.error, error_description: result.description }, 400);
  return json(result.body);
}
export const OPTIONS = preflight;
