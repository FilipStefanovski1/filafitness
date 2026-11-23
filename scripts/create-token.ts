/**
 * Create a personal MCP token for an account (for clients that accept a bearer header,
 * e.g. Claude Code or MCP Inspector). The same can be done in the app under Settings.
 *
 *   npm run token -- --email you@example.com --name "Claude Code" [--env .env.production.local]
 */
import { config } from 'dotenv';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: { email: { type: 'string' }, name: { type: 'string' }, env: { type: 'string' } } });
config({ path: values.env ?? '.env.local' });

async function main() {
  const { asUser, closeDb, privileged } = await import('../src/server/db');
  const { createPersonalToken } = await import('../src/server/services/tokens');
  if (!values.email) throw new Error('Usage: npm run token -- --email you@example.com [--name "Claude Code"]');
  const [u] = await privileged()<{ id: string }[]>`select id from auth.users where lower(email) = lower(${values.email})`;
  if (!u) throw new Error(`No account for ${values.email}`);
  const t = await asUser(u.id, (tx) => createPersonalToken(tx, values.name ?? 'MCP client'));
  console.log(t.token);
  await closeDb();
}
main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
