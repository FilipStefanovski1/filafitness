'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { ErrorText } from '@/components/ui';

export function SetPassword() {
  const router = useRouter();
  const [pw, setPw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (pw.length < 8) return setError('Use at least 8 characters.');
        setPending(true);
        const { error } = await supabaseBrowser().auth.updateUser({ password: pw });
        setPending(false);
        if (error) return setError(error.message);
        router.push('/onboarding');
      }}
    >
      <label className="label" htmlFor="pw">
        New password
      </label>
      <input
        id="pw"
        type="password"
        autoComplete="new-password"
        className="input"
        value={pw}
        onChange={(e) => setPw(e.target.value)}
        minLength={8}
        required
      />
      <ErrorText error={error} />
      <button className="btn-primary w-full" disabled={pending}>
        {pending ? 'Saving…' : 'Save password'}
      </button>
    </form>
  );
}
