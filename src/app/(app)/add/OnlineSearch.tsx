'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { importOnlineFoodAction } from '@/app/actions';
import { useAction } from '@/components/useAction';
import { ErrorText } from '@/components/ui';
import { fmtGrams, fmtKcal } from '@/lib/nutrition/format';

interface Hit {
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

/** Search Open Food Facts and save a result to your library before logging it. */
export function OnlineSearch({ q, qs, auto }: { q: string; qs: string; auto: boolean }) {
  const router = useRouter();
  const { run, pending, error } = useAction();
  const [state, setState] = useState<{ q: string; loading: boolean; items: Hit[]; error: string | null } | null>(null);

  async function search(query: string) {
    setState({ q: query, loading: true, items: [], error: null });
    try {
      const r = await fetch(`/api/food-search?q=${encodeURIComponent(query)}`);
      const j = await r.json();
      setState({ q: query, loading: false, items: j.items ?? [], error: r.ok ? null : j.error });
    } catch {
      setState({ q: query, loading: false, items: [], error: 'You seem to be offline.' });
    }
  }
  useEffect(() => {
    if (!auto || q.trim().length < 2) return;
    const t = setTimeout(() => search(q.trim()), 450);
    return () => clearTimeout(t);
  }, [q, auto]);

  if (!q.trim()) return null;
  const fresh = state?.q === q.trim();
  return (
    <section className="mt-4">
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 className="section-title">Online · Open Food Facts</h2>
        {!auto && !fresh && (
          <button className="text-sm font-semibold text-accent" onClick={() => search(q.trim())}>
            Search “{q.trim()}”
          </button>
        )}
      </div>
      {fresh && state.loading && <div className="card p-4 text-center text-sm text-muted">Searching…</div>}
      {fresh && state.error && <ErrorText error={state.error} />}
      <ErrorText error={error} />
      {fresh && !state.loading && !state.error && state.items.length === 0 && (
        <div className="card p-4 text-center text-sm text-muted">No online results. Create the food from its label instead.</div>
      )}
      {fresh && state.items.length > 0 && (
        <ul className="card divide-y divide-line overflow-hidden">
          {state.items.map((h) => (
            <li key={h.code} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{h.name}</div>
                <div className="truncate text-[12px] text-muted">
                  {[h.brand, h.serving_label && `serving ${h.serving_label}`].filter(Boolean).join(' · ')}
                </div>
                <div className="text-[12px] text-muted">
                  per 100 g: <b className="text-ink">{fmtKcal(h.kcal)}</b> kcal ·{' '}
                  <span className="text-protein">P {fmtGrams(h.protein_g)}</span> · C {fmtGrams(h.carbs_g)} · F {fmtGrams(h.fat_g)}
                </div>
              </div>
              <button
                className="btn min-h-10 shrink-0 px-3 text-sm"
                disabled={pending}
                onClick={() =>
                  run(
                    () => importOnlineFoodAction(h),
                    (id) => router.push(`/log/food/${id}?${qs}`),
                  )
                }
              >
                Add
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1.5 px-1 text-[11px] text-muted">Community data. Check it against the label; you can edit the food after saving.</p>
    </section>
  );
}
