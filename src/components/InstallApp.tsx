'use client';
import { useEffect, useState, useSyncExternalStore } from 'react';

const noop = () => () => undefined;

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** "Install app" card: native prompt on Android/desktop Chrome, instructions on iPhone. */
export function InstallApp() {
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  const [justInstalled, setInstalled] = useState(false);
  const standalone = useSyncExternalStore(
    noop,
    () => window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true,
    () => false,
  );
  const ios = useSyncExternalStore(
    noop,
    () => /iphone|ipad|ipod/i.test(navigator.userAgent),
    () => false,
  );
  const installed = standalone || justInstalled;
  useEffect(() => {
    const h = (e: Event) => {
      e.preventDefault();
      setEvt(e as BIPEvent);
    };
    window.addEventListener('beforeinstallprompt', h);
    window.addEventListener('appinstalled', () => setInstalled(true));
    return () => window.removeEventListener('beforeinstallprompt', h);
  }, []);
  if (installed) return null;
  return (
    <section className="card flex items-center gap-4 p-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/192.png" alt="" width={52} height={52} className="rounded-xl" />
      <div className="min-w-0 flex-1">
        <div className="font-semibold">Install FilaFitness</div>
        <div className="text-[13px] text-muted">
          {evt
            ? 'Open it from your home screen like an app.'
            : ios
              ? 'In Safari tap Share, then “Add to Home Screen”.'
              : 'Use your browser menu → “Install app” / “Add to Home screen”.'}
        </div>
      </div>
      {evt && (
        <button
          className="btn-primary min-h-11 shrink-0 px-4"
          onClick={async () => {
            await evt.prompt();
            setEvt(null);
          }}
        >
          Install
        </button>
      )}
    </section>
  );
}
