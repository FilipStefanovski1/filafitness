'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { quickLogAction, copyEntriesAction } from '@/app/actions';
import { useAction } from '@/components/useAction';
import { ErrorText, Header, MacroLine } from '@/components/ui';
import { SlotPicker } from '@/components/SlotPicker';
import { matchScore } from '@/lib/search';
import { fmtAmount, fmtKcal } from '@/lib/nutrition/format';
import type { LibraryItem } from '@/server/services/library';
import type { Slot } from '@/lib/nutrition/types';

type Item = LibraryItem & { key: string };
type Tab = 'recent' | 'favorites' | 'all';

export function AddFood(props: {
  date: string;
  slot: Slot;
  items: Item[];
  recent: string[];
  oneOffs: { id: string; name: string; kcal: number; local_date: string; is_estimate: boolean }[];
  initialTab: 'recent' | 'favorites';
}) {
  const [slot, setSlot] = useState<Slot>(props.slot);
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<Tab>(props.recent.length ? props.initialTab : 'favorites');
  const [logged, setLogged] = useState<string[]>([]);
  const { run, pending, error } = useAction();
  const qs = `date=${props.date}&slot=${slot}`;

  const byKey = useMemo(() => new Map(props.items.map((i) => [`${i.type}:${i.id}`, i])), [props.items]);
  const list: Item[] = useMemo(() => {
    if (q.trim())
      return props.items
        .map((i) => {
          const m = matchScore(q, i.key);
          return { i, s: m && m + (i.is_favorite ? 5 : 0) + (props.recent.includes(`${i.type}:${i.id}`) ? 3 : 0) };
        })
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s || a.i.name.localeCompare(b.i.name))
        .map((x) => x.i);
    if (tab === 'recent') return props.recent.map((k) => byKey.get(k)).filter(Boolean) as Item[];
    if (tab === 'favorites') return props.items.filter((i) => i.is_favorite);
    return [...props.items].sort((a, b) => a.name.localeCompare(b.name));
  }, [q, tab, props.items, props.recent, byKey]);

  const logDefault = (i: Item) =>
    run(
      () => quickLogAction({ type: i.type, id: i.id, date: props.date, slot }),
      (d) => setLogged((l) => [`${d.name} · ${fmtKcal(d.kcal)} kcal`, ...l].slice(0, 3)),
    );

  return (
    <main className="page">
      <Header title="Add food" back={`/?date=${props.date}`} />
      <SlotPicker value={slot} onChange={setSlot} />

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Link href={`/estimate?${qs}`} className="btn h-auto flex-col gap-0.5 px-2 py-2 text-[13px] leading-tight">
          <span aria-hidden className="text-lg">
            ✦
          </span>
          Paste GPT estimate
        </Link>
        <Link href={`/quick?${qs}`} className="btn h-auto flex-col gap-0.5 px-2 py-2 text-[13px] leading-tight">
          <span aria-hidden className="text-lg">
            ⚡
          </span>
          Quick add
        </Link>
        <Link href={`/library/foods/new?log=1&${qs}`} className="btn h-auto flex-col gap-0.5 px-2 py-2 text-[13px] leading-tight">
          <span aria-hidden className="text-lg">
            ＋
          </span>
          New food
        </Link>
      </div>

      <div className="relative mt-3">
        <input
          type="search"
          className="input pl-10"
          placeholder="Search foods, meals, recipes…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search saved foods, meals and recipes"
          enterKeyHint="search"
        />
        <svg
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-4-4" />
        </svg>
      </div>

      {!q && (
        <div className="mt-3 flex gap-1 rounded-xl bg-line/60 p-1" role="tablist">
          {(['recent', 'favorites', 'all'] as Tab[]).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`min-h-10 flex-1 rounded-lg text-sm font-semibold capitalize ${tab === t ? 'bg-card shadow-sm' : 'text-muted'}`}
            >
              {t === 'all' ? 'All saved' : t}
            </button>
          ))}
        </div>
      )}

      <div className="mt-2 space-y-2" aria-live="polite">
        {logged.map((l, i) => (
          <div key={i} className="flex items-center justify-between rounded-xl bg-good/10 px-3 py-2 text-sm font-medium text-good">
            <span>✓ Logged {l}</span>
            {i === 0 && (
              <Link href={`/?date=${props.date}`} className="font-semibold underline">
                View day
              </Link>
            )}
          </div>
        ))}
        <ErrorText error={error} />
      </div>

      <ul className="card mt-2 divide-y divide-line overflow-hidden">
        {list.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-muted">
            {q ? (
              <>
                No saved match for “{q}”.{' '}
                <Link className="font-semibold text-accent" href={`/quick?${qs}&name=${encodeURIComponent(q)}`}>
                  Quick add it
                </Link>{' '}
                or{' '}
                <Link className="font-semibold text-accent" href={`/estimate?${qs}`}>
                  paste an estimate
                </Link>
                .
              </>
            ) : tab === 'recent' ? (
              'Nothing logged yet. Search, or create a food.'
            ) : tab === 'favorites' ? (
              'No favorites yet. Star items in your Library.'
            ) : (
              <>
                Your library is empty.{' '}
                <Link className="font-semibold text-accent" href="/settings#starter">
                  Import starter foods
                </Link>{' '}
                or create one.
              </>
            )}
          </li>
        )}
        {list.map((i) => (
          <li key={`${i.type}:${i.id}`} className="flex items-stretch">
            <Link href={`/log/${i.type}/${i.id}?${qs}`} className="min-w-0 flex-1 px-4 py-2.5 active:bg-line/50">
              <div className="flex items-center gap-1.5">
                <span className="truncate font-medium">{i.name}</span>
                {i.is_favorite && (
                  <span aria-label="favorite" className="text-carbs">
                    ★
                  </span>
                )}
                {i.is_estimate && <span className="chip-estimate">Estimate</span>}
                {i.type !== 'food' && <span className="chip bg-line text-muted">{i.type}</span>}
              </div>
              <div className="truncate text-[12px] text-muted">
                {i.type === 'meal'
                  ? i.subtitle.replace('Meal · ', '')
                  : `${fmtAmount(i.default_amount, i.default_unit)}${i.subtitle ? ` · ${i.subtitle}` : ''}`}
              </div>
              <MacroLine t={i.totals} className="text-[12px]" />
            </Link>
            <button
              onClick={() => logDefault(i)}
              disabled={pending}
              aria-label={`Log ${i.name}, ${i.type === 'meal' ? 'usual meal' : fmtAmount(i.default_amount, i.default_unit)}`}
              className="flex w-16 shrink-0 items-center justify-center border-l border-line text-accent active:bg-line/50 disabled:opacity-40"
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <circle cx="12" cy="12" r="9.5" />
                <path d="M12 8v8M8 12h8" />
              </svg>
            </button>
          </li>
        ))}
      </ul>

      {!q && tab === 'recent' && props.oneOffs.length > 0 && (
        <section className="mt-5">
          <h2 className="section-title mb-2 px-1">Recent one-offs</h2>
          <ul className="card divide-y divide-line">
            {props.oneOffs.map((o) => (
              <li key={o.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">
                    {o.name} {o.is_estimate && <span className="chip-estimate">Estimate</span>}
                  </div>
                  <div className="text-[12px] text-muted">
                    {fmtKcal(o.kcal)} kcal · {o.local_date}
                  </div>
                </div>
                <button
                  className="btn min-h-10 px-3 text-sm"
                  disabled={pending}
                  onClick={() =>
                    run(
                      () => copyEntriesAction({ ids: [o.id], date: props.date, slot }),
                      () => setLogged((l) => [`${o.name} · ${fmtKcal(o.kcal)} kcal`, ...l].slice(0, 3)),
                    )
                  }
                >
                  Log again
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
