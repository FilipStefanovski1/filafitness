/**
 * End-to-end MCP tests over HTTP with the official SDK client. Requires the app running
 * (npm run dev or npm start) at MCP_BASE_URL (default http://localhost:3000).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createTestUser, deleteTestUser, type TestUser } from '../support/users';
import { asUser, closeDb } from '@/server/db';
import { createFood } from '@/server/services/foods';
import { createPersonalToken } from '@/server/services/tokens';
import { issueCode } from '@/server/oauth/oauth';
import { DEMO_SHAKE } from '@/server/demo';
import { todayIn } from '@/lib/dates';

const BASE = process.env.MCP_BASE_URL ?? 'http://localhost:3000';
let a: TestUser, b: TestUser;
let tokenA: string, tokenB: string;
let shakeId: string;
const clients: Client[] = [];

async function connect(token: string) {
  const client = new Client({ name: 'filafitness-test', version: '1.0.0' });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${BASE}/api/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }),
  );
  clients.push(client);
  return client;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tool results are free-form JSON
type R = { structuredContent?: Record<string, any>; isError?: boolean; content: Array<{ type: string; text?: string }> };
const call = async (c: Client, name: string, args: Record<string, unknown>) =>
  (await c.callTool({ name, arguments: args })) as unknown as R;
const countEntries = (u: TestUser) => asUser(u.id, async (tx) => (await tx`select count(*)::int as n from diary_entries`)[0].n as number);

beforeAll(async () => {
  a = await createTestUser('McpA', { kcal_target: 2900, protein_target_g: 150 });
  b = await createTestUser('McpB', { kcal_target: 1800, protein_target_g: 100 });
  await asUser(a.id, async (tx) => {
    shakeId = (await createFood(tx, DEMO_SHAKE)).id;
    await createFood(tx, { ...DEMO_SHAKE, name: 'Protein bar', aliases: ['protein'], default_unit: 'serving', units: [] });
    tokenA = (await createPersonalToken(tx, 'test')).token;
  });
  tokenB = await asUser(b.id, async (tx) => (await createPersonalToken(tx, 'test')).token);
});
afterAll(async () => {
  await Promise.all(clients.map((c) => c.close().catch(() => undefined)));
  await deleteTestUser(a);
  await deleteTestUser(b);
  await closeDb();
});

describe('MCP authentication', () => {
  it('rejects missing or invalid tokens with OAuth discovery metadata', async () => {
    const r = await fetch(`${BASE}/api/mcp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    expect(r.status).toBe(401);
    expect(r.headers.get('www-authenticate')).toContain('resource_metadata=');
    const bad = await fetch(`${BASE}/api/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ffp_not-a-real-token-xxxxxxxxxxxx' },
      body: '{}',
    });
    expect(bad.status).toBe(401);
    const meta = await (await fetch(`${BASE}/.well-known/oauth-protected-resource/api/mcp`)).json();
    expect(meta.resource).toMatch(/\/api\/mcp$/);
    const as = await (await fetch(`${BASE}/.well-known/oauth-authorization-server`)).json();
    expect(as.code_challenge_methods_supported).toEqual(['S256']);
    expect(as.registration_endpoint).toMatch(/\/oauth\/register$/);
  });

  it('lists the tools; none of them accepts a user identifier', async () => {
    const c = await connect(tokenA);
    const { tools } = await c.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      [
        'get_daily_summary',
        'get_weight_trend',
        'log_estimate',
        'log_saved_item',
        'log_weigh_in',
        'preview_nutrition',
        'search_library',
      ].sort(),
    );
    for (const t of tools) {
      const props = Object.keys((t.inputSchema as { properties?: object }).properties ?? {});
      expect(
        props.some((p) => /user|account|owner|email/i.test(p)),
        t.name,
      ).toBe(false);
    }
  });
});

describe('MCP logging', () => {
  it('replaying a write returns the original result; a new request id logs again', async () => {
    const c = await connect(tokenA);
    const rid = randomUUID();
    const args = { request_id: rid, id: shakeId, use_default_portion: true, meal: 'snacks' };
    const first = await call(c, 'log_saved_item', args);
    expect(first.isError).toBeFalsy();
    const s1 = first.structuredContent!;
    expect(s1.status).toBe('logged');
    expect(s1.saved.protein_g).toBe(25);
    expect(s1.saved.date).toBe(todayIn('Europe/Skopje'));
    expect(s1.day.remaining.protein_g).toBe(125);
    expect(s1.day.targets.kcal).toBe(2900);

    const retry = await call(c, 'log_saved_item', args);
    expect(retry.structuredContent!.replayed).toBe(true);
    expect(retry.structuredContent!.saved.entry_id).toBe(s1.saved.entry_id);
    expect(await countEntries(a)).toBe(1);

    const second = await call(c, 'log_saved_item', { ...args, request_id: randomUUID() });
    expect(second.structuredContent!.saved.entry_id).not.toBe(s1.saved.entry_id);
    expect(second.structuredContent!.day.remaining.protein_g).toBe(100);
    expect(await countEntries(a)).toBe(2);

    const misuse = await call(c, 'log_saved_item', { ...args, amount: 2, unit: 'scoop', use_default_portion: undefined });
    expect(misuse.isError).toBe(true);
    expect(misuse.content[0].text).toMatch(/already used/);
    expect(await countEntries(a)).toBe(2);
  });

  it('asks for a portion or a choice instead of guessing, and writes nothing', async () => {
    const c = await connect(tokenA);
    const noPortion = await call(c, 'log_saved_item', { request_id: randomUUID(), id: shakeId });
    expect(noPortion.structuredContent!.status).toBe('needs_portion');
    expect(noPortion.structuredContent!.units).toContain('scoop');
    const ambiguous = await call(c, 'log_saved_item', { request_id: randomUUID(), query: 'protein', amount: 1, unit: 'serving' });
    expect(ambiguous.structuredContent!.status).toBe('needs_choice');
    expect(ambiguous.structuredContent!.candidates.length).toBe(2);
    expect(await countEntries(a)).toBe(2);
    // The same request id can be used once the user has answered.
    const rid = randomUUID();
    expect((await call(c, 'log_saved_item', { request_id: rid, id: shakeId })).structuredContent!.status).toBe('needs_portion');
    expect((await call(c, 'log_saved_item', { request_id: rid, id: shakeId })).structuredContent!.status).toBe('needs_portion');
  });

  it('logs a supplied estimate atomically, keeps assumptions and null macros', async () => {
    const c = await connect(tokenB);
    const r = await call(c, 'log_estimate', {
      request_id: randomUUID(),
      meal: 'lunch',
      items: [
        {
          name: 'Подварок',
          amount: 230,
          unit: 'g',
          state: 'cooked',
          kcal: 290,
          protein_g: 14,
          carbs_g: 9,
          fat_g: 22,
          assumptions: 'from photo: ~230 g, pork, 1 tbsp oil',
        },
        { name: 'Kifla', amount: 36, unit: 'g', kcal: 105, protein_g: 3.2, carbs_g: 19, fat_g: null },
      ],
    });
    expect(r.isError).toBeFalsy();
    const s = r.structuredContent!;
    expect(s.saved).toHaveLength(2);
    expect(s.saved[0]).toMatchObject({
      name: 'Подварок',
      is_estimate: true,
      source_label: 'ChatGPT estimate',
      assumptions: 'from photo: ~230 g, pork, 1 tbsp oil',
    });
    expect(s.saved[1].fat_g).toBeNull();
    expect(s.saved[1].unknown_macros).toEqual(['fat_g']);
    expect(s.day.consumed.kcal).toBe(395);
    expect(s.day.remaining.kcal).toBe(1405);
    expect(s.day.incomplete_macros).toEqual(['fat_g']);
  });

  it('reports failures as errors and does not write', async () => {
    const c = await connect(tokenB);
    const before = await countEntries(b);
    const bad = await call(c, 'log_estimate', {
      request_id: randomUUID(),
      date: '2026-02-30',
      items: [{ name: 'x', kcal: 1, protein_g: null, carbs_g: null, fat_g: null }],
    });
    expect(bad.isError).toBe(true);
    expect(await countEntries(b)).toBe(before);
  });

  it('logs weigh-ins and reads the trend', async () => {
    const c = await connect(tokenA);
    const r = await call(c, 'log_weigh_in', { request_id: randomUUID(), weight_kg: 75.4 });
    expect(r.structuredContent!.saved.weight_kg).toBe(75.4);
    const t = await call(c, 'get_weight_trend', {});
    expect(t.structuredContent!.seven_day_average.average_kg).toBe(75.4);
    expect(t.structuredContent!.seven_day_average.sparse).toBe(true);
  });
});

describe('MCP isolation', () => {
  it('each token only sees and writes its own account', async () => {
    const cb = await connect(tokenB);
    const day = (await call(cb, 'get_daily_summary', {})).structuredContent!;
    expect(day.targets.kcal).toBe(1800);
    expect(day.entries.every((e: { name: string }) => e.name !== 'Protein shake (demo label)')).toBe(true);
    const search = (await call(cb, 'search_library', { query: 'shake' })).structuredContent!;
    expect(search.count).toBe(0);
    const steal = await call(cb, 'log_saved_item', { request_id: randomUUID(), id: shakeId, use_default_portion: true });
    expect(steal.isError).toBe(true);
    const trend = (await call(cb, 'get_weight_trend', {})).structuredContent!;
    expect(trend.weigh_ins).toHaveLength(0);
    // An AI-supplied user id is not an accepted argument and cannot redirect a write.
    const sneaky = await call(cb, 'log_estimate', {
      request_id: randomUUID(),
      user_id: a.id,
      items: [{ name: 'Sneaky', kcal: 1, protein_g: null, carbs_g: null, fat_g: null }],
    } as never);
    if (!sneaky.isError) expect(sneaky.structuredContent!.day.targets.kcal).toBe(1800);
    expect(await asUser(a.id, async (tx) => (await tx`select count(*)::int as n from diary_entries where name = 'Sneaky'`)[0].n)).toBe(0);
  });
});

describe('OAuth for remote MCP clients', () => {
  it('registers a client, exchanges a PKCE code, refreshes, and calls MCP as that user', async () => {
    const reg = await fetch(`${BASE}/oauth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client_name: 'Test connector', redirect_uris: ['https://example.test/callback'] }),
    });
    expect(reg.status).toBe(201);
    const { client_id } = await reg.json();
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    // The consent page issues the code for the signed-in user; here we issue it directly.
    const code = await issueCode({
      clientId: client_id,
      userId: b.id,
      redirectUri: 'https://example.test/callback',
      codeChallenge: challenge,
      scope: 'diary',
    });

    const wrong = await fetch(`${BASE}/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id,
        redirect_uri: 'https://example.test/callback',
        code_verifier: 'wrong',
      }),
    });
    expect(wrong.status).toBe(400);
    const code2 = await issueCode({
      clientId: client_id,
      userId: b.id,
      redirectUri: 'https://example.test/callback',
      codeChallenge: challenge,
      scope: 'diary',
    });
    const tok = await fetch(`${BASE}/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code2,
        client_id,
        redirect_uri: 'https://example.test/callback',
        code_verifier: verifier,
      }),
    });
    expect(tok.status).toBe(200);
    const t = await tok.json();
    expect(t.token_type).toBe('Bearer');
    const reuse = await fetch(`${BASE}/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code2,
        client_id,
        redirect_uri: 'https://example.test/callback',
        code_verifier: verifier,
      }),
    });
    expect(reuse.status).toBe(400);

    const c = await connect(t.access_token);
    expect((await call(c, 'get_daily_summary', {})).structuredContent!.targets.kcal).toBe(1800);

    const ref = await fetch(`${BASE}/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: t.refresh_token, client_id }),
    });
    expect(ref.status).toBe(200);
    const t2 = await ref.json();
    expect(t2.access_token).not.toBe(t.access_token);
    const replayRefresh = await fetch(`${BASE}/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: t.refresh_token, client_id }),
    });
    expect(replayRefresh.status).toBe(400);
  });
});
