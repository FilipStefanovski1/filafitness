import Link from 'next/link';
import { headers } from 'next/headers';
import { requireUser } from '@/server/auth';
import { asUser } from '@/server/db';
import { listTokens } from '@/server/services/tokens';
import { listShares } from '@/server/services/shares';
import { todayIn } from '@/lib/dates';
import { ProfileForm } from '@/components/ProfileForm';
import { McpTokens } from './McpTokens';
import { SharesInbox } from './SharesInbox';
import { DataTools } from './DataTools';

export default async function SettingsPage() {
  const { userId, profile } = await requireUser();
  const h = await headers();
  const origin = process.env.APP_URL?.replace(/\/$/, '') ?? `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host')}`;
  const { tokens, shares } = await asUser(userId, async (tx) => ({ tokens: await listTokens(tx), shares: await listShares(tx, userId) }));
  const pending = shares.incoming.filter((s) => s.status === 'pending');
  return (
    <main className="page space-y-6">
      <header style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <h1 className="h1">Settings</h1>
      </header>

      {pending.length > 0 && (
        <SharesInbox
          shares={pending.map((s) => ({
            id: s.id,
            type: s.item_type,
            name: s.item_name,
            from: s.payload.sender_name,
            at: s.created_at.toISOString(),
          }))}
        />
      )}

      <section className="card p-4">
        <h2 className="section-title mb-3">Goals</h2>
        <ProfileForm initial={profile} today={todayIn(profile.timezone)} />
      </section>

      <McpTokens
        mcpUrl={`${origin}/api/mcp`}
        tokens={tokens.map((t) => ({
          id: t.id,
          name: t.name,
          kind: t.kind,
          prefix: t.token_prefix,
          last_used: t.last_used_at?.toISOString() ?? null,
          created: t.created_at.toISOString(),
        }))}
      />

      <DataTools />

      <section className="card divide-y divide-line">
        <Link href="/history" className="flex min-h-12 items-center justify-between px-4">
          Weekly averages <span className="text-muted">›</span>
        </Link>
        <Link href="/copy" className="flex min-h-12 items-center justify-between px-4">
          Copy or save entries as a meal <span className="text-muted">›</span>
        </Link>
        {shares.outgoing.length > 0 && (
          <div className="px-4 py-3 text-sm">
            <div className="mb-1 font-semibold">Sent</div>
            {shares.outgoing.slice(0, 5).map((s) => (
              <div key={s.id} className="text-muted">
                {s.item_name} ({s.item_type}) · {s.status}
              </div>
            ))}
          </div>
        )}
        <form action="/auth/signout" method="post">
          <button className="flex min-h-12 w-full items-center px-4 text-left font-semibold text-warn">Sign out</button>
        </form>
      </section>
    </main>
  );
}
