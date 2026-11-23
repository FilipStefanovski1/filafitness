'use client';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { ErrorText } from '@/components/ui';

export function LoginForm({ next, initialError }: { next: string; initialError: string | null }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(initialError);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email, password });
    setPending(false);
    if (error) return setError(error.message === 'Invalid login credentials' ? 'Wrong email or password.' : error.message);
    window.location.assign(next);
  }

  async function magicLink() {
    if (!email) return setError('Enter your email first.');
    setPending(true);
    setError(null);
    const { error } = await supabaseBrowser().auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false, emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    setPending(false);
    if (error) return setError(error.message);
    setInfo('Check your email for a sign-in link.');
  }

  return (
    <form className="space-y-3" onSubmit={signIn}>
      <div>
        <label className="label" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          className="input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <div>
        <label className="label" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          className="input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>
      <ErrorText error={error} />
      {info && <p className="rounded-xl bg-good/10 px-3 py-2 text-sm font-medium text-good">{info}</p>}
      <button className="btn-primary w-full" disabled={pending}>
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
      <button type="button" className="btn-ghost w-full text-sm" disabled={pending} onClick={magicLink}>
        Email me a sign-in link instead
      </button>
      <p className="pt-4 text-center text-[12px] text-muted">No account? Ask for an invite. There is no public sign-up.</p>
    </form>
  );
}
