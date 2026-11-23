import { LoginForm } from './LoginForm';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  const next = sp.next?.startsWith('/') && !sp.next.startsWith('//') ? sp.next : '/';
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5">
      <div className="mb-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/192.png" alt="" width={56} height={56} className="mb-4 rounded-2xl shadow-lg shadow-accent/25" />
        <h1 className="text-3xl font-bold tracking-tight">FilaFitness</h1>
        <p className="mt-1 text-muted">Private calorie and protein diary. Invite only.</p>
      </div>
      <LoginForm next={next} initialError={sp.error ?? null} />
    </main>
  );
}
