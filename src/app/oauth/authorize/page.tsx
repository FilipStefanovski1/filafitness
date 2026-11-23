import { redirect } from 'next/navigation';
import { currentUserId } from '@/server/auth';
import { asUser } from '@/server/db';
import { getProfile } from '@/server/services/profile';
import { getClient } from '@/server/oauth/oauth';
import { approve, deny } from './actions';

type SP = Record<string, string | undefined>;

/** OAuth consent: the signed-in person approves an MCP client for their own diary. */
export default async function Authorize({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => typeof v === 'string') as [string, string][]).toString();
  const userId = await currentUserId();
  if (!userId) redirect(`/login?next=${encodeURIComponent(`/oauth/authorize?${qs}`)}`);

  const client = await getClient(sp.client_id ?? '');
  const problem = !client
    ? 'Unknown client. Remove the connector and add it again.'
    : !sp.redirect_uri || !client.redirect_uris.includes(sp.redirect_uri)
      ? 'The redirect address does not match this client.'
      : sp.response_type !== 'code'
        ? 'Unsupported response_type.'
        : !sp.code_challenge || sp.code_challenge_method !== 'S256'
          ? 'PKCE (S256) is required.'
          : null;
  const profile = await asUser(userId, (tx) => getProfile(tx, userId));

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5">
      {problem ? (
        <div className="card p-5">
          <h1 className="h1 mb-2">Can’t connect</h1>
          <p className="text-muted">{problem}</p>
        </div>
      ) : (
        <div className="card space-y-4 p-5">
          <h1 className="text-xl font-bold">Connect {client!.client_name ?? 'an assistant'}?</h1>
          <p className="text-[15px]">
            It will be able to search your saved foods, log food and weigh-ins, and read your daily totals and weight trend, as{' '}
            <b>{profile.display_name}</b>.
          </p>
          <p className="text-[13px] text-muted">It can only reach your own diary. You can disconnect it any time in Settings.</p>
          <form action={approve} className="space-y-2">
            <input type="hidden" name="q" value={qs} />
            <button className="btn-primary w-full">Allow</button>
          </form>
          <form action={deny}>
            <input type="hidden" name="q" value={qs} />
            <button className="btn w-full">Cancel</button>
          </form>
        </div>
      )}
    </main>
  );
}
