import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { buildMcpServer } from '@/server/mcp/server';
import { resolveBearer } from '@/server/services/tokens';
import { CORS, originOf, preflight } from '@/server/oauth/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Remote MCP endpoint (Streamable HTTP, stateless). Identity comes only from the bearer
 * token (OAuth access token or personal token), never from tool arguments.
 */
async function handle(req: Request): Promise<Response> {
  const token = req.headers.get('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
  const who = token ? await resolveBearer(token) : null;
  if (!who) {
    const origin = originOf(req);
    return new Response(JSON.stringify({ error: 'invalid_token', error_description: 'Sign in to FilaFitness to connect.' }), {
      status: 401,
      headers: {
        ...CORS,
        'Content-Type': 'application/json',
        'WWW-Authenticate': `Bearer realm="filafitness", resource_metadata="${origin}/.well-known/oauth-protected-resource/api/mcp"`,
      },
    });
  }
  const server = buildMcpServer(who.userId);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    const res = await transport.handleRequest(req);
    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
    const body = await res.text(); // JSON response mode: fully materialize before closing
    return new Response(body, { status: res.status, headers });
  } finally {
    await server.close();
  }
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
export const OPTIONS = preflight;
