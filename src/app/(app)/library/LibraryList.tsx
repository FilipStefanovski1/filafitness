'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { toggleFavoriteAction } from '@/app/actions';
import { useAction } from '@/components/useAction';
import { ErrorText, MacroLine } from '@/components/ui';
import { matchScore } from '@/lib/search';
import { fmtAmount } from '@/lib/nutrition/format';
import type { LibraryItem } from '@/server/services/library';

type T = 'food' | 'meal' | 'recipe';
const PATH: Record<T, string> = { food: 'foods', meal: 'meals', recipe: 'recipes' };

export function LibraryList({ items, initialTab }: { items: Array<LibraryItem & { key: string }>; initialTab: T }) {
  const [tab, setTab] = useState<T>(initialTab);
  const [q, setQ] = useState('');
  const { run, pending, error } = useAction();
  const list = useMemo(
    () =>
      items
        .filter((i) => i.type === tab)
        .map((i) => ({ i, s: q ? matchScore(q, i.key) : 1 }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s || Number(b.i.is_favorite) - Number(a.i.is_favorite) || a.i.name.localeCompare(b.i.name))
        .map((x) => x.i),
    [items, tab, q],
  );
  return (
    <main className="page">
      <header className="mb-3 flex items-center justify-between" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <h1 className="h1">Library</h1>
        <Link href={`/library/${PATH[tab]}/new`} className="btn-ink min-h-11">
          + New {tab}
        </Link>
      </header>
      <div className="mb-3 grid grid-cols-3 gap-1 rounded-xl bg-line/60 p-1" role="tablist">
        {(['food', 'meal', 'recipe'] as T[]).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`min-h-10 rounded-lg text-sm font-semibold capitalize ${tab === t ? 'bg-card shadow-sm' : 'text-muted'}`}
          >
            {t}s ({items.filter((i) => i.type === t).length})
          </button>
        ))}
      </div>
      <input
        type="search"
        className="input mb-3"
        placeholder={`Search ${tab}s… (Latin or Cyrillic)`}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Search library"
      />
      <ErrorText error={error} />
      <ul className="card divide-y divide-line overflow-hidden">
        {list.length === 0 && <li className="p-6 text-center text-sm text-muted">Nothing here yet.</li>}
        {list.map((i) => (
          <li key={i.id} className="flex items-stretch">
            <Link href={`/library/${PATH[i.type]}/${i.id}`} className="min-w-0 flex-1 px-4 py-2.5 active:bg-line/50">
              <div className="flex items-center gap-1.5">
                <span className="truncate font-medium">{i.name}</span>
                {i.is_estimate && <span className="chip-estimate">Estimate</span>}
                {i.source_label?.startsWith('Shared by') && <span className="chip bg-line text-muted">{i.source_label}</span>}
              </div>
              <div className="truncate text-[12px] text-muted">
                {i.type === 'meal'
                  ? i.subtitle.replace('Meal · ', '')
                  : [fmtAmount(i.default_amount, i.default_unit), i.subtitle].filter(Boolean).join(' · ')}
              </div>
              <MacroLine t={i.totals} className="text-[12px]" />
            </Link>
            <button
              aria-label={i.is_favorite ? `Remove ${i.name} from favorites` : `Add ${i.name} to favorites`}
              aria-pressed={i.is_favorite}
              disabled={pending}
              onClick={() => run(() => toggleFavoriteAction({ type: i.type, id: i.id, favorite: !i.is_favorite }))}
              className={`w-14 shrink-0 text-2xl ${i.is_favorite ? 'text-carbs' : 'text-line'}`}
            >
              ★
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
