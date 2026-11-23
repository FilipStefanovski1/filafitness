'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { importOnlineFoodAction } from '@/app/actions';
import { useAction } from '@/components/useAction';
import { ErrorText, Header } from '@/components/ui';
import { fmtGrams, fmtKcal } from '@/lib/nutrition/format';
import type { Slot } from '@/lib/nutrition/types';

interface Online {
  code: string;
  name: string;
  brand: string | null;
  kcal: number;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  serving_g: number | null;
  serving_label: string | null;
}
type Detector = { detect: (src: HTMLVideoElement) => Promise<Array<{ rawValue: string }>> };
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];

async function makeDetector(): Promise<Detector> {
  const Native = (
    globalThis as { BarcodeDetector?: { new (o: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> } }
  ).BarcodeDetector;
  if (Native) {
    const supported = (await Native.getSupportedFormats?.().catch(() => [])) ?? [];
    if (supported.includes('ean_13')) return new Native({ formats: FORMATS });
  }
  // iPhone Safari and others: ZXing WebAssembly, served from this site.
  const { BarcodeDetector, prepareZXingModule } = await import('barcode-detector/ponyfill');
  prepareZXingModule({
    overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? `/zxing/${path}` : prefix + path) },
  });
  return new BarcodeDetector({ formats: FORMATS as never[] }) as unknown as Detector;
}

export function Scanner({ date, slot }: { date: string; slot: Slot }) {
  const router = useRouter();
  const qs = `date=${date}&slot=${slot}`;
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<'starting' | 'scanning' | 'found' | 'denied' | 'unsupported'>('starting');
  const [code, setCode] = useState('');
  const [result, setResult] = useState<{ online?: Online; notFound?: boolean; error?: string } | null>(null);
  const [looking, setLooking] = useState(false);
  const { run, pending, error } = useAction();

  const stop = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }, []);

  const lookup = useCallback(
    async (c: string) => {
      setLooking(true);
      setResult(null);
      try {
        const r = await fetch(`/api/barcode?code=${c}`);
        const j = await r.json();
        if (j.own) return router.push(`/log/food/${j.own.id}?${qs}`);
        if (j.online) setResult({ online: j.online });
        else setResult(r.status === 404 ? { notFound: true } : { error: j.error ?? 'Lookup failed' });
      } catch {
        setResult({ error: 'You seem to be offline.' });
      } finally {
        setLooking(false);
      }
    },
    [router, qs],
  );

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) return setStatus('unsupported');
      try {
        stream.current = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
          audio: false,
        });
      } catch {
        return setStatus('denied');
      }
      if (cancelled || !video.current) return stop();
      video.current.srcObject = stream.current;
      await video.current.play().catch(() => undefined);
      let detector: Detector;
      try {
        detector = await makeDetector();
      } catch {
        stop();
        return setStatus('unsupported');
      }
      setStatus('scanning');
      const tick = async () => {
        if (cancelled || !video.current) return;
        try {
          const found = await detector.detect(video.current);
          const hit = found.find((b) => /^\d{8,14}$/.test(b.rawValue));
          if (hit) {
            navigator.vibrate?.(60);
            setCode(hit.rawValue);
            setStatus('found');
            stop();
            lookup(hit.rawValue);
            return;
          }
        } catch {
          /* frame not ready */
        }
        timer = setTimeout(tick, 220);
      };
      tick();
    })();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      stop();
    };
  }, [lookup, stop]);

  const o = result?.online;
  return (
    <main className="page">
      <Header title="Scan barcode" back={`/add?${qs}`} />
      {(status === 'starting' || status === 'scanning') && (
        <div className="relative mb-4 aspect-[4/3] overflow-hidden rounded-2xl bg-ink">
          <video ref={video} className="h-full w-full object-cover" playsInline muted aria-label="Camera preview" />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-28 w-4/5 rounded-xl border-2 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
          </div>
          <p className="absolute inset-x-0 bottom-3 text-center text-sm font-medium text-white">
            {status === 'starting' ? 'Starting camera…' : 'Point at the barcode'}
          </p>
        </div>
      )}
      {status === 'denied' && (
        <p className="mb-4 rounded-xl bg-warn-bg px-3 py-2 text-sm text-warn">
          Camera access was blocked. Allow it in your browser settings, or type the number below.
        </p>
      )}
      {status === 'unsupported' && (
        <p className="mb-4 rounded-xl bg-warn-bg px-3 py-2 text-sm text-warn">
          This browser can’t scan with the camera. Type the barcode number below.
        </p>
      )}

      {looking && <div className="card mb-4 p-4 text-center text-sm text-muted">Looking up {code}…</div>}
      {result?.error && <ErrorText error={result.error} />}
      {result?.notFound && (
        <div className="card mb-4 space-y-3 p-4">
          <p className="font-semibold">{code} isn’t in Open Food Facts yet.</p>
          <Link href={`/library/foods/new?log=1&barcode=${code}&${qs}`} className="btn-primary w-full">
            Enter the label
          </Link>
        </div>
      )}
      {o && (
        <div className="card mb-4 space-y-3 p-4">
          <div>
            <div className="text-lg font-bold">{o.name}</div>
            <div className="text-sm text-muted">
              {[o.brand, o.serving_label && `serving ${o.serving_label}`, o.code].filter(Boolean).join(' · ')}
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2 rounded-xl bg-paper p-3 text-center text-sm">
            <Stat label="kcal" value={fmtKcal(o.kcal)} />
            <Stat label="Protein" value={`${fmtGrams(o.protein_g)} g`} />
            <Stat label="Carbs" value={`${fmtGrams(o.carbs_g)} g`} />
            <Stat label="Fat" value={`${fmtGrams(o.fat_g)} g`} />
          </div>
          <p className="text-[12px] text-muted">Per 100 g from Open Food Facts. Check it against the package.</p>
          <ErrorText error={error} />
          <button
            className="btn-primary w-full"
            disabled={pending}
            onClick={() =>
              run(
                () => importOnlineFoodAction(o),
                (id) => router.push(`/log/food/${id}?${qs}`),
              )
            }
          >
            Save and choose portion
          </button>
          <Link href={`/library/foods/new?log=1&barcode=${code}&${qs}`} className="btn w-full">
            Enter the label myself
          </Link>
        </div>
      )}

      <form
        className="card flex gap-2 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (/^\d{8,14}$/.test(code)) {
            stop();
            setStatus('found');
            lookup(code);
          }
        }}
      >
        <input
          aria-label="Barcode number"
          className="input"
          inputMode="numeric"
          placeholder="Or type the barcode number"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 14))}
        />
        <button className="btn-ink shrink-0" disabled={!/^\d{8,14}$/.test(code) || looking}>
          Look up
        </button>
      </form>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-bold">{value}</div>
      <div className="text-[11px] text-muted">{label}</div>
    </div>
  );
}
