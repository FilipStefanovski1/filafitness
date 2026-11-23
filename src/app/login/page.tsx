import { LoginForm } from './LoginForm';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  const next = sp.next?.startsWith('/') && !sp.next.startsWith('//') ? sp.next : '/';
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5">
      <div className="mb-8">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-xl font-black text-white">
          F.
        </div>
        <h1 className="text-3xl font-bold tracking-tight">FilaFitness</h1>
        <p className="mt-1 text-muted">Private calorie and protein diary. Invite only.</p>
      </div>
      <LoginForm next={next} initialError={sp.error ?? null} />
    </main>
  );
}
