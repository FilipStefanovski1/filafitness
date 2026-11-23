import { json, originOf, preflight, SCOPE } from '@/server/oauth/http';

export const dynamic = 'force-dynamic';

export function GET(req: Request) {
  const origin = originOf(req);
  return json({
    resource: `${origin}/api/mcp`,
    authorization_servers: [origin],
    bearer_methods_supported: ['header'],
    scopes_supported: [SCOPE],
    resource_name: 'FilaFitness diary',
  });
}
export const OPTIONS = preflight;
