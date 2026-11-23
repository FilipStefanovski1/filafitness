'use client';
import { useState } from 'react';

export interface BarcodeResult {
  name: string;
  brand: string;
  kcal: number;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
}

export function BarcodeLookup({ barcode, onResult }: { barcode: string; onResult: (r: BarcodeResult) => void }) {
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle');
  const [msg, setMsg] = useState<string | null>(null);
  if (barcode.length < 8) return null;
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className="btn min-h-10 text-sm"
        disabled={state === 'loading'}
        onClick={async () => {
          setState('loading');
          setMsg(null);
          const r = await fetch(`/api/barcode?code=${barcode}`);
          const j = await r.json();
          setState('done');
          if (!r.ok) return setMsg(j.error);
          onResult(j);
          setMsg('Filled from Open Food Facts (per 100 g). Check it against the label.');
        }}
      >
        {state === 'loading' ? 'Looking up…' : 'Look up barcode'}
      </button>
      {msg && <span className="text-[12px] text-muted">{msg}</span>}
    </div>
  );
}
