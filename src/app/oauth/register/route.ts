import { json, preflight } from '@/server/oauth/http';
import { registerClient } from '@/server/oauth/oauth';

export const dynamic = 'force-dynamic';

/** RFC 7591 dynamic client registration (public clients, PKCE required). */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_client_metadata', error_description: 'Body must be JSON' }, 400);
  }
  try {
    const c = await registerClient(body);
    return json(
      {
        client_id: c.client_id,
        client_id_issued_at: Math.floor(Date.now() / 1000),
        client_name: c.client_name ?? undefined,
        redirect_uris: c.redirect_uris,
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
      },
      201,
    );
  } catch {
    return json({ error: 'invalid_redirect_uri', error_description: 'redirect_uris must be https (or http on localhost)' }, 400);
  }
}
export const OPTIONS = preflight;
