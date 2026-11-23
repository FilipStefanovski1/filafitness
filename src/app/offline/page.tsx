export const dynamic = 'force-static';

export default function Offline() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center px-6 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/192.png" alt="" width={72} height={72} className="mb-5 rounded-2xl" />
      <h1 className="h1">You’re offline</h1>
      <p className="mt-2 text-muted">FilaFitness needs a connection to load and save your diary. Nothing you saved earlier is lost.</p>
      {/* A full page load on purpose: it must hit the network again. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/" className="btn-primary mt-6 w-full">
        Try again
      </a>
    </main>
  );
}
